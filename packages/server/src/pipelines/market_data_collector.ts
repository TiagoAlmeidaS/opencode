/**
 * Pipeline: market-data-collector
 * Coleta preços de cripto e tendências de mercado.
 * Cron sugerido: 0 * * * * (a cada hora)
 */
import { ulid } from "ulid"
import { daemonQueue } from "../schema"
import { registerPipeline } from "../registry"
import type { PipelineContext, ContentOutput } from "../types"

interface MarketDataCollectorConfig {
  crypto_symbols?: string[]
  currency?: string
}

registerPipeline({
  strategy: "market-data-collector",
  displayName: "Market Data Collector",

  async execute(ctx: PipelineContext): Promise<ContentOutput | void> {
    if (!ctx.db) return

    const config = ctx.config as unknown as MarketDataCollectorConfig
    const now = Math.floor(Date.now() / 1000)

    // Coleta de cripto (paralelo — sem dependsOn)
    const cryptoId = ulid()
    await ctx.db.insert(daemonQueue).values({
      id: cryptoId,
      activityType: "market-data-crypto",
      status: "pending",
      priority: 4,
      inputJson: JSON.stringify({
        symbols: config.crypto_symbols,
        currency: config.currency ?? "usd",
      }),
      triggeredBy: "cron",
      createdAt: now,
    })

    return {
      extra: { enqueued: 1, crypto_item_id: cryptoId },
    } as ContentOutput
  },
})
