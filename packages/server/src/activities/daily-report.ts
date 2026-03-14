/**
 * Activity unificada para relatório diário/semanal.
 * Gera o digest e envia via Telegram em uma única execução.
 */
import { ulid } from "ulid"
import { desc, eq, gte } from "drizzle-orm"
import { oppOpportunities, oppMarketData, oppNiches, oppTelegramReports } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"
import { createHash } from "crypto"

interface DailyReportInput {
  top_n?: number
  period_hours?: number
  report_type?: "daily" | "weekly"
  chat_id?: string
}

const DIGEST_SYSTEM = `Você é um analista financeiro e de oportunidades para agentes de IA autônomos.
Gere relatórios concisos, informativos e acionáveis em português.
Use emojis para facilitar a leitura. Sem markdown extra.`

async function sendTelegram(botToken: string, chatId: string, text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Telegram API ${res.status}: ${body.slice(0, 200)}`)
  }
}

export const dailyReportActivity: Activity = {
  type: "daily-report",
  displayName: "Daily/Weekly Report",
  description: "Gera digest de oportunidades e envia relatório via Telegram",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as DailyReportInput
    const topN = input.top_n ?? 10
    const periodHours = input.period_hours ?? 24
    const reportType = input.report_type ?? "daily"
    const now = Math.floor(Date.now() / 1000)
    const since = now - periodHours * 3600

    // Coleta dados
    const opps = await ctx.db
      .select({
        title: oppOpportunities.title,
        type: oppOpportunities.type,
        rewardMax: oppOpportunities.rewardMax,
        rewardMin: oppOpportunities.rewardMin,
        score: oppOpportunities.score,
        nicheId: oppOpportunities.nicheId,
        url: oppOpportunities.url,
      })
      .from(oppOpportunities)
      .where(eq(oppOpportunities.status, "scored"))
      .orderBy(desc(oppOpportunities.score))
      .limit(topN)

    const marketMoves = await ctx.db
      .select({
        symbol: oppMarketData.symbol,
        price: oppMarketData.price,
        change24h: oppMarketData.change24h,
      })
      .from(oppMarketData)
      .where(gte(oppMarketData.collectedAt, since))
      .orderBy(desc(oppMarketData.change24h))
      .limit(6)

    const niches = await ctx.db
      .select({ id: oppNiches.id, displayName: oppNiches.displayName })
      .from(oppNiches)

    const nicheMap = Object.fromEntries(niches.map((n) => [n.id, n.displayName]))

    let digest: string

    if (ctx.memoryLlm) {
      const oppLines = opps
        .map((o, i) => {
          const niche = o.nicheId ? nicheMap[o.nicheId] ?? "—" : "—"
          const reward = o.rewardMax ?? o.rewardMin ?? 0
          return `${i + 1}. [${o.type.toUpperCase()}] ${o.title} | $${reward} | Score: ${o.score ?? "?"} | ${niche}`
        })
        .join("\n")

      const marketLines = marketMoves
        .map((m) => `${m.symbol}: $${m.price?.toFixed(2) ?? "?"} (${m.change24h !== null ? (m.change24h! >= 0 ? "+" : "") + m.change24h!.toFixed(1) + "%" : "?"})`)
        .join(", ")

      const prompt = `Crie relatório ${reportType === "weekly" ? "semanal" : "diário"} para agente IA autônomo.

TOP OPORTUNIDADES:
${oppLines || "Nenhuma oportunidade encontrada"}

MERCADO CRIPTO:
${marketLines || "Sem dados"}

Inclua: 📊 Resumo (2 frases) | 🏆 Top 3 oportunidades | 💹 Destaque de mercado | 🎯 Ação recomendada | 📈 Tendência. Máximo 400 palavras.`

      digest = await ctx.memoryLlm({ system: DIGEST_SYSTEM, prompt, maxTokens: 600 })
    } else {
      // Fallback sem LLM
      const header = reportType === "weekly" ? "📋 Relatório Semanal" : "📋 Relatório Diário"
      const topOpp = opps[0]
      digest = [
        `${header} — Oportunidades para Agentes de IA`,
        ``,
        `📊 <b>Resumo:</b> ${opps.length} oportunidades analisadas.`,
        topOpp ? `🏆 <b>Melhor oportunidade:</b> ${topOpp.title} (score ${topOpp.score ?? "?"})` : "",
        marketMoves.length > 0 ? `💹 <b>Mercado:</b> ${marketMoves.map((m) => `${m.symbol} ${m.change24h !== null ? (m.change24h! >= 0 ? "+" : "") + m.change24h!.toFixed(1) + "%" : ""}`).join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    }

    // Verifica configuração do Telegram
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    const chatId = input.chat_id ?? process.env.TELEGRAM_CHAT_ID

    if (!botToken || !chatId) {
      return {
        summary: `Digest gerado mas Telegram não configurado (${opps.length} opps)`,
        extra: { digest, skipped_telegram: true },
      }
    }

    const contentHash = createHash("sha256").update(digest).digest("hex").slice(0, 32)

    // Dedup
    const [existing] = await ctx.db
      .select({ id: oppTelegramReports.id })
      .from(oppTelegramReports)
      .where(eq(oppTelegramReports.contentHash, contentHash))
      .limit(1)

    if (existing) {
      return {
        summary: "Relatório já enviado (dedup por hash)",
        extra: { skipped: true },
      }
    }

    await sendTelegram(botToken, chatId, digest)

    await ctx.db.insert(oppTelegramReports).values({
      id: ulid(),
      reportType,
      chatId,
      contentHash,
      sentAt: now,
      createdAt: now,
    })

    return {
      summary: `Relatório ${reportType} enviado (${opps.length} opps, ${marketMoves.length} ativos de mercado)`,
      extra: { report_type: reportType, opp_count: opps.length, content_hash: contentHash },
    }
  },
}
