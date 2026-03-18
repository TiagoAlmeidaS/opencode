import { ulid } from "ulid"
import { eq, and } from "drizzle-orm"
import { oppOpportunities } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"

interface ScanHackerOneProgramsInput {
  limit?: number
  minRewardUsd?: number
  pages?: number
}

interface H1Program {
  id?: number | string
  handle?: string
  name?: string
  profile_picture_urls?: { small?: string }
  submission_state?: string
  triage_active?: boolean
  state?: string
  started_accepting_at?: string
  allows_disclosure?: boolean
  website?: string
  offers_bounties?: boolean
  minimum_bounty?: number | null
  average_bounty?: number | null
  top_bounty?: number | null
  most_recent_sla_response_efficiency_percentage?: number | null
}

interface H1SearchResponse {
  results?: Array<{ type?: string; attributes?: H1Program; relationships?: unknown }>
  meta?: { total_count?: number }
}

function extractSkillsFromProgram(program: H1Program): string[] {
  const base = ["web security", "bug bounty", "hackerone"]
  const name = (program.name ?? "").toLowerCase()
  const skills: string[] = [...base]

  if (name.includes("crypto") || name.includes("blockchain") || name.includes("defi")) {
    skills.push("blockchain", "web3", "solidity")
  } else if (name.includes("api") || name.includes("service")) {
    skills.push("api testing", "rest", "http")
  } else if (name.includes("mobile") || name.includes("android") || name.includes("ios")) {
    skills.push("mobile security", "android", "ios")
  }

  return [...new Set(skills)]
}

export const scanHackerOneProgramsActivity: Activity = {
  type: "scan-hackerone-programs",
  displayName: "Scan HackerOne Programs",
  description: "Busca programas públicos de bug bounty no HackerOne",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as ScanHackerOneProgramsInput
    const limit = input.limit ?? 30
    const minReward = input.minRewardUsd ?? 0
    const maxPages = input.pages ?? 3

    const now = Math.floor(Date.now() / 1000)
    let created = 0
    let enqueued = 0
    let processed = 0
    let page = 1

    try {
      while (processed < limit && page <= maxPages) {
        const url = `https://hackerone.com/programs/search.json?query=type%3Apublic&sort=published_at%3Adescending&page=${page}`

        const res = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; opencode-server/1.0)",
            Accept: "application/json",
          },
        })

        if (res.status === 429) {
          return {
            summary: "HackerOne rate limited (429). Pulando.",
            extra: { skipped: true, reason: "rate_limited", created, enqueued },
          }
        }

        if (!res.ok) {
          return {
            summary: `HackerOne API error (${res.status}). Pulando.`,
            extra: { skipped: true, reason: `http_${res.status}`, created, enqueued },
          }
        }

        const data = await res.json() as H1SearchResponse
        const results = data.results ?? []

        if (results.length === 0) break

        for (const result of results) {
          if (processed >= limit) break

          const program = result.attributes
          if (!program) continue

          // Only include programs with bounties
          if (!program.offers_bounties) continue

          const handle = program.handle
          if (!handle) continue

          processed++

          // Dedup
          const [existing] = await ctx.db
            .select({ id: oppOpportunities.id, lastSeenAt: oppOpportunities.lastSeenAt })
            .from(oppOpportunities)
            .where(
              and(
                eq(oppOpportunities.sourcePlatform, "hackerone"),
                eq(oppOpportunities.externalId, handle),
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

          const name = program.name ?? handle
          const rewardMin = program.minimum_bounty ?? null
          const rewardMax = program.top_bounty ?? program.average_bounty ?? null

          if (minReward > 0 && (rewardMax ?? rewardMin ?? 0) < minReward) continue

          const skills = extractSkillsFromProgram(program)

          const id = ulid()
          await ctx.db.insert(oppOpportunities).values({
            id,
            type: "bug-bounty",
            sourcePlatform: "hackerone",
            externalId: handle,
            title: `[HackerOne] ${name} Bug Bounty Program`,
            description: `Public bug bounty program for ${name} on HackerOne. Bounties offered. Min: $${rewardMin ?? "N/A"}, Top: $${rewardMax ?? "N/A"} USD.`,
            url: `https://hackerone.com/${handle}`,
            rewardMin,
            rewardMax,
            rewardCurrency: "USD",
            rewardType: rewardMax ? "range" : rewardMin ? "fixed" : "tip",
            skillsRequired: JSON.stringify(skills),
            difficulty: "medium",
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

        page++
        // Pause 1s between pages
        if (page <= maxPages && processed < limit) {
          await new Promise((r) => setTimeout(r, 1000))
        }
      }

      return {
        summary: `HackerOne: ${processed} processados, ${created} novos, ${enqueued} enviados para scoring`,
        extra: { processed, created, enqueued, pages_fetched: page - 1 },
      }
    } catch (err) {
      // Graceful skip
      return {
        summary: `HackerOne scanner falhou graciosamente: ${err instanceof Error ? err.message : String(err)}`,
        extra: { skipped: true, reason: "exception", error: err instanceof Error ? err.message : String(err) },
      }
    }
  },
}
