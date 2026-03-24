/**
 * Pipeline: crypto-analysis-daily
 * Coleta preços frescos e calcula indicadores técnicos (RSI, MACD, Bollinger Bands, SMAs).
 * Gera recomendações de investimento via LLM e envia digest pelo Telegram.
 * Cron sugerido: 0 7 * * * (todo dia às 07:00 UTC)
 */
import { ulid } from "ulid"
import { daemonQueue } from "../schema"
import { registerPipeline } from "../registry"
import type { PipelineContext, ContentOutput } from "../types"

interface CryptoAnalysisDailyConfig {
  symbols?: string[]
  currency?: string
  lookback_days?: number
  send_telegram?: boolean
}

registerPipeline({
  strategy: "crypto-analysis-daily",
  displayName: "Crypto Analysis Daily",

  async execute(ctx: PipelineContext): Promise<ContentOutput | void> {
    if (!ctx.db) return

    const config = ctx.config as unknown as CryptoAnalysisDailyConfig
    const now = Math.floor(Date.now() / 1000)

    // Step 1: collect fresh prices
    const collectId = ulid()
    await ctx.db.insert(daemonQueue).values({
      id: collectId,
      activityType: "market-data-crypto",
      status: "pending",
      priority: 5,
      inputJson: JSON.stringify({
        symbols: config.symbols,
        currency: config.currency ?? "usd",
      }),
      triggeredBy: "cron",
      createdAt: now,
    })

    // Step 2: calculate technical indicators (depends on collect)
    const analyzeId = ulid()
    await ctx.db.insert(daemonQueue).values({
      id: analyzeId,
      activityType: "analyze-crypto-technicals",
      status: "pending",
      priority: 5,
      inputJson: JSON.stringify({
        symbols: config.symbols,
        currency: config.currency ?? "usd",
        lookback_days: config.lookback_days ?? 60,
      }),
      dependsOn: collectId,
      triggeredBy: "cron",
      createdAt: now,
    })

    // Step 3: generate market digest (depends on analysis)
    const digestId = ulid()
    await ctx.db.insert(daemonQueue).values({
      id: digestId,
      activityType: "generate-market-digest",
      status: "pending",
      priority: 5,
      inputJson: JSON.stringify({ report_type: "daily", period_hours: 24 }),
      dependsOn: analyzeId,
      triggeredBy: "cron",
      createdAt: now,
    })

    const enqueued: string[] = [collectId, analyzeId, digestId]

    // Step 4 (optional): send Telegram report
    if (config.send_telegram !== false) {
      const telegramId = ulid()
      await ctx.db.insert(daemonQueue).values({
        id: telegramId,
        activityType: "send-telegram-report",
        status: "pending",
        priority: 4,
        inputJson: JSON.stringify({ report_type: "daily" }),
        dependsOn: digestId,
        triggeredBy: "cron",
        createdAt: now,
      })
      enqueued.push(telegramId)
    }

    return {
      extra: { enqueued: enqueued.length, queue_ids: enqueued },
    } as ContentOutput
  },
})
