import { ulid } from "ulid"
import { eq, and } from "drizzle-orm"
import { oppOpportunities } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"

interface ScanFreelanceJobsInput {
  platforms?: Array<"remoteok" | "weworkremotely">
  tags?: string[]
  categories?: string[]  // WWR: remote-programming-jobs, remote-copywriting-jobs
  limit?: number
}

interface RemoteOKJob {
  id?: string
  slug?: string
  company?: string
  position?: string
  description?: string
  url?: string
  tags?: string[]
  salary_min?: number
  salary_max?: number
  date?: string
}

interface WWRJob {
  title: string
  link: string
  description: string
  pubDate: string
  company?: string
}

async function fetchRemoteOK(tags: string[], limit: number): Promise<RemoteOKJob[]> {
  const tag = tags[0] ?? "ai"
  const res = await fetch(`https://remoteok.com/api?tag=${encodeURIComponent(tag)}`, {
    headers: { "User-Agent": "opencode-server/1.0", Accept: "application/json" },
  })
  if (!res.ok) throw new Error(`RemoteOK error: ${res.status}`)
  const data = (await res.json()) as RemoteOKJob[]
  // Primeiro item é metadata, remover
  return data.filter((d) => d.id || d.slug).slice(0, limit)
}

// Parse RSS simples sem biblioteca externa
function parseRSSItems(xml: string): WWRJob[] {
  const items: WWRJob[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  let match: RegExpExecArray | null

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]
    const get = (tag: string) => {
      const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`))
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

async function fetchWeWorkRemotely(category: string, limit: number): Promise<WWRJob[]> {
  const url = `https://weworkremotely.com/categories/${category}.rss`
  const res = await fetch(url, {
    headers: { "User-Agent": "opencode-server/1.0" },
  })
  if (!res.ok) throw new Error(`WWR error: ${res.status}`)
  const xml = await res.text()
  return parseRSSItems(xml).slice(0, limit)
}

const AI_KEYWORDS = [
  "ai", "llm", "gpt", "claude", "openai", "anthropic", "langchain",
  "machine learning", "ml", "nlp", "agent", "chatbot", "embedding",
  "typescript", "node", "bun", "cli", "automation", "developer tools",
]

const CONTENT_KEYWORDS = [
  "writer", "writing", "copy", "content", "blog", "article", "script",
  "editorial", "copywriting", "roteiro", "technical writing",
]

const CONTENT_CATEGORIES = ["remote-copywriting-jobs", "remote-content-creation-jobs"]

function isRelevant(text: string): boolean {
  const lower = text.toLowerCase()
  return AI_KEYWORDS.some((kw) => lower.includes(kw))
}

function isContentRelevant(text: string): boolean {
  const lower = text.toLowerCase()
  return CONTENT_KEYWORDS.some((kw) => lower.includes(kw))
}

export const scanFreelanceJobsActivity: Activity = {
  type: "scan-freelance-jobs",
  displayName: "Scan Freelance Jobs",
  description: "Busca vagas remotas de programação em RemoteOK e We Work Remotely",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as ScanFreelanceJobsInput
    const platforms = input.platforms ?? ["remoteok", "weworkremotely"]
    const tags = input.tags ?? ["ai", "developer", "typescript", "node"]
    const categories = input.categories ?? ["remote-programming-jobs"]
    const limit = input.limit ?? 30

    const now = Math.floor(Date.now() / 1000)
    let found = 0
    let created = 0
    let enqueued = 0

    const isContentMode = tags.some((t) =>
      ["writing", "copywriting", "content", "blog", "technical writing"].includes(t.toLowerCase()),
    )

    // --- RemoteOK ---
    if (platforms.includes("remoteok")) {
      try {
        const jobs = await fetchRemoteOK(tags, limit)
        const relevant = isContentMode ? isContentRelevant : isRelevant
        const oppType = isContentMode ? "content" : "freelance"

        for (const job of jobs) {
          const text = `${job.position ?? ""} ${(job.description ?? "").slice(0, 500)}`
          if (!relevant(text)) continue

          found++
          const externalId = String(job.id ?? job.slug ?? job.position)

          const [existing] = await ctx.db
            .select({ id: oppOpportunities.id })
            .from(oppOpportunities)
            .where(
              and(
                eq(oppOpportunities.sourcePlatform, "remoteok"),
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
            type: oppType,
            sourcePlatform: "remoteok",
            externalId,
            title: job.position ?? "Remote Job",
            description: (job.description ?? "").slice(0, 2000),
            url: job.url ?? `https://remoteok.com/l/${job.slug ?? job.id}`,
            rewardMin: job.salary_min ?? null,
            rewardMax: job.salary_max ?? null,
            rewardCurrency: "USD",
            rewardType: job.salary_min ? "range" : "tip",
            skillsRequired: job.tags?.length ? JSON.stringify(job.tags.slice(0, 10)) : null,
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
        console.error("[scan-freelance-jobs] RemoteOK error:", err)
      }
    }

    // --- We Work Remotely ---
    if (platforms.includes("weworkremotely")) {
      try {
        const seen = new Set<string>()
        for (const category of categories) {
          const jobs = await fetchWeWorkRemotely(category, limit)
          const isContentCat = CONTENT_CATEGORIES.includes(category)
          const relevant = isContentCat ? isContentRelevant : isRelevant
          const oppType = isContentCat ? "content" : "freelance"

          for (const job of jobs) {
            const text = `${job.title} ${job.description.slice(0, 500)}`
            if (!relevant(text)) continue

            const externalId = job.link.replace(/^https?:\/\/weworkremotely\.com/, "")
            if (seen.has(externalId)) continue
            seen.add(externalId)

            found++

            const [existing] = await ctx.db
              .select({ id: oppOpportunities.id })
              .from(oppOpportunities)
              .where(
                and(
                  eq(oppOpportunities.sourcePlatform, "weworkremotely"),
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
              type: oppType,
              sourcePlatform: "weworkremotely",
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
        }
      } catch (err) {
        console.error("[scan-freelance-jobs] WWR error:", err)
      }
    }

    return {
      summary: `Freelance jobs: ${found} relevantes, ${created} novos, ${enqueued} para scoring`,
      extra: { found, created, enqueued, platforms },
    }
  },
}
