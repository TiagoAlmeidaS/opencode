import { desc, eq, gte, and } from "drizzle-orm"
import { oppOpportunities, oppMarketData, oppNiches, oppAnalyses } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"

interface GenerateMarketDigestInput {
  top_n?: number          // número de oportunidades a incluir (default: 10)
  period_hours?: number   // janela de dados de mercado em horas (default: 24)
  report_type?: "daily" | "weekly"
}

const DIGEST_SYSTEM = `Você é um analista financeiro e de oportunidades para agentes de IA autônomos.
Gere relatórios concisos, informativos e acionáveis em português.
Responda APENAS com o texto do relatório — sem markdown extra, sem introdução.`

function buildDigestPrompt(
  opps: Array<{ title: string; type: string; rewardMax: number | null; rewardMin: number | null; score: number | null; nicheId: string | null }>,
  niches: Array<{ id: string; displayName: string }>,
  marketMoves: Array<{ symbol: string; price: number | null; change24h: number | null }>,
  reportType: string,
): string {
  const nicheMap = Object.fromEntries(niches.map((n) => [n.id, n.displayName]))

  const oppLines = opps
    .map((o, i) => {
      const niche = o.nicheId ? nicheMap[o.nicheId] ?? "—" : "—"
      const reward = o.rewardMax ?? o.rewardMin ?? 0
      return `${i + 1}. [${o.type.toUpperCase()}] ${o.title} | Recompensa: $${reward} | Score: ${o.score ?? "?"} | Niche: ${niche}`
    })
    .join("\n")

  const marketLines = marketMoves
    .map((m) => `${m.symbol}: $${m.price?.toFixed(2) ?? "?"} (${m.change24h !== null ? (m.change24h! >= 0 ? "+" : "") + m.change24h!.toFixed(1) + "%" : "?"})`)
    .join(", ")

  return `Crie um relatório ${reportType === "weekly" ? "semanal" : "diário"} de oportunidades para agente de IA autônomo.

TOP OPORTUNIDADES:
${oppLines || "Nenhuma oportunidade encontrada"}

MERCADO CRIPTO (últimas 24h):
${marketLines || "Sem dados de mercado"}

O relatório deve ter:
1. 📊 Resumo executivo (2-3 frases)
2. 🏆 Top 3 oportunidades mais promissoras com justificativa
3. 💹 Destaque de mercado relevante para agentes de código
4. 🎯 Recomendação de ação para hoje
5. 📈 Tendência identificada

Seja direto, use emojis, máximo 400 palavras.`
}

export const generateMarketDigestActivity: Activity = {
  type: "generate-market-digest",
  displayName: "Generate Market Digest",
  description: "Usa LLM para gerar digest de oportunidades e dados de mercado",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as GenerateMarketDigestInput
    const topN = input.top_n ?? 10
    const periodHours = input.period_hours ?? 24
    const reportType = input.report_type ?? "daily"

    const now = Math.floor(Date.now() / 1000)
    const since = now - periodHours * 3600

    // Busca top oportunidades scored
    const opps = await ctx.db
      .select({
        title: oppOpportunities.title,
        type: oppOpportunities.type,
        rewardMax: oppOpportunities.rewardMax,
        rewardMin: oppOpportunities.rewardMin,
        score: oppOpportunities.score,
        nicheId: oppOpportunities.nicheId,
      })
      .from(oppOpportunities)
      .where(eq(oppOpportunities.status, "scored"))
      .orderBy(desc(oppOpportunities.score))
      .limit(topN)

    // Busca dados de mercado recentes
    const marketMoves = await ctx.db
      .select({
        symbol: oppMarketData.symbol,
        price: oppMarketData.price,
        change24h: oppMarketData.change24h,
      })
      .from(oppMarketData)
      .where(gte(oppMarketData.collectedAt, since))
      .orderBy(desc(oppMarketData.change24h))
      .limit(5)

    // Busca niches para enriquecer nomes
    const niches = await ctx.db
      .select({ id: oppNiches.id, displayName: oppNiches.displayName })
      .from(oppNiches)

    if (!ctx.memoryLlm) {
      // Fallback: digest simples sem LLM
      const topOpp = opps[0]
      const digest = opps.length === 0
        ? "Nenhuma oportunidade disponível no momento."
        : `📊 Digest ${reportType}: ${opps.length} oportunidades analisadas. ` +
          `Top: "${topOpp?.title}" (score ${topOpp?.score ?? "?"}). ` +
          `Mercado: ${marketMoves.length} ativos monitorados.`

      return {
        summary: `Digest gerado sem LLM (${opps.length} opps)`,
        extra: { digest, report_type: reportType, opp_count: opps.length },
      }
    }

    const prompt = buildDigestPrompt(opps, niches, marketMoves, reportType)
    const digest = await ctx.memoryLlm({ system: DIGEST_SYSTEM, prompt, maxTokens: 600 })

    return {
      summary: `Digest ${reportType} gerado (${opps.length} opps, ${marketMoves.length} ativos)`,
      extra: { digest, report_type: reportType, opp_count: opps.length },
    }
  },
}
