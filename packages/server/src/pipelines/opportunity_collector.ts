/**
 * Pipeline: opportunity-collector
 * Enfileira todos os scanners de oportunidades em sequência (dependsOn encadeado).
 * Cron sugerido: 0 *\/4 * * * (a cada 4 horas)
 */
import { ulid } from "ulid"
import { daemonQueue } from "../schema"
import { registerPipeline } from "../registry"
import type { PipelineContext, ContentOutput } from "../types"

interface OpportunityCollectorConfig {
  sources?: Array<"github-bounties" | "gitcoin-bounties" | "freelance-jobs" | "content-jobs" | "immunefi-bounties" | "hackerone-programs">
  github_token?: string
  min_reward_usd?: number
  limit_per_source?: number
}

registerPipeline({
  strategy: "opportunity-collector",
  displayName: "Opportunity Collector",

  async execute(ctx: PipelineContext): Promise<ContentOutput | void> {
    if (!ctx.db) return

    const config = ctx.config as unknown as OpportunityCollectorConfig
    const sources = config.sources ?? ["github-bounties", "gitcoin-bounties", "freelance-jobs"]
    const now = Math.floor(Date.now() / 1000)

    // Garante que os nichos base existem antes de qualquer coleta
    const seedId = ulid()
    await ctx.db.insert(daemonQueue).values({
      id: seedId,
      activityType: "seed-niches",
      status: "pending",
      priority: 1,
      inputJson: "{}",
      triggeredBy: "cron",
      createdAt: now,
    })

    // Encadeia os scanners: cada um depende do anterior para não sobrecarregar APIs
    let previousId = seedId

    for (const source of sources) {
      const activityType =
        source === "github-bounties"   ? "scan-github-bounties"   :
        source === "gitcoin-bounties"  ? "scan-gitcoin-bounties"  :
        source === "content-jobs"      ? "scan-content-jobs"      :
        source === "immunefi-bounties" ? "scan-immunefi-bounties" :
        source === "hackerone-programs"? "scan-hackerone-programs":
        "scan-freelance-jobs"

      const input: Record<string, unknown> = {
        limit: config.limit_per_source ?? 30,
      }
      if (source === "github-bounties" && config.github_token) {
        input.token = config.github_token
      }
      if (config.min_reward_usd) {
        input.minRewardUsd = config.min_reward_usd
        input.minValueUsd = config.min_reward_usd
      }

      const itemId = ulid()
      await ctx.db.insert(daemonQueue).values({
        id: itemId,
        activityType,
        status: "pending",
        priority: 3,
        dependsOn: previousId,
        inputJson: JSON.stringify(input),
        triggeredBy: "cron",
        createdAt: now,
      })
      previousId = itemId
    }

    return {
      extra: {
        sources_enqueued: sources.length + 1, // +1 for seed-niches
        first_item_id: seedId,
      },
    } as ContentOutput
  },
})
