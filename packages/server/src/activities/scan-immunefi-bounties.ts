import { ulid } from "ulid"
import { eq, and } from "drizzle-orm"
import { oppOpportunities } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"

interface ScanImmunefiBountiesInput {
  limit?: number
  minRewardUsd?: number
}

interface ImmunefiBounty {
  id?: string | number
  project?: string
  name?: string
  slug?: string
  maxBounty?: number
  maximumBounty?: number
  assets?: Array<{ type?: string }>
  technologies?: string[]
  programType?: string
  status?: string
  launchDate?: string
  updatedDate?: string
}

function extractImmunefiBounties(html: string): ImmunefiBounty[] {
  // Parse window.__NEXT_DATA__ from the page
  const match = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!match) return []

  try {
    const nextData = JSON.parse(match[1])
    // Try various known paths
    const pageProps = nextData?.props?.pageProps
    if (!pageProps) return []

    const bounties: ImmunefiBounty[] =
      pageProps.bounties ??
      pageProps.programs ??
      pageProps.data?.bounties ??
      pageProps.data?.programs ??
      []

    return Array.isArray(bounties) ? bounties : []
  } catch {
    return []
  }
}

export const scanImmunefiBountiesActivity: Activity = {
  type: "scan-immunefi-bounties",
  displayName: "Scan Immunefi Bounties",
  description: "Busca bug bounties DeFi na Immunefi e registra como oportunidades",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as ScanImmunefiBountiesInput
    const limit = input.limit ?? 30
    const minReward = input.minRewardUsd ?? 0

    try {
      const res = await fetch("https://immunefi.com/bug-bounty/", {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; opencode-server/1.0)",
          Accept: "text/html,application/xhtml+xml",
        },
      })

      if (!res.ok) {
        return {
          summary: `Immunefi indisponível (${res.status}). Pulando.`,
          extra: { skipped: true, reason: `http_${res.status}` },
        }
      }

      const html = await res.text()
      const bounties = extractImmunefiBounties(html)

      if (bounties.length === 0) {
        return {
          summary: "Immunefi: nenhum bounty encontrado no __NEXT_DATA__ — estrutura do site pode ter mudado.",
          extra: { skipped: true, reason: "parse_failed" },
        }
      }

      const now = Math.floor(Date.now() / 1000)
      let created = 0
      let enqueued = 0
      let processed = 0

      for (const bounty of bounties) {
        if (processed >= limit) break

        const slug = bounty.slug ?? bounty.project ?? bounty.name ?? String(bounty.id ?? "")
        if (!slug) continue

        const maxBounty = bounty.maxBounty ?? bounty.maximumBounty ?? 0
        if (minReward > 0 && maxBounty < minReward) continue

        processed++

        // Dedup
        const [existing] = await ctx.db
          .select({ id: oppOpportunities.id, lastSeenAt: oppOpportunities.lastSeenAt })
          .from(oppOpportunities)
          .where(
            and(
              eq(oppOpportunities.sourcePlatform, "immunefi"),
              eq(oppOpportunities.externalId, slug),
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

        const name = bounty.name ?? bounty.project ?? slug
        const url = `https://immunefi.com/bounty/${slug}/`
        const technologies = bounty.technologies ?? ["solidity", "ethereum", "defi", "web3"]
        const skills = [...new Set(["solidity", "ethereum", "defi", "web3", ...technologies])]

        const id = ulid()
        await ctx.db.insert(oppOpportunities).values({
          id,
          type: "bug-bounty",
          sourcePlatform: "immunefi",
          externalId: slug,
          title: `[Immunefi] ${name} Bug Bounty`,
          description: `Bug bounty program for ${name} on Immunefi. Max reward: $${maxBounty.toLocaleString()} USD. Program type: ${bounty.programType ?? "DeFi"}.`,
          url,
          rewardMin: null,
          rewardMax: maxBounty > 0 ? maxBounty : null,
          rewardCurrency: "USD",
          rewardType: "range",
          skillsRequired: JSON.stringify(skills),
          difficulty: "expert",
          status: "new",
          firstSeenAt: now,
          lastSeenAt: now,
          createdAt: now,
          updatedAt: now,
        })
        created++

        await ctx.enqueue("score-opportunity", { opportunity_id: id }, { priority: 6 })
        enqueued++

        // Pause between inserts to avoid overwhelming the queue
        if (created % 10 === 0) {
          await new Promise((r) => setTimeout(r, 2000))
        }
      }

      return {
        summary: `Immunefi: ${processed} processados, ${created} novos, ${enqueued} enviados para scoring`,
        extra: { processed, created, enqueued, total_found: bounties.length },
      }
    } catch (err) {
      // Graceful skip — site structure may change
      return {
        summary: `Immunefi scanner falhou graciosamente: ${err instanceof Error ? err.message : String(err)}`,
        extra: { skipped: true, reason: "exception", error: err instanceof Error ? err.message : String(err) },
      }
    }
  },
}
