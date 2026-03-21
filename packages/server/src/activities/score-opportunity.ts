import { ulid } from "ulid"
import { eq, inArray, desc, gte, sql } from "drizzle-orm"
import { oppOpportunities, oppAnalyses, projectSpecs, agentLearnings, oppSubmissions, oppNiches } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"
import { compileSpecToPrompt } from "../spec-compiler"

interface ScoreOpportunityInput {
  opportunity_id: string
  spec_id?: string
  classify_min_score?: number      // propagado do pipeline config (default: 60)
  auto_execute_min_score?: number  // propagado para classify-niche (default: 75)
  alert_min_score?: number         // threshold para alerta Telegram (default: 90)
  score_system_prompt?: string
  score_content_system_prompt?: string
  classify_system_prompt?: string
}

interface ScoreResult {
  score: number               // 0..100
  reason: string              // explicação resumida
  niche_suggestion: string    // nome do niche sugerido (ex: "ai-tooling")
  difficulty_estimate: string // 'easy'|'medium'|'hard'|'expert'
  ai_agent_suitable: boolean  // se um AI agent consegue executar sozinho
  estimated_hours: number     // estimativa de horas de trabalho
  risk_level: string          // 'low'|'medium'|'high'
}

export const SCORE_SYSTEM = `Você é um analista especializado em avaliar oportunidades de trabalho para agentes de IA.
Avalie se a oportunidade é adequada para um agente como o OpenCode (AI que escreve código autonomamente).
Responda APENAS com JSON válido, sem markdown, sem texto extra.`

const SCORE_CONTENT_SYSTEM = `Você é um analista especializado em avaliar oportunidades de criação de conteúdo para agentes de IA.
Avalie se a oportunidade é adequada para um agente que escreve texto, roteiros, copy ou artigos autonomamente.
Responda APENAS com JSON válido, sem markdown, sem texto extra.`

function buildContentPrompt(opp: {
  type: string
  title: string
  description: string | null
  rewardMin: number | null
  rewardMax: number | null
  skillsRequired: string | null
  difficulty: string | null
  sourcePlatform: string
}): string {
  const reward = opp.rewardMax
    ? `$${opp.rewardMin ?? 0}–$${opp.rewardMax}`
    : opp.rewardMin
    ? `$${opp.rewardMin}`
    : "não especificado"

  const skills = opp.skillsRequired
    ? (JSON.parse(opp.skillsRequired) as string[]).join(", ")
    : "não especificado"

  return `Avalie esta oportunidade de trabalho para um agente de IA que escreve texto/conteúdo:

Tipo: ${opp.type}
Plataforma: ${opp.sourcePlatform}
Título: ${opp.title}
Recompensa: ${reward}
Skills: ${skills}
Dificuldade declarada: ${opp.difficulty ?? "não informada"}
Descrição: ${(opp.description ?? "").slice(0, 1500)}

Retorne JSON com exatamente estes campos:
{
  "score": <0-100>,
  "reason": "<explicação em 1-2 frases>",
  "niche_suggestion": "<nome-do-niche em kebab-case: content-copywriting|content-scriptwriting|content-blog|content-social|ai-content>",
  "difficulty_estimate": "<easy|medium|hard|expert>",
  "ai_agent_suitable": <true|false>,
  "estimated_hours": <número>,
  "risk_level": "<low|medium|high>"
}

Critérios de pontuação:
- 80-100: especificação clara, formato definido (palavras, estrutura), entrega digital, sem entrevista humana
- 60-79: recompensa razoável OU brief bem especificado, possível para AI agent
- 40-59: possível mas depende de tom de voz ou contexto humano
- 0-39: inadequado (requer reuniões, voz humana, domínio ultra-específico, ou sem recompensa clara)`
}

function buildPrompt(opp: {
  type: string
  title: string
  description: string | null
  rewardMin: number | null
  rewardMax: number | null
  skillsRequired: string | null
  difficulty: string | null
  sourcePlatform: string
}): string {
  const reward = opp.rewardMax
    ? `$${opp.rewardMin ?? 0}–$${opp.rewardMax}`
    : opp.rewardMin
    ? `$${opp.rewardMin}`
    : "não especificado"

  const skills = opp.skillsRequired
    ? (JSON.parse(opp.skillsRequired) as string[]).join(", ")
    : "não especificado"

  return `Avalie esta oportunidade de trabalho para um agente de IA que escreve código:

Tipo: ${opp.type}
Plataforma: ${opp.sourcePlatform}
Título: ${opp.title}
Recompensa: ${reward}
Skills: ${skills}
Dificuldade declarada: ${opp.difficulty ?? "não informada"}
Descrição: ${(opp.description ?? "").slice(0, 1500)}

Retorne JSON com exatamente estes campos:
{
  "score": <0-100>,
  "reason": "<explicação em 1-2 frases>",
  "niche_suggestion": "<nome-do-niche em kebab-case, ex: ai-tooling>",
  "difficulty_estimate": "<easy|medium|hard|expert>",
  "ai_agent_suitable": <true|false>,
  "estimated_hours": <número>,
  "risk_level": "<low|medium|high>"
}

Critérios de pontuação:
- 80-100: alta recompensa, bem especificado, skills que um AI agent domina (TypeScript, Python, etc.)
- 60-79: recompensa razoável OU especificação boa, possível para AI agent
- 40-59: possível mas depende de contexto humano ou domínio especializado
- 0-39: inadequado (requer hardware físico, comunicação humana, domínio ultra-específico, ou sem recompensa clara)`
}

