import { ulid } from "ulid"
import { eq } from "drizzle-orm"
import { oppNiches, oppNicheRelations, oppAnalyses, daemonProposals } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"

interface AnalyzeNicheRelationsInput {
  niche_name: string
}

const RELATIONS_SYSTEM = `Você é um especialista em análise de mercado e cadeias de valor em tech.
Identifique relações de negócio entre nichos de mercado para agentes de IA.
Responda APENAS com JSON válido, sem markdown.`

interface RelationResult {
  to_niche: string
  relation_type: "value-chain" | "complement" | "prerequisite" | "competes"
  weight: number        // 0..1
  reasoning: string
}

interface RelationsOutput {
  relations: RelationResult[]
  high_value_signal: boolean   // se o niche merece proposta de pipeline dedicado
  signal_reason?: string
}

function buildRelationsPrompt(
  targetNiche: { name: string; displayName: string; description: string | null },
  allNiches: { name: string; displayName: string }[],
): string {
  const others = allNiches
    .filter((n) => n.name !== targetNiche.name)
    .map((n) => `${n.name} (${n.displayName})`)
    .join(", ")

  return `Analise o niche "${targetNiche.name}" (${targetNiche.displayName}): ${targetNiche.description ?? ""}

Outros niches existentes: ${others}

Para cada relação relevante (máximo 5), identifique:
- to_niche: nome exato do niche relacionado
- relation_type: "value-chain" (um alimenta o outro), "complement" (se usam juntos), "prerequisite" (um precisa do outro), "competes" (concorrem)
- weight: força da relação 0.0-1.0
- reasoning: explicação em 1 frase

Também indique se este niche tem alto potencial para um pipeline de coleta dedicado.

Retorne JSON:
{
  "relations": [
    { "to_niche": "...", "relation_type": "...", "weight": 0.0, "reasoning": "..." }
  ],
  "high_value_signal": false,
  "signal_reason": "..."
}`
}

function parseRelations(text: string): RelationsOutput | null {
  try {
    const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
    return JSON.parse(clean) as RelationsOutput
  } catch {
    return null
  }
}

export const analyzeNicheRelationsActivity: Activity = {
  type: "analyze-niche-relations",
  displayName: "Analyze Niche Relations",
  description: "Usa LLM para mapear relações de cadeia de valor entre um niche novo e os existentes",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as AnalyzeNicheRelationsInput
    if (!input.niche_name) throw new Error("niche_name é obrigatório")

    const [target] = await ctx.db
      .select()
      .from(oppNiches)
      .where(eq(oppNiches.name, input.niche_name))
      .limit(1)

    if (!target) throw new Error(`Niche não encontrado: ${input.niche_name}`)

    // Sem LLM: não há como inferir relações semanticamente
    if (!ctx.memoryLlm) {
      return { summary: `LLM não disponível — relações de "${input.niche_name}" não analisadas` }
    }

    const allNiches = await ctx.db.select({ name: oppNiches.name, displayName: oppNiches.displayName }).from(oppNiches)
    if (allNiches.length < 2) {
      return { summary: "Poucos niches cadastrados para análise de relações" }
    }

    const prompt = buildRelationsPrompt(target, allNiches)
    const now = Math.floor(Date.now() / 1000)

    const raw = await ctx.memoryLlm({ system: RELATIONS_SYSTEM, prompt, maxTokens: 800 })
    const result = parseRelations(raw)

    if (!result) throw new Error(`LLM retornou JSON inválido: ${raw.slice(0, 200)}`)

    // Persiste análise
    await ctx.db.insert(oppAnalyses).values({
      id: ulid(),
      analysisType: "value-chain",
      scope: "niche",
      scopeId: target.id,
      inputSummary: `Relações do niche ${target.name} com ${allNiches.length - 1} outros`,
      output: raw,
      structured: JSON.stringify(result),
      qualityScore: null,
      createdAt: now,
    })

    // Insere relações encontradas
    let created = 0
    let skipped = 0

    for (const rel of result.relations ?? []) {
      const [toNiche] = await ctx.db
        .select({ id: oppNiches.id })
        .from(oppNiches)
        .where(eq(oppNiches.name, rel.to_niche))
        .limit(1)

      if (!toNiche) { skipped++; continue }

      try {
        await ctx.db.insert(oppNicheRelations).values({
          id: ulid(),
          fromNicheId: target.id,
          toNicheId: toNiche.id,
          relationType: rel.relation_type,
          weight: Math.max(0, Math.min(1, rel.weight)),
          reasoning: rel.reasoning,
          createdAt: now,
        })
        created++
      } catch {
        skipped++ // UNIQUE constraint — relação já existe
      }
    }

    // Se sinal de alto valor, cria proposta de novo pipeline de coleta
    if (result.high_value_signal && result.signal_reason) {
      await ctx.db.insert(daemonProposals).values({
        id: ulid(),
        actionType: "create_pipeline",
        title: `Novo scanner para niche "${target.displayName}"`,
        description: `O niche ${target.name} foi identificado como de alto potencial. Considere criar um pipeline de coleta dedicado.`,
        reasoning: result.signal_reason,
        confidence: 0.7,
        riskLevel: "low",
        status: "pending",
        autoApprovable: 0,
        createdAt: now,
      })
    }

    return {
      summary: `${created} relações criadas para "${target.name}", ${skipped} já existiam/inválidas${result.high_value_signal ? " | 🚀 sinal de alto valor detectado" : ""}`,
      extra: { created, skipped, high_value_signal: result.high_value_signal },
    }
  },
}
