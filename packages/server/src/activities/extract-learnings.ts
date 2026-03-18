/**
 * Activity: extract-learnings
 * Analisa submissions com outcomes (accepted/rejected/paid) e extrai aprendizados estruturados
 * para alimentar o cérebro RAG do agente.
 */
import { ulid } from "ulid"
import { desc, eq, inArray, gte, or } from "drizzle-orm"
import { oppSubmissions, oppOpportunities, oppNiches, agentLearnings } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"

interface ExtractLearningsInput {
  mode?: "batch" | "single"
  submission_id?: string  // only for mode=single
  limit?: number          // max submissions to analyze in batch mode (default: 20)
  since_hours?: number    // look back window in hours (default: 168 = 7 days)
}

interface LearningResult {
  category: "skill" | "niche" | "platform" | "pattern"
  key: string
  title: string
  body: string
  confidence: number  // 0.0-1.0
  tags: string[]
  signal: "positive" | "negative" | "neutral"
}

const SYSTEM = `You are an AI agent knowledge extractor. Analyze submission outcomes and extract structured learnings that will help the agent improve over time.
Respond ONLY with valid JSON array, no markdown, no extra text.`

function buildExtractionPrompt(
  submissions: Array<{
    title: string
    type: string
    platform: string
    status: string
    rewardUsd: number | null
    proposalText: string | null
    niche: string | null
    skills: string | null
  }>,
): string {
  const data = submissions.map((s) => ({
    title: s.title.slice(0, 100),
    type: s.type,
    platform: s.platform,
    outcome: s.status,
    reward_usd: s.rewardUsd,
    niche: s.niche,
    skills: s.skills ? (() => { try { return JSON.parse(s.skills) } catch { return s.skills } })() : null,
    proposal_preview: s.proposalText?.slice(0, 300),
  }))

  return `Analyze these ${submissions.length} submission outcomes and extract 3-8 actionable learnings for an AI agent that autonomously applies to opportunities.

SUBMISSIONS:
${JSON.stringify(data, null, 2)}

Extract learnings in these categories:
- "skill": technical skills or tools that correlate with better outcomes
- "niche": insights about specific niches (which are profitable, competitive, well-suited for AI)
- "platform": platform-specific patterns (what works on GitHub vs HackerOne vs Gitcoin, etc.)
- "pattern": general execution patterns (proposal length, approach, timing, etc.)

For each learning, assess whether it's a positive signal (do more of this) or negative (avoid this).

Return JSON array:
[
  {
    "category": "skill" | "niche" | "platform" | "pattern",
    "key": "kebab-case-unique-identifier",
    "title": "Short title (max 60 chars)",
    "body": "Actionable insight in 1-3 sentences. Be specific.",
    "confidence": 0.0-1.0,
    "tags": ["tag1", "tag2"],
    "signal": "positive" | "negative" | "neutral"
  }
]`
}

function parseLearnings(text: string): LearningResult[] {
  try {
    const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
    const arr = JSON.parse(clean)
    if (!Array.isArray(arr)) return []
    return arr.filter(
      (l): l is LearningResult =>
        typeof l.category === "string" &&
        typeof l.key === "string" &&
        typeof l.title === "string" &&
        typeof l.body === "string" &&
        typeof l.confidence === "number",
    )
  } catch {
    return []
  }
}