async function buildLearningsContext(
  ctx: ActivityContext,
  platform: string,
): Promise<string> {
  const rows = await ctx.db
    .select()
    .from(agentLearnings)
    .where(inArray(agentLearnings.category, ["niche", "platform", "pattern"]))
    .orderBy(desc(agentLearnings.confidence))
    .limit(6)

  const lines = rows
    .filter((r) => {
      if (r.category === "platform") {
        const tags: string[] = r.tags ? (JSON.parse(r.tags) as string[]) : []
        return tags.some((t) => platform.toLowerCase().includes(t.toLowerCase())) || tags.length === 0
      }
      return true
    })
    .map((r) => `- [${r.category}] ${r.title} (confidence: ${r.confidence}): ${r.body}`)

  // Win rates by niche (last 30 days) — helps calibrate score for nichos históricos
  const cutoff = Math.floor(Date.now() / 1000) - 30 * 86400
  const winRatesRaw = await ctx.db
    .select({
      niche: oppNiches.name,
      total: sql<number>`count(${oppSubmissions.id})`,
      won: sql<number>`sum(case when ${oppSubmissions.status} in ('accepted', 'paid') then 1 else 0 end)`,
    })
    .from(oppSubmissions)
    .leftJoin(oppOpportunities, eq(oppSubmissions.opportunityId, oppOpportunities.id))
    .leftJoin(oppNiches, eq(oppOpportunities.nicheId, oppNiches.id))
    .where(gte(oppSubmissions.createdAt, cutoff))
    .groupBy(oppNiches.name)
    .limit(10)

  const winRateLines = winRatesRaw
    .filter((r) => Number(r.total) >= 2) // só nichos com histórico relevante
    .map((r) => {
      const rate = Math.round((Number(r.won) / Number(r.total)) * 100)
      const signal = rate >= 50 ? "✓" : rate >= 25 ? "~" : "✗"
      return `  ${signal} ${r.niche ?? "unknown"}: ${Number(r.won)}/${Number(r.total)} won (${rate}% win rate)`
    })

  const parts: string[] = []
  if (lines.length > 0) {
    parts.push(`PAST LEARNINGS (use to calibrate your score):\n${lines.join("\n")}`)
  }
  if (winRateLines.length > 0) {
    parts.push(`HISTORICAL WIN RATES BY NICHE (last 30d — ✓=good ✗=avoid):\n${winRateLines.join("\n")}`)
  }

  return parts.length > 0 ? "\n\n" + parts.join("\n\n") : ""
}

function parseScoreResult(text: string): ScoreResult | null {
  try {
    // Remove possível markdown ```json ... ``` caso o LLM não respeite o system prompt
    const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
    const parsed = JSON.parse(clean) as Partial<ScoreResult>

    return {
      score: Math.max(0, Math.min(100, Number(parsed.score ?? 0))),
      reason: String(parsed.reason ?? ""),
      niche_suggestion: String(parsed.niche_suggestion ?? ""),
      difficulty_estimate: String(parsed.difficulty_estimate ?? "medium"),
      ai_agent_suitable: Boolean(parsed.ai_agent_suitable),
      estimated_hours: Number(parsed.estimated_hours ?? 0),
      risk_level: String(parsed.risk_level ?? "medium"),
    }
  } catch {
    return null
  }
}

