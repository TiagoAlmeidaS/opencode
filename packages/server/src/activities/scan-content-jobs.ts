import { ulid } from "ulid"
import { eq, and } from "drizzle-orm"
import { oppOpportunities } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"

interface ScanContentJobsInput {
  platforms?: Array<"problogger" | "weworkremotely">
  limit?: number
}

interface RSSJob {
  title: string
  link: string
  description: string
  pubDate: string
}

function parseRSSItems(xml: string): RSSJob[] {
  const items: RSSJob[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  let match: RegExpExecArray | null

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]
    const get = (tag: string) => {
      const m = block.match(
        new RegExp(
          `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`,
        ),
      )
      return m ? (m[1] ?? m[2] ?? "").trim() : ""
    }

    const title = get("title")
    const link = get("link")
    const pubDate = get("pubDate")
    const description = get("description").replace(/<[^>]+>/g, "").slice(0, 2000)

    if (title && link) {
      items.push({ title, link, description, pubDate })
    }
  }
  return items
}

const CONTENT_KEYWORDS = [
  "writer",
  "writing",
  "copy",
  "content",
  "blog",
  "article",
  "script",
  "editorial",
  "copywriting",
  "roteiro",
]

function isContentRelevant(text: string): boolean {
  const lower = text.toLowerCase()
  return CONTENT_KEYWORDS.some((kw) => lower.includes(kw))
}

async function fetchProBlogger(limit: number): Promise<RSSJob[]> {
  const urls = [
    "https://feeds.feedblitz.com/ProBlogger/Jobs",
    "https://feeds.feedblitz.com/Problogger/Jobs",
  ]
  for (const url of urls) {
    const res = await fetch(url, {
      headers: { "User-Agent": "opencode-server/1.0", Accept: "application/rss+xml" },
    })
    if (!res.ok) continue
    const xml = await res.text()
    return parseRSSItems(xml).slice(0, limit)
  }
  return []
}

async function fetchWWRContent(limit: number): Promise<RSSJob[]> {
  const categories = [
    "https://weworkremotely.com/categories/remote-copywriting-jobs.rss",
    "https://weworkremotely.com/categories/remote-content-creation-jobs.rss",
  ]
  const all: RSSJob[] = []
  for (const url of categories) {
    const res = await fetch(url, {
      headers: { "User-Agent": "opencode-server/1.0", Accept: "application/rss+xml" },
    })
    if (!res.ok) continue
    const xml = await res.text()
    const items = parseRSSItems(xml)
    for (const item of items) {
      if (isContentRelevant(`${item.title} ${item.description}`)) {
        all.push(item)
      }
    }
  }
  return all.slice(0, limit)
}

export const scanContentJobsActivity: Activity = {
  type: "scan-content-jobs",
  displayName: "Scan Content Jobs",
  description: "Busca oportunidades de criação de texto, copywriting e roteiro em ProBlogger e WeWorkRemotely",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as ScanContentJobsInput
    const platforms = input.platforms ?? ["problogger", "weworkremotely"]
    const limit = input.limit ?? 30

    const now = Math.floor(Date.now() / 1000)
    let found = 0
    let created = 0
    let enqueued = 0

    if (platforms.includes("problogger")) {
      try {
        const jobs = await fetchProBlogger(limit)
        for (const job of jobs) {
          found++
          const externalId = job.link.replace(/^https?:\/\/[^/]+/, "").slice(0, 200)

          const [existing] = await ctx.db
            .select({ id: oppOpportunities.id })
            .from(oppOpportunities)
            .where(
              and(
                eq(oppOpportunities.sourcePlatform, "problogger"),
                eq(oppOpportunities.externalId, externalId),
              ),
            )
            .limit(1)

          if (existing) {
            await ctx.db
              .update(oppOpportunities)
              .set({ lastSeenAt: now, updatedAt: now })
              .where(eq(oppOpportunities.id, existing.id))
            continue
          }

          const id = ulid()
          await ctx.db.insert(oppOpportunities).values({
            id,
            type: "content",
            sourcePlatform: "problogger",
            externalId,
            title: job.title,
            description: job.description.slice(0, 2000),
            url: job.link,
            rewardCurrency: "USD",
            rewardType: "tip",
            status: "new",
            firstSeenAt: now,
            lastSeenAt: now,
            createdAt: now,
            updatedAt: now,
          })
          created++
          await ctx.enqueue("score-opportunity", { opportunity_id: id }, { priority: 7 })
          enqueued++
        }
      } catch (err) {
        console.error("[scan-content-jobs] ProBlogger error:", err)
      }
    }

    if (platforms.includes("weworkremotely")) {
      try {
        const jobs = await fetchWWRContent(limit)
        for (const job of jobs) {
          found++
          const externalId = job.link.replace(/^https?:\/\/weworkremotely\.com/, "")

          const [existing] = await ctx.db
            .select({ id: oppOpportunities.id })
            .from(oppOpportunities)
            .where(
              and(
                eq(oppOpportunities.sourcePlatform, "weworkremotely-content"),
                eq(oppOpportunities.externalId, externalId),
              ),
            )
            .limit(1)

          if (existing) {
            await ctx.db
              .update(oppOpportunities)
              .set({ lastSeenAt: now, updatedAt: now })
              .where(eq(oppOpportunities.id, existing.id))
            continue
          }

          const id = ulid()
          await ctx.db.insert(oppOpportunities).values({
            id,
            type: "content",
            sourcePlatform: "weworkremotely-content",
            externalId,
            title: job.title,
            description: job.description.slice(0, 2000),
            url: job.link,
            rewardCurrency: "USD",
            rewardType: "tip",
            status: "new",
            firstSeenAt: now,
            lastSeenAt: now,
            createdAt: now,
            updatedAt: now,
          })
          created++
          await ctx.enqueue("score-opportunity", { opportunity_id: id }, { priority: 7 })
          enqueued++
        }
      } catch (err) {
        console.error("[scan-content-jobs] WeWorkRemotely content error:", err)
      }
    }

    return {
      summary: `Content jobs: ${found} relevantes, ${created} novos, ${enqueued} para scoring`,
      extra: { found, created, enqueued, platforms },
    }
  },
}