export const extractLearningsActivity: Activity = {
  type: "extract-learnings",
  displayName: "Extract Learnings",
  description: "Analisa submissions com outcomes e extrai aprendizados para o cérebro RAG",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as ExtractLearningsInput
    const mode = input.mode ?? "batch"
    const limit = Math.max(1, Math.min(50, input.limit ?? 20))
    const sinceHours = input.since_hours ?? 168
    const sinceTs = Math.floor(Date.now() / 1000) - sinceHours * 3600

    // ── Load submissions to analyze ──────────────────────────────────────────
    let submissions: typeof oppSubmissions.$inferSelect[] = []

    if (mode === "single" && input.submission_id) {
      const [row] = await ctx.db
        .select()
        .from(oppSubmissions)
        .where(eq(oppSubmissions.id, input.submission_id))
        .limit(1)
      if (row) submissions = [row]
    } else {
      // Batch: recent submissions with terminal outcomes
      submissions = await ctx.db
        .select()
        .from(oppSubmissions)
        .where(
          inArray(oppSubmissions.status, ["accepted", "rejected", "paid", "submitted"]),
        )
        .orderBy(desc(oppSubmissions.updatedAt))
        .limit(limit)

      // Filter by time window
      submissions = submissions.filter((s) => s.updatedAt >= sinceTs || s.createdAt >= sinceTs)
    }

    if (submissions.length === 0) {
      return {
        summary: "Nenhuma submission com outcome encontrada para extrair aprendizados",
        extra: { skipped: true, reason: "no_submissions" },
      }
    }

    // ── Enrich with opportunity + niche data ─────────────────────────────────
    const oppIds = [...new Set(submissions.map((s) => s.opportunityId))]
    const opps = await ctx.db
      .select()
      .from(oppOpportunities)
      .where(inArray(oppOpportunities.id, oppIds))

    const nicheIds = [...new Set(opps.map((o) => o.nicheId).filter(Boolean) as string[])]
    const niches = nicheIds.length > 0
      ? await ctx.db.select().from(oppNiches).where(inArray(oppNiches.id, nicheIds))
      : []

    const oppMap = new Map(opps.map((o) => [o.id, o]))
    const nicheMap = new Map(niches.map((n) => [n.id, n]))

    const enriched = submissions.map((s) => {
      const opp = oppMap.get(s.opportunityId)
      const niche = opp?.nicheId ? nicheMap.get(opp.nicheId) : null
      return {
        title: opp?.title ?? "Unknown",
        type: opp?.type ?? "unknown",
        platform: s.platform,
        status: s.status,
        rewardUsd: s.rewardUsd,
        proposalText: s.proposalText,
        niche: niche?.name ?? null,
        skills: opp?.skillsRequired ?? null,
      }
    })

    // ── Extract via LLM ──────────────────────────────────────────────────────
    let extracted: LearningResult[] = []

    if (ctx.memoryLlm) {
      const raw = await ctx.memoryLlm({
        system: SYSTEM,
        prompt: buildExtractionPrompt(enriched),
        maxTokens: 1200,
      })
      extracted = parseLearnings(raw)
    } else {
      // Fallback: generate simple stats-based learnings without LLM
      const accepted = enriched.filter((s) => ["accepted", "paid"].includes(s.status))
      const rejected = enriched.filter((s) => s.status === "rejected")
      if (accepted.length > 0) {
        const platforms = [...new Set(accepted.map((s) => s.platform))]
        extracted.push({
          category: "platform",
          key: `platform-success-${platforms[0]}`,
          title: `${platforms[0]} tem bons resultados`,
          body: `${accepted.length} submission(s) aceita(s) em ${platforms.join(", ")}. Priorizar essas plataformas.`,
          confidence: 0.6,
          tags: platforms,
          signal: "positive",
        })
      }
      if (rejected.length > 0) {
        extracted.push({
          category: "pattern",
          key: "pattern-rejection-review",
          title: "Revisar padrão de rejeições",
          body: `${rejected.length} submission(s) rejeitada(s) recentemente. Analisar a qualidade das propostas.`,
          confidence: 0.5,
          tags: ["rejection", "review"],
          signal: "negative",
        })
      }
    }

    if (extracted.length === 0) {
      return {
        summary: "LLM não retornou aprendizados estruturados",
        extra: { skipped: true, reason: "no_learnings_extracted", submissions_analyzed: enriched.length },
      }
    }

    // ── Upsert into agent_learnings ──────────────────────────────────────────
    const now = Math.floor(Date.now() / 1000)
    let created = 0
    let updated = 0

    for (const learning of extracted) {
      const [existing] = await ctx.db
        .select()
        .from(agentLearnings)
        .where(eq(agentLearnings.key, learning.key))
        .limit(1)

      if (existing) {
        // Update: merge confidence (rolling average) and increment signal counters
        const newConfidence = Math.round((existing.confidence * 0.7 + learning.confidence * 0.3) * 100) / 100
        await ctx.db
          .update(agentLearnings)
          .set({
            body: learning.body,
            confidence: newConfidence,
            positiveCount: existing.positiveCount + (learning.signal === "positive" ? 1 : 0),
            negativeCount: existing.negativeCount + (learning.signal === "negative" ? 1 : 0),
            tags: JSON.stringify(learning.tags),
            updatedAt: now,
          })
          .where(eq(agentLearnings.id, existing.id))
        updated++
      } else {
        await ctx.db.insert(agentLearnings).values({
          id: ulid(),
          category: learning.category,
          key: learning.key,
          title: learning.title,
          body: learning.body,
          confidence: learning.confidence,
          source: ctx.queueItemId ?? "manual",
          positiveCount: learning.signal === "positive" ? 1 : 0,
          negativeCount: learning.signal === "negative" ? 1 : 0,
          tags: JSON.stringify(learning.tags),
          createdAt: now,
          updatedAt: now,
        })
        created++
      }
    }

    return {
      summary: `Aprendizados extraídos de ${enriched.length} submissions: ${created} novos, ${updated} atualizados`,
      extra: {
        submissions_analyzed: enriched.length,
        learnings_extracted: extracted.length,
        created,
        updated,
      },
    }
  },
}
