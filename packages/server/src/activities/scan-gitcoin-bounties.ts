import { ulid } from "ulid"
import { eq, and } from "drizzle-orm"
import { oppOpportunities } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"

interface ScanGitcoinInput {
  limit?: number
  minValueUsd?: number
  skills?: string[]
}

interface GitcoinBounty {
  pk: number
  title: string
  url: string
  web3_url?: string
  description?: string
  value_in_usdt_now?: string | number
  usd_value?: string | number
  token_value?: string | number
  project_type?: string
  experience_level?: string
  is_open?: boolean
  keywords?: string
  fulfillment_accepted_on?: string | null
  expires_date?: string | null
  github_url?: string
  bounty_type?: string
  status?: string
}

function parseUsd(val: string | number | undefined | null): number | null {
  if (val == null) return null
  const n = parseFloat(String(val))
  return isNaN(n) ? null : n
}

function parseDifficulty(level: string | undefined): string | null {
  if (!level) return null
  const l = level.toLowerCase()
  if (l.includes("beginner") || l.includes("easy")) return "easy"
  if (l.includes("intermediate") || l.includes("medium")) return "medium"
  if (l.includes("advanced") || l.includes("hard")) return "hard"
  if (l.includes("expert")) return "expert"
  return null
}

export const scanGitcoinBountiesActivity: Activity = {
  type: "scan-gitcoin-bounties",
  displayName: "Scan Gitcoin Bounties",
  description: "Busca bounties open source na plataforma Gitcoin",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as ScanGitcoinInput
    const limit = input.limit ?? 50
    const minUsd = input.minValueUsd ?? 0

    const url = new URL("https://gitcoin.co/api/v0.1/bounties/")
    url.searchParams.set("limit", String(limit))
    url.searchParams.set("order_by", "-_val_usd_db")
    url.searchParams.set("is_open", "true")
    if (input.skills?.length) {
      url.searchParams.set("keywords", input.skills.join(","))
    }

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json", "User-Agent": "opencode-server/1.0" },
    })

    if (!res.ok) {
      throw new Error(`Gitcoin API error: ${res.status} ${res.statusText}`)
    }

    const data = (await res.json()) as GitcoinBounty[]
    const bounties = Array.isArray(data) ? data : (data as { results?: GitcoinBounty[] }).results ?? []

    const now = Math.floor(Date.now() / 1000)
    let found = 0
    let created = 0
    let enqueued = 0

    for (const bounty of bounties) {
      const usdValue = parseUsd(bounty.value_in_usdt_now ?? bounty.usd_value)

      if (minUsd > 0 && (usdValue ?? 0) < minUsd) continue

      found++
      const externalId = String(bounty.pk)

      const [existing] = await ctx.db
        .select({ id: oppOpportunities.id })
        .from(oppOpportunities)
        .where(
          and(
            eq(oppOpportunities.sourcePlatform, "gitcoin"),
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

      const skills = bounty.keywords
        ? bounty.keywords.split(",").map((k) => k.trim()).filter(Boolean)
        : []

      const deadline = bounty.expires_date
        ? Math.floor(new Date(bounty.expires_date).getTime() / 1000)
        : null

      const id = ulid()
      await ctx.db.insert(oppOpportunities).values({
        id,
        type: "oss-bounty",
        sourcePlatform: "gitcoin",
        externalId,
        title: bounty.title,
        description: (bounty.description ?? "").slice(0, 2000),
        url: bounty.url ?? bounty.github_url ?? null,
        rewardMin: usdValue,
        rewardMax: usdValue,
        rewardCurrency: "USD",
        rewardType: "fixed",
        skillsRequired: skills.length ? JSON.stringify(skills) : null,
        difficulty: parseDifficulty(bounty.experience_level),
        deadline,
        status: "new",
        firstSeenAt: now,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      })
      created++

      await ctx.enqueue("score-opportunity", { opportunity_id: id }, { priority: 6 })
      enqueued++
    }

    return {
      summary: `Gitcoin: ${found} verificados, ${created} novos, ${enqueued} para scoring`,
      extra: { found, created, enqueued },
    }
  },
}
