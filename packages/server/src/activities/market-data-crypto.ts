import { ulid } from "ulid"
import { oppMarketData } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"

interface MarketDataCryptoInput {
  symbols?: string[]
  currency?: string
}

interface CoinGeckoMarket {
  id: string
  symbol: string
  name: string
  current_price: number | null
  price_change_percentage_24h: number | null
  total_volume: number | null
  market_cap: number | null
}

const DEFAULT_SYMBOLS = [
  "bitcoin",
  "ethereum",
  "solana",
  "binancecoin",
  "ripple",
  "cardano",
  "avalanche-2",
  "polkadot",
]

export const marketDataCryptoActivity: Activity = {
  type: "market-data-crypto",
  displayName: "Market Data: Crypto",
  description: "Coleta preços e métricas de criptomoedas via CoinGecko (free, sem API key)",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as MarketDataCryptoInput
    const symbols = input.symbols ?? DEFAULT_SYMBOLS
    const currency = input.currency ?? "usd"

    const url = new URL("https://api.coingecko.com/api/v3/coins/markets")
    url.searchParams.set("vs_currency", currency)
    url.searchParams.set("ids", symbols.join(","))
    url.searchParams.set("order", "market_cap_desc")
    url.searchParams.set("per_page", String(symbols.length))
    url.searchParams.set("page", "1")

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    })

    if (!res.ok) {
      throw new Error(`CoinGecko API error: ${res.status} ${res.statusText}`)
    }

    const coins = (await res.json()) as CoinGeckoMarket[]
    const now = Math.floor(Date.now() / 1000)
    let collected = 0
    const alerts: string[] = []

    for (const coin of coins) {
      await ctx.db.insert(oppMarketData).values({
        id: ulid(),
        assetType: "crypto",
        symbol: coin.id,
        price: coin.current_price ?? null,
        change24h: coin.price_change_percentage_24h ?? null,
        volume24h: coin.total_volume ?? null,
        marketCap: coin.market_cap ?? null,
        source: "coingecko",
        rawJson: JSON.stringify(coin),
        collectedAt: now,
        createdAt: now,
      })
      collected++

      // Alerta de movimento forte (>= 5%)
      const change = Math.abs(coin.price_change_percentage_24h ?? 0)
      if (change >= 5) {
        alerts.push(`${coin.id} ${coin.price_change_percentage_24h! > 0 ? "+" : ""}${coin.price_change_percentage_24h?.toFixed(1)}%`)
      }
    }

    return {
      summary: `Coletou ${collected} cryptos${alerts.length ? ` | Movimentos: ${alerts.join(", ")}` : ""}`,
      extra: { collected, alerts, symbols: coins.map((c) => c.symbol) },
    }
  },
}