export const scoreOpportunityActivity: Activity = {
  type: "score-opportunity",
  displayName: "Score Opportunity",
  description: "Usa LLM para pontuar e classificar uma oportunidade de 0 a 100",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as ScoreOpportunityInput
    if (!input.opportunity_id) throw new Error("opportunity_id é obrigatório")

    if (!ctx.memoryLlm) {
      // Sem LLM disponível: aplica score heurístico básico
      return scoreHeuristic(ctx, input.opportunity_id)
    }

    const [opp] = await ctx.db
      .select()
      .from(oppOpportunities)
      .where(eq(oppOpportunities.id, input.opportunity_id))
      .limit(1)

    if (!opp) throw new Error(`Oportunidade não encontrada: ${input.opportunity_id}`)
    if (opp.status !== "new") {
      return { summary: `Oportunidade ${input.opportunity_id} já foi processada (status: ${opp.status})` }
    }

    const isContent = opp.type === "content"
    const prompt = isContent ? buildContentPrompt(opp) : buildPrompt(opp)
    const baseSystem = isContent
      ? (input.score_content_system_prompt || SCORE_CONTENT_SYSTEM)
      : (input.score_system_prompt || SCORE_SYSTEM)
    const now = Math.floor(Date.now() / 1000)

    let specPrefix = ""
    if (input.spec_id) {
      const [spec] = await ctx.db.select().from(projectSpecs).where(eq(projectSpecs.id, input.spec_id)).limit(1)
      if (spec) specPrefix = compileSpecToPrompt(spec) + "\n\n---\n\n"
    }

    const learningsContext = await buildLearningsContext(ctx, opp.sourcePlatform)
    const system = specPrefix + baseSystem + learningsContext

    const llm = ctx.llmRouter
      ? (opts: import("../types").MemoryLlmOptions) => ctx.llmRouter!.call("analysis", opts)
      : ctx.memoryLlm
    if (!llm) throw new Error("Nenhum LLM configurado para score-opportunity")
    const rawOutput = await llm({
      system,
      prompt,
      maxTokens: 512,
    })

    const result = parseScoreResult(rawOutput)
    if (!result) {
      throw new Error(`LLM retornou JSON inválido: ${rawOutput.slice(0, 200)}`)
    }

    // Persiste análise
    const analysisId = ulid()
    await ctx.db.insert(oppAnalyses).values({
      id: analysisId,
      analysisType: "opportunity-score",
      scope: "opportunity",
      scopeId: opp.id,
      inputSummary: `${opp.type} | ${opp.title.slice(0, 100)}`,
      output: rawOutput,
      structured: JSON.stringify(result),
      qualityScore: result.score / 100,
      createdAt: now,
    })

    // Atualiza oportunidade
    await ctx.db
      .update(oppOpportunities)
      .set({
        score: result.score,
        scoreReason: result.reason,
        llmAnalysis: JSON.stringify(result),
        difficulty: result.difficulty_estimate,
        status: "scored",
        updatedAt: now,
      })
      .where(eq(oppOpportunities.id, opp.id))

    const classifyMinScore = input.classify_min_score ?? 60
    const alertMinScore = input.alert_min_score ?? 90

    // Se score alto, enfileira classificação de niche
    if (result.score >= classifyMinScore) {
      await ctx.enqueue(
        "classify-niche",
        {
          opportunity_id: opp.id,
          niche_suggestion: result.niche_suggestion,
          auto_execute_min_score: input.auto_execute_min_score ?? 75,
          ...(input.classify_system_prompt ? { classify_system_prompt: input.classify_system_prompt } : {}),
        },
        { priority: 5, relatedOpportunityId: opp.id },
      )
    }

    // Alerta imediato para oportunidades excepcionais
    if (result.score >= alertMinScore) {
      await ctx.enqueue(
        "send-telegram-alert",
        { opportunity_id: opp.id, score: result.score },
        { priority: 1 },
      )
    }

    return {
      summary: `Score ${result.score}/100 — ${result.reason}`,
      extra: { score: result.score, niche: result.niche_suggestion, suitable: result.ai_agent_suitable },
    }
  },
}

// Fallback heurístico quando LLM não está disponível
async function scoreHeuristic(ctx: ActivityContext, opportunityId: string): Promise<ActivityOutput> {
  const [opp] = await ctx.db
    .select()
    .from(oppOpportunities)
    .where(eq(oppOpportunities.id, opportunityId))
    .limit(1)

  if (!opp) throw new Error(`Oportunidade não encontrada: ${opportunityId}`)

  let score = 30 // base
  const reasons: string[] = []

  // Recompensa
  const maxReward = opp.rewardMax ?? opp.rewardMin ?? 0
  if (maxReward >= 1000) { score += 30; reasons.push("recompensa alta") }
  else if (maxReward >= 200) { score += 15; reasons.push("recompensa razoável") }
  else if (maxReward > 0) { score += 5; reasons.push("recompensa baixa") }

  // Tipo
  if (opp.type === "oss-bounty") { score += 10; reasons.push("OSS bounty") }
  else if (opp.type === "freelance") { score += 8; reasons.push("freelance") }
  else if (opp.type === "content") { score += 8; reasons.push("conteúdo") }

  // Skills conhecidos de AI agents
  const skills = opp.skillsRequired ? (JSON.parse(opp.skillsRequired) as string[]) : []
  const agentSkills = ["typescript", "javascript", "python", "rust", "node", "api", "cli", "llm"]
  const contentSkills = ["writing", "copy", "content", "blog", "script", "copywriting"]
  const hasAgentSkill = skills.some((s) => agentSkills.includes(s.toLowerCase()))
  const hasContentSkill = skills.some((s) => contentSkills.some((c) => s.toLowerCase().includes(c)))
  if (hasAgentSkill || (opp.type === "content" && hasContentSkill)) {
    score += 10
    reasons.push(opp.type === "content" ? "skills de conteúdo" : "skills compatíveis com AI agent")
  }

  score = Math.min(100, score)
  const now = Math.floor(Date.now() / 1000)

  await ctx.db
    .update(oppOpportunities)
    .set({
      score,
      scoreReason: reasons.join(", ") || "score heurístico (sem LLM)",
      status: "scored",
      updatedAt: now,
    })
    .where(eq(oppOpportunities.id, opportunityId))

  return {
    summary: `Score heurístico ${score}/100 — ${reasons.join(", ")}`,
    extra: { score, heuristic: true },
  }
}
