/**
 * Pipeline: opportunity-analyst
 * Processa em batch as oportunidades novas, enfileirando score-opportunity.
 * Cron sugerido: 30 *\/2 * * * (a cada 2h, offset 30min p/ não colidir com collector)
 */
import { ulid } from "ulid"
import { eq, and, asc, lte } from "drizzle-orm"
import { oppOpportunities, daemonQueue } from "../schema"
import { registerPipeline } from "../registry"
import type { PipelineContext, ContentOutput } from "../types"

interface OpportunityAnalystConfig {
  batch_size?: number
  min_reward_usd?: number
  rescore_older_than_days?: number  // rescore opps scored há mais de N dias
  classify_min_score?: number       // score mínimo para enfileirar classify-niche (default: 60)
  auto_execute_min_score?: number   // score mínimo para auto-executar (default: 75)
  alert_min_score?: number          // score para alert Telegram (default: 90)
  max_impl_retries?: number         // tentativas de implementação no submit-github-pr (default: 2)
}

registerPipeline({
  strategy: "opportunity-analyst",
  displayName: "Opportunity Analyst",

  async execute(ctx: PipelineContext): Promise<ContentOutput | void> {
    if (!ctx.db) return

    const config = ctx.config as unknown as OpportunityAnalystConfig
    const batchSize = config.batch_size ?? 20
    const minReward = config.min_reward_usd ?? 0
    const rescoreDays = config.rescore_older_than_days ?? 7
    const classifyMinScore = config.classify_min_score ?? 60
    const autoExecuteMinScore = config.auto_execute_min_score ?? 75
    const alertMinScore = config.alert_min_score ?? 90

    const now = Math.floor(Date.now() / 1000)
    const rescoreCutoff = now - rescoreDays * 86400

    // 1. Oportunidades novas (nunca pontuadas)
    let query = ctx.db
      .select({ id: oppOpportunities.id })
      .from(oppOpportunities)
      .where(eq(oppOpportunities.status, "new"))
      .orderBy(asc(oppOpportunities.createdAt))
      .limit(batchSize)

    const newOpps = await query

    // 2. Oportunidades com status "scored" há mais de N dias (updatedAt < cutoff)
    const rescoreOpps = await ctx.db
      .select({ id: oppOpportunities.id })
      .from(oppOpportunities)
      .where(
        and(
          eq(oppOpportunities.status, "scored"),
          lte(oppOpportunities.updatedAt, rescoreCutoff),
        ),
      )
      .orderBy(asc(oppOpportunities.updatedAt))
      .limit(Math.max(0, batchSize - newOpps.length))

    // Filtra por recompensa mínima se configurado
    const toProcess = [...newOpps, ...rescoreOpps]
    let enqueued = 0
    let skipped = 0

    for (const opp of toProcess) {
      if (minReward > 0) {
        const [full] = await ctx.db
          .select({ rewardMax: oppOpportunities.rewardMax, rewardMin: oppOpportunities.rewardMin })
          .from(oppOpportunities)
          .where(eq(oppOpportunities.id, opp.id))
          .limit(1)

        const reward = full?.rewardMax ?? full?.rewardMin ?? 0
        if (reward < minReward) { skipped++; continue }
      }

      // Verifica se já tem score-opportunity pendente/running para esta opp
      const [existing] = await ctx.db
        .select({ id: daemonQueue.id })
        .from(daemonQueue)
        .where(
          and(
            eq(daemonQueue.activityType, "score-opportunity"),
            eq(daemonQueue.inputJson, JSON.stringify({ opportunity_id: opp.id })),
            eq(daemonQueue.status, "pending"),
          ),
        )
        .limit(1)

      if (existing) { skipped++; continue }

      await ctx.db.insert(daemonQueue).values({
        id: ulid(),
        activityType: "score-opportunity",
        status: "pending",
        priority: 6,
        inputJson: JSON.stringify({
          opportunity_id: opp.id,
          classify_min_score: classifyMinScore,
          auto_execute_min_score: autoExecuteMinScore,
          alert_min_score: alertMinScore,
        }),
        triggeredBy: ctx.jobId,
        createdAt: now,
      })
      enqueued++
    }

    return {
      extra: {
        new_opps: newOpps.length,
        rescore_opps: rescoreOpps.length,
        enqueued,
        skipped,
      },
    } as ContentOutput
  },
})
