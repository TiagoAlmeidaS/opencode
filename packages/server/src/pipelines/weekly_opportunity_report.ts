/**
 * Pipeline: weekly-opportunity-report
 * Gera e envia relatório semanal de oportunidades via Telegram.
 * Cron sugerido: 0 9 * * 1 (toda segunda-feira às 9h)
 */
import { ulid } from "ulid"
import { daemonQueue } from "../schema"
import { registerPipeline } from "../registry"
import type { PipelineContext, ContentOutput } from "../types"

interface WeeklyReportConfig {
  top_n?: number
  chat_id?: string
}

registerPipeline({
  strategy: "weekly-opportunity-report",
  displayName: "Weekly Opportunity Report",

  async execute(ctx: PipelineContext): Promise<ContentOutput | void> {
    if (!ctx.db) return

    const config = ctx.config as unknown as WeeklyReportConfig
    const now = Math.floor(Date.now() / 1000)

    await ctx.db.insert(daemonQueue).values({
      id: ulid(),
      activityType: "daily-report",
      status: "pending",
      priority: 4,
      inputJson: JSON.stringify({
        top_n: config.top_n ?? 20,
        period_hours: 168, // 7 dias
        report_type: "weekly",
        ...(config.chat_id ? { chat_id: config.chat_id } : {}),
      }),
      triggeredBy: ctx.jobId,
      createdAt: now,
    })

    return { extra: { enqueued: "weekly-report" } } as ContentOutput
  },
})
