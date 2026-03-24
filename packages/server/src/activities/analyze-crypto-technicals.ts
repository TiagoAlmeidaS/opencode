import { ulid } from "ulid"
import { desc, gte, eq } from "drizzle-orm"
import { oppMarketData, oppCryptoSignals } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"

interface AnalyzeCryptoTechnicalsInput {
  symbols?: string[]
  currency?: string
  lookback_days?: number
}

interface OhlcvPoint {
  timestamp: number
  price: number
}

// ─── Pure-TS Technical Indicators ────────────────────────────────────────────

function sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null
  const slice = closes.slice(-period)
  return slice.reduce((a, b) => a + b, 0) / period
}

function ema(data: number[], period: number): number[] {
  if (data.length === 0) return []
  const k = 2 / (period + 1)
  const result: number[] = [data[0]]
  for (let i = 1; i < data.length; i++) {
    result.push(data[i] * k + result[i - 1] * (1 - k))
  }
  return result
}

function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null
  const changes = closes.slice(1).map((c, i) => c - closes[i])
  const recent = changes.slice(-period)
  const gains = recent.map((c) => Math.max(0, c))
  const losses = recent.map((c) => Math.max(0, -c))
  const avgGain = gains.reduce((a, b) => a + b, 0) / period
  const avgLoss = losses.reduce((a, b) => a + b, 0) / period
  if (avgLoss === 0) return 100
  return 100 - 100 / (1 + avgGain / avgLoss)
}

function macdCalc(closes: number[]): { macd: number; signal: number; histogram: number } | null {
  if (closes.length < 26) return null
  const ema12 = ema(closes, 12)
  const ema26 = ema(closes, 26)
  const macdLine = ema12.map((v, i) => v - ema26[i])
  if (macdLine.length < 9) return null
  const signalLine = ema(macdLine.slice(-9), 9)
  const macdVal = macdLine.at(-1)!
  const signalVal = signalLine.at(-1)!
  return { macd: macdVal, signal: signalVal, histogram: macdVal - signalVal }
}

function bollingerBands(closes: number[], period = 20): { upper: number; lower: number; middle: number } | null {
  if (closes.length < period) return null
  const recent = closes.slice(-period)
  const middle = recent.reduce((a, b) => a + b, 0) / period
  const variance = recent.map((c) => (c - middle) ** 2).reduce((a, b) => a + b, 0) / period
  const std = Math.sqrt(variance)
  return { upper: middle + 2 * std, lower: middle - 2 * std, middle }
}

// ─── Signal logic ─────────────────────────────────────────────────────────────

function deriveSignal(
  closes: number[],
  rsiVal: number | null,
  macdResult: ReturnType<typeof macdCalc>,
  sma7Val: number | null,
  sma21Val: number | null,
): { signal: "buy" | "sell" | "hold"; trend: "bullish" | "bearish" | "neutral"; strength: number } {
  let bullishPoints = 0
  let bearishPoints = 0

  if (rsiVal !== null) {
    if (rsiVal < 35) bullishPoints += 2
    else if (rsiVal < 45) bullishPoints += 1
    else if (rsiVal > 65) bearishPoints += 2
    else if (rsiVal > 55) bearishPoints += 1
  }

  if (macdResult) {
    if (macdResult.macd > macdResult.signal) bullishPoints += 2
    else bearishPoints += 2
    if (macdResult.histogram > 0) bullishPoints += 1
    else bearishPoints += 1
  }

  if (sma7Val !== null && sma21Val !== null) {
    const currentPrice = closes.at(-1) ?? 0
    if (sma7Val > sma21Val) bullishPoints += 1
    else bearishPoints += 1
    if (currentPrice > sma21Val) bullishPoints += 1
    else bearishPoints += 1
  }

  const total = bullishPoints + bearishPoints
  const strength = total > 0 ? Math.max(bullishPoints, bearishPoints) / total : 0.5

  if (bullishPoints > bearishPoints * 1.5) {
    return { signal: "buy", trend: "bullish", strength }
  } else if (bearishPoints > bullishPoints * 1.5) {
    return { signal: "sell", trend: "bearish", strength }
  }
  return { signal: "hold", trend: "neutral", strength }
}

// ─── CoinGecko historical fetch ───────────────────────────────────────────────

async function fetchHistoricalCloses(symbol: string, days: number, currency: string): Promise<number[]> {
  const url = `https://api.coingecko.com/api/v3/coins/${symbol}/market_chart?vs_currency=${currency}&days=${days}&interval=daily`
  const res = await fetch(url, { headers: { Accept: "application/json" } })
  if (!res.ok) throw new Error(`CoinGecko history error for ${symbol}: ${res.status}`)
  const data = (await res.json()) as { prices: [number, number][] }
  return data.prices.map(([, price]) => price)
}

// ─── LLM prompt ───────────────────────────────────────────────────────────────

const ANALYSIS_SYSTEM = `Você é um analista técnico de criptomoedas experiente.
Analise os indicadores fornecidos e gere uma recomendação de investimento clara e fundamentada em português.
Seja objetivo, mencione os indicadores relevantes e conclua com uma ação recomendada (comprar, manter ou vender).
Máximo 200 palavras.`

