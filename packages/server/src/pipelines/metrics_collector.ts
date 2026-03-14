/**
 * Metrics Collector pipeline (stub).
 * Full flow: count content, sum LLM costs, estimate revenue (CPC), sync AdSense/WordPress, write daemon_metrics/daemon_revenue, update goals.
 * This stub reads revenue and updates goals' current_value; real data sources can be wired later.
 */
import type { Pipeline } from "../types"
import { registerPipeline } from "../registry"
import { daemonRevenue, daemonGoals } from "../schema"
import { eq, gte, sql } from "drizzle-orm"

export interface MetricsCollectorConfig {
  cpc_estimation?: { default_cpc?: number; by_niche?: Record<string, number> }
  lookback_days?: number
}

const metricsCollector: Pipeline = {
  strategy: "metrics_collector",
  displayName: "Metrics Collector",
  async execute(ctx) {
    const config = ctx.config as MetricsCollectorConfig
    const lookbackDays = config?.lookback_days ?? 7
    const since = Math.floor(Date.now() / 1000) - lookbackDays * 86400
    if (!ctx.db) return
    const [rev] = await ctx.db
      .select({ total: sql<number>`coalesce(sum(${daemonRevenue.amount}), 0)` })
      .from(daemonRevenue)
      .where(gte(daemonRevenue.periodStart, since))
    const total = Number(rev?.total ?? 0)
    const goals = await ctx.db.select().from(daemonGoals).where(eq(daemonGoals.status, "active"))
    const now = Math.floor(Date.now() / 1000)
    for (const g of goals) {
      if (g.metricType === "revenue") {
        await ctx.db
          .update(daemonGoals)
          .set({ currentValue: total, lastMeasured: now, updatedAt: now })
          .where(eq(daemonGoals.id, g.id))
      }
    }
  },
}

registerPipeline(metricsCollector)
