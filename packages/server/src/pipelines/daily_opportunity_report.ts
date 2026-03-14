/**
 * Pipeline: daily-opportunity-report
 * Gera e envia relatório diário de oportunidades via Telegram.
 * Cron sugerido: 0 8 * * * (diariamente às 8h)
 */
import { ulid } from "ulid"
import { daemonQueue } from "../schema"
import { registerPipeline } from "../registry"
import type { PipelineContext, ContentOutput } from "../types"

interface DailyReportConfig {
  top_n?: number
  period_hours?: number
  chat_id?: string
}

registerPipeline({
  strategy: "daily-opportunity-report",
  displayName: "Daily Opportunity Report",

  async execute(ctx: PipelineContext): Promise<ContentOutput | void> {
    if (!ctx.db) return

    const config = ctx.config as unknown as DailyReportConfig
    const now = Math.floor(Date.now() / 1000)

    await ctx.db.insert(daemonQueue).values({
      id: ulid(),
      activityType: "daily-report",
      status: "pending",
      priority: 4,
      inputJson: JSON.stringify({
        top_n: config.top_n ?? 10,
        period_hours: config.period_hours ?? 24,
        report_type: "daily",
        ...(config.chat_id ? { chat_id: config.chat_id } : {}),
      }),
      triggeredBy: ctx.jobId,
      createdAt: now,
    })

    return { extra: { enqueued: "daily-report" } } as ContentOutput
  },
})