function buildAnalysisPrompt(
  symbol: string,
  price: number,
  change24h: number | null,
  rsiVal: number | null,
  macdResult: ReturnType<typeof macdCalc>,
  sma7Val: number | null,
  sma21Val: number | null,
  sma50Val: number | null,
  bb: ReturnType<typeof bollingerBands>,
  signal: "buy" | "sell" | "hold",
  trend: string,
): string {
  const lines: string[] = [
    `Ativo: ${symbol.toUpperCase()}`,
    `Preço atual: $${price.toFixed(4)}`,
    `Variação 24h: ${change24h !== null ? (change24h >= 0 ? "+" : "") + change24h.toFixed(2) + "%" : "N/A"}`,
    `RSI(14): ${rsiVal !== null ? rsiVal.toFixed(1) : "N/A"}`,
    `MACD: ${macdResult ? macdResult.macd.toFixed(6) : "N/A"} | Signal: ${macdResult ? macdResult.signal.toFixed(6) : "N/A"} | Hist: ${macdResult ? macdResult.histogram.toFixed(6) : "N/A"}`,
    `SMA7: ${sma7Val !== null ? "$" + sma7Val.toFixed(4) : "N/A"} | SMA21: ${sma21Val !== null ? "$" + sma21Val.toFixed(4) : "N/A"} | SMA50: ${sma50Val !== null ? "$" + sma50Val.toFixed(4) : "N/A"}`,
    `Bollinger Bands: Upper $${bb?.upper.toFixed(4) ?? "N/A"} | Middle $${bb?.middle.toFixed(4) ?? "N/A"} | Lower $${bb?.lower.toFixed(4) ?? "N/A"}`,
    `Sinal calculado: ${signal.toUpperCase()} (Tendência: ${trend})`,
    "",
    "Com base nesses indicadores, gere uma análise técnica e recomendação de investimento.",
  ]
  return lines.join("\n")
}

// ─── Activity ─────────────────────────────────────────────────────────────────

const DEFAULT_SYMBOLS = ["bitcoin", "ethereum", "solana", "binancecoin"]

export const analyzeCryptoTechnicalsActivity: Activity = {
  type: "analyze-crypto-technicals",
  displayName: "Analyze Crypto Technicals",
  description: "Calcula RSI, MACD, Bollinger Bands e SMAs para criptomoedas e gera recomendações via LLM",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as AnalyzeCryptoTechnicalsInput
    const symbols = input.symbols ?? DEFAULT_SYMBOLS
    const currency = input.currency ?? "usd"
    const lookbackDays = input.lookback_days ?? 60

    const now = Math.floor(Date.now() / 1000)
    const results: string[] = []
    const errors: string[] = []

    for (const symbol of symbols) {
      try {
        // Rate limit: 1 req/sec for free CoinGecko tier
        await new Promise((r) => setTimeout(r, 1200))

        const closes = await fetchHistoricalCloses(symbol, lookbackDays, currency)
        if (closes.length < 14) {
          errors.push(`${symbol}: insufficient data (${closes.length} points)`)
          continue
        }

        // Current price from last snapshot in DB (fallback to last close)
        const [latestMarket] = await ctx.db
          .select({ price: oppMarketData.price, change24h: oppMarketData.change24h })
          .from(oppMarketData)
          .where(eq(oppMarketData.symbol, symbol))
          .orderBy(desc(oppMarketData.collectedAt))
          .limit(1)

        const currentPrice = latestMarket?.price ?? closes.at(-1) ?? 0
        const change24h = latestMarket?.change24h ?? null

        // Calculate indicators
        const sma7Val = sma(closes, 7)
        const sma21Val = sma(closes, 21)
        const sma50Val = sma(closes, 50)
        const rsiVal = rsi(closes, 14)
        const macdResult = macdCalc(closes)
        const bb = bollingerBands(closes, 20)

        const { signal, trend, strength } = deriveSignal(closes, rsiVal, macdResult, sma7Val, sma21Val)

        // LLM recommendation
        let reasoning = `Sinal ${signal.toUpperCase()} baseado em ${closes.length} dias de histórico.`
        let recommendation = reasoning

        if (ctx.memoryLlm) {
          const prompt = buildAnalysisPrompt(
            symbol, currentPrice, change24h,
            rsiVal, macdResult, sma7Val, sma21Val, sma50Val, bb,
            signal, trend,
          )
          const llmText = await ctx.memoryLlm({ system: ANALYSIS_SYSTEM, prompt, maxTokens: 400 })
          reasoning = llmText.slice(0, 500)
          recommendation = llmText
        }

        await ctx.db.insert(oppCryptoSignals).values({
          id: ulid(),
          symbol,
          collectedAt: now,
          price: currentPrice,
          change24h,
          sma7: sma7Val,
          sma21: sma21Val,
          sma50: sma50Val,
          rsi14: rsiVal,
          macd: macdResult?.macd ?? null,
          macdSignal: macdResult?.signal ?? null,
          macdHistogram: macdResult?.histogram ?? null,
          bbUpper: bb?.upper ?? null,
          bbLower: bb?.lower ?? null,
          bbMiddle: bb?.middle ?? null,
          trend,
          signal,
          signalStrength: strength,
          reasoning,
          recommendation,
          createdAt: now,
        })

        results.push(`${symbol}: ${signal.toUpperCase()} (RSI ${rsiVal?.toFixed(1) ?? "N/A"}, trend: ${trend})`)
      } catch (err) {
        errors.push(`${symbol}: ${String(err)}`)
      }
    }

    return {
      summary: `Analisados ${results.length}/${symbols.length} ativos${errors.length ? ` | Erros: ${errors.length}` : ""}`,
      extra: { results, errors, symbols_analyzed: results.length },
    }
  },
}
