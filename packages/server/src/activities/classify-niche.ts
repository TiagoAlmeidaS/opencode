import { ulid } from "ulid"
import { eq, sql } from "drizzle-orm"
import { oppOpportunities, oppNiches } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"

interface ClassifyNicheInput {
  opportunity_id: string
  niche_suggestion?: string  // sugestão do score-opportunity (kebab-case)
}

const CLASSIFY_SYSTEM = `Você é um especialista em classificar oportunidades de trabalho em nichos de mercado.
Responda APENAS com JSON válido, sem markdown, sem texto extra.`

function buildClassifyPrompt(
  opp: { type: string; title: string; description: string | null; skillsRequired: string | null },
  availableNiches: { name: string; displayName: string; description: string | null }[],
  suggestion: string,
): string {
  const nicheList = availableNiches
    .map((n) => `- ${n.name}: ${n.displayName} — ${n.description ?? ""}`)
    .join("\n")

  return `Classifique a oportunidade abaixo no niche mais adequado da lista.

Oportunidade:
Tipo: ${opp.type}
Título: ${opp.title}
Skills: ${opp.skillsRequired ? JSON.parse(opp.skillsRequired).join(", ") : "não informado"}
Descrição: ${(opp.description ?? "").slice(0, 800)}
Sugestão prévia: ${suggestion || "nenhuma"}

Niches disponíveis:
${nicheList}

Retorne JSON:
{
  "niche_name": "<nome exato do niche da lista ou novo nome em kebab-case>",
  "is_new_niche": <true se não está na lista>,
  "display_name": "<nome legível se is_new_niche>",
  "description": "<descrição se is_new_niche>",
  "ai_agent_fit": <0-100 se is_new_niche>,
  "confidence": <0.0-1.0>
}`
}

interface ClassifyResult {
  niche_name: string
  is_new_niche: boolean
  display_name?: string
  description?: string
  ai_agent_fit?: number
  confidence: number
}

function parseClassifyResult(text: string): ClassifyResult | null {
  try {
    const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
    return JSON.parse(clean) as ClassifyResult
  } catch {
    return null
  }
}

export const classifyNicheActivity: Activity = {
  type: "classify-niche",
  displayName: "Classify Niche",
  description: "Classifica uma oportunidade no niche correto, criando niches novos quando necessário",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as ClassifyNicheInput
    if (!input.opportunity_id) throw new Error("opportunity_id é obrigatório")

    const [opp] = await ctx.db
      .select()
      .from(oppOpportunities)
      .where(eq(oppOpportunities.id, input.opportunity_id))
      .limit(1)

    if (!opp) throw new Error(`Oportunidade não encontrada: ${input.opportunity_id}`)

    const niches = await ctx.db.select().from(oppNiches)
    const now = Math.floor(Date.now() / 1000)

    let nicheName = input.niche_suggestion ?? ""
    let isNew = false

    if (ctx.memoryLlm) {
      const prompt = buildClassifyPrompt(opp, niches, input.niche_suggestion ?? "")
      const raw = await ctx.memoryLlm({ system: CLASSIFY_SYSTEM, prompt, maxTokens: 256 })
      const result = parseClassifyResult(raw)

      if (result) {
        nicheName = result.niche_name
        isNew = result.is_new_niche

        if (isNew && result.display_name) {
          // Verifica se já existe (pode ter sido criado por outra activity em paralelo)
          const [existing] = await ctx.db
            .select({ id: oppNiches.id })
            .from(oppNiches)
            .where(eq(oppNiches.name, nicheName))
            .limit(1)

          if (!existing) {
            const newNicheId = ulid()
            await ctx.db.insert(oppNiches).values({
              id: newNicheId,
              name: nicheName,
              displayName: result.display_name,
              description: result.description ?? null,
              aiAgentFit: result.ai_agent_fit ?? 50,
              trendScore: null,
              opportunityCount: 0,
              keywords: null,
              createdAt: now,
              updatedAt: now,
            })

            // Enfileira análise de relações para o novo niche
            await ctx.enqueue("analyze-niche-relations", { niche_name: nicheName }, { priority: 8 })
          }
        }
      }
    } else if (input.niche_suggestion) {
      // Sem LLM: usa a sugestão direta do score-opportunity
      nicheName = input.niche_suggestion
    }

    // Busca o niche final
    let nicheId: string | null = null
    if (nicheName) {
      const [found] = await ctx.db
        .select({ id: oppNiches.id })
        .from(oppNiches)
        .where(eq(oppNiches.name, nicheName))
        .limit(1)

      if (found) {
        nicheId = found.id
        // Incrementa contador de oportunidades do niche
        await ctx.db
          .update(oppNiches)
          .set({
            opportunityCount: sql`${oppNiches.opportunityCount} + 1`,
            updatedAt: now,
          })
          .where(eq(oppNiches.id, found.id))
      }
    }

    // Atualiza oportunidade com o niche
    await ctx.db
      .update(oppOpportunities)
      .set({ nicheId, status: "scored", updatedAt: now })
      .where(eq(oppOpportunities.id, opp.id))

    return {
      summary: `Oportunidade classificada em "${nicheName || "sem niche"}"${isNew ? " (niche novo criado)" : ""}`,
      extra: { niche_name: nicheName, niche_id: nicheId, is_new: isNew },
    }
  },
}
