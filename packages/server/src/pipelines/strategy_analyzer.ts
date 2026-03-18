/**
 * Pipeline: strategy_analyzer
 * Analisa métricas de performance do agente e gera proposals estratégicas.
 * Cron sugerido: 0 8 * * 1 (toda segunda-feira às 8h)
 */
import { ulid } from "ulid"
import { eq, gte, desc, sql } from "drizzle-orm"
import {
  oppSubmissions,
  oppOpportunities,
  oppNiches,
  agentLearnings,
  daemonRevenue,
  daemonGoals,
  daemonProposals,
  daemonPipelines,
  daemonQueue,
} from "../schema"
import { registerPipeline } from "../registry"
import { executePendingProposals } from "../executor"
import type { PipelineContext, ContentOutput } from "../types"

export interface StrategyAnalyzerConfig {
  analysis_window_days?: number
  min_confidence_for_auto_approve?: number
  max_auto_approve_risk?: string
  max_proposals_per_run?: number
}

interface ProposalDraft {
  actionType: string
  title: string
  description: string
  reasoning: string
  proposedConfig: Record<string, unknown>
  riskLevel: "low" | "medium" | "high"
  confidence: number
}

const STRATEGY_SYSTEM = `You are a strategic analyst for an autonomous AI agent that finds and executes work opportunities (bug bounties, freelance, grants, content).
Your job: analyze performance metrics and propose 2-5 concrete actionable changes to improve the agent's win rate and revenue.
Respond ONLY with a valid JSON array of proposals, no markdown, no extra text.`

function buildMetricsPrompt(metrics: {
  windowDays: number
  winByNiche: Array<{ niche: string | null; total: number; won: number; avgReward: number }>
  winByPlatform: Array<{ platform: string; total: number; won: number }>
  revenue30d: number
  goals: Array<{ name: string; target: number; current: number; unit: string }>
  topLearnings: Array<{ title: string; confidence: number; signal: string; category: string }>
  activityFailures: Array<{ type: string; failed: number; total: number }>
  queueBacklog: number
  activePipelines: Array<{ strategy: string; enabled: number; configJson: string }>
}): string {
  const nicheStats = metrics.winByNiche.length > 0
    ? metrics.winByNiche
        .map((n) => {
          const rate = n.total > 0 ? Math.round((n.won / n.total) * 100) : 0
          return `  ${n.niche ?? "unclassified"}: ${n.total} submissions, ${n.won} won (${rate}% win rate), avg reward $${n.avgReward}`
        })
        .join("\n")
    : "  No submission data yet"

  const platformStats = metrics.winByPlatform.length > 0
    ? metrics.winByPlatform
        .map((p) => {
          const rate = p.total > 0 ? Math.round((p.won / p.total) * 100) : 0
          return `  ${p.platform}: ${p.total} submissions, ${p.won} won (${rate}% win rate)`
        })
        .join("\n")
    : "  No platform data yet"

  const goalStats = metrics.goals.length > 0
    ? metrics.goals.map((g) => `  ${g.name}: ${g.current}/${g.target} ${g.unit}`).join("\n")
    : "  No goals configured"

  const failureStats = metrics.activityFailures.length > 0
    ? metrics.activityFailures
        .map((a) => {
          const rate = a.total > 0 ? Math.round((a.failed / a.total) * 100) : 0
          return `  ${a.type}: ${a.failed}/${a.total} failed (${rate}% failure rate)`
        })
        .join("\n")
    : "  No failures detected"

  return `Analyze the following performance data for an autonomous AI agent (last ${metrics.windowDays} days):

REVENUE:
  Total earned: $${metrics.revenue30d} USD

WIN RATES BY NICHE:
${nicheStats}

WIN RATES BY PLATFORM:
${platformStats}

ACTIVE GOALS:
${goalStats}

ACTIVITY FAILURE RATES:
${failureStats}

QUEUE BACKLOG: ${metrics.queueBacklog} pending items

TOP LEARNINGS (high confidence):
${metrics.topLearnings.length > 0 ? metrics.topLearnings.map((l) => `  [${l.category}/${l.signal}] ${l.title} (${l.confidence})`).join("\n") : "  None yet"}

CURRENT PIPELINE CONFIG:
${metrics.activePipelines.map((p) => `  ${p.strategy} (enabled=${p.enabled}): ${p.configJson.slice(0, 150)}`).join("\n")}

Based on this data, propose 2-5 concrete changes that would maximize revenue and win rate.

Return JSON array of proposals:
[
  {
    "actionType": "change_threshold" | "focus_niche" | "deprioritize_niche" | "disable_scanner" | "increase_batch_size" | "create_pipeline" | "update_prompt",
    "title": "<short title max 80 chars>",
    "description": "<what you observed and why this change is needed>",
    "reasoning": "<data-backed reasoning>",
    "proposedConfig": {<actionType-specific JSON>},
    "riskLevel": "low" | "medium" | "high",
    "confidence": <0.0-1.0>
  }
]

ProposedConfig by actionType:
- change_threshold: {"pipeline": "opportunity-analyst", "field": "auto_execute_min_score", "from": 75, "to": 70}
- focus_niche: {"niche": "web3-security", "reason": "62% win rate", "ai_agent_fit_delta": 15}
- deprioritize_niche: {"niche": "content-blog", "reason": "17% win rate"}
- disable_scanner: {"scanner": "scan-gitcoin-bounties", "reason": "0 accepted in 30d"}
- increase_batch_size: {"pipeline": "opportunity-analyst", "field": "batch_size", "from": 20, "to": 40}
- create_pipeline: {"strategy": "new-strategy", "name": "New Pipeline", "scheduleCron": "0 * * * *", "config": {}}
- update_prompt: {"pipeline": "opportunity-analyst", "field": "score_system_prompt", "new_prompt": "<improved prompt>"}`
}

function parseProposals(text: string): ProposalDraft[] {
  try {
    const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
    const arr = JSON.parse(clean)
    if (!Array.isArray(arr)) return []
    return arr
      .filter(
        (p): p is ProposalDraft =>
          typeof p.actionType === "string" &&
          typeof p.title === "string" &&
          typeof p.description === "string" &&
          p.proposedConfig !== null &&
          typeof p.proposedConfig === "object" &&
          ["low", "medium", "high"].includes(p.riskLevel),
      )
      .slice(0, 5)
  } catch {
    return []
  }
}

registerPipeline({
  strategy: "strategy_analyzer",
  displayName: "Strategy Analyzer",

  async execute(ctx: PipelineContext): Promise<ContentOutput | void> {
    if (!ctx.db) return
    const config = ctx.config as unknown as StrategyAnalyzerConfig
    const windowDays = config.analysis_window_days ?? 30
    const minConfidenceAutoApprove = config.min_confidence_for_auto_approve ?? 0.85
    const maxAutoApproveRisk = config.max_auto_approve_risk ?? "low"
    const maxProposals = config.max_proposals_per_run ?? 5
    const cutoff = Math.floor(Date.now() / 1000) - windowDays * 86400
    const now = Math.floor(Date.now() / 1000)

    // ── 1. Win rates by niche ─────────────────────────────────────────────────
    const winByNicheRaw = await ctx.db
      .select({
        niche: oppNiches.name,
        total: sql<number>`count(${oppSubmissions.id})`,
        won: sql<number>`sum(case when ${oppSubmissions.status} in ('accepted', 'paid') then 1 else 0 end)`,
        avgReward: sql<number>`coalesce(avg(case when ${oppSubmissions.status} in ('accepted', 'paid') then ${oppSubmissions.rewardUsd} end), 0)`,
      })
      .from(oppSubmissions)
      .leftJoin(oppOpportunities, eq(oppSubmissions.opportunityId, oppOpportunities.id))
      .leftJoin(oppNiches, eq(oppOpportunities.nicheId, oppNiches.id))
      .where(gte(oppSubmissions.createdAt, cutoff))
      .groupBy(oppNiches.name)

    const winByNiche = winByNicheRaw.map((r) => ({
      niche: r.niche,
      total: Number(r.total),
      won: Number(r.won),
      avgReward: Math.round(Number(r.avgReward)),
    }))

    // ── 2. Win rates by platform ──────────────────────────────────────────────
    const winByPlatformRaw = await ctx.db
      .select({
        platform: oppSubmissions.platform,
        total: sql<number>`count(${oppSubmissions.id})`,
        won: sql<number>`sum(case when ${oppSubmissions.status} in ('accepted', 'paid') then 1 else 0 end)`,
      })
      .from(oppSubmissions)
      .where(gte(oppSubmissions.createdAt, cutoff))
      .groupBy(oppSubmissions.platform)

    const winByPlatform = winByPlatformRaw.map((r) => ({
      platform: r.platform,
      total: Number(r.total),
      won: Number(r.won),
    }))

    // ── 3. Revenue ────────────────────────────────────────────────────────────
    const [revenueRow] = await ctx.db
      .select({ total: sql<number>`coalesce(sum(${daemonRevenue.amount}), 0)` })
      .from(daemonRevenue)
      .where(gte(daemonRevenue.createdAt, cutoff))

    const revenue30d = Math.round(Number(revenueRow?.total ?? 0))

    // ── 4. Goals ──────────────────────────────────────────────────────────────
    const goals = await ctx.db
      .select({
        name: daemonGoals.name,
        target: daemonGoals.targetValue,
        current: daemonGoals.currentValue,
        unit: daemonGoals.targetUnit,
      })
      .from(daemonGoals)
      .where(eq(daemonGoals.status, "active"))
      .limit(5)

    // ── 5. Top learnings ──────────────────────────────────────────────────────
    const learningsRaw = await ctx.db
      .select({
        title: agentLearnings.title,
        confidence: agentLearnings.confidence,
        category: agentLearnings.category,
        positiveCount: agentLearnings.positiveCount,
        negativeCount: agentLearnings.negativeCount,
      })
      .from(agentLearnings)
      .orderBy(desc(agentLearnings.confidence))
      .limit(8)

    const topLearnings = learningsRaw.map((l) => ({
      title: l.title,
      confidence: l.confidence,
      category: l.category,
      signal: l.positiveCount > l.negativeCount ? "positive" : l.negativeCount > l.positiveCount ? "negative" : "neutral",
    }))

    // ── 6. Activity failure rates ─────────────────────────────────────────────
    const failureRaw = await ctx.db
      .select({
        type: daemonQueue.activityType,
        total: sql<number>`count(*)`,
        failed: sql<number>`sum(case when ${daemonQueue.status} = 'failed' then 1 else 0 end)`,
      })
      .from(daemonQueue)
      .where(gte(daemonQueue.createdAt, cutoff))
      .groupBy(daemonQueue.activityType)

    const activityFailures = failureRaw
      .map((r) => ({ type: r.type, total: Number(r.total), failed: Number(r.failed) }))
      .filter((r) => r.failed > 0)
      .sort((a, b) => b.failed - a.failed)

    // ── 7. Queue backlog ──────────────────────────────────────────────────────
    const [backlogRow] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(daemonQueue)
      .where(eq(daemonQueue.status, "pending"))

    const queueBacklog = Number(backlogRow?.count ?? 0)

    // ── 8. Active pipelines ───────────────────────────────────────────────────
    const activePipelines = await ctx.db
      .select({ strategy: daemonPipelines.strategy, enabled: daemonPipelines.enabled, configJson: daemonPipelines.configJson })
      .from(daemonPipelines)
      .limit(15)

    // ── 9. Call LLM ───────────────────────────────────────────────────────────
    if (!ctx.memoryLlm) {
      return {
        extra: {
          skipped: true,
          reason: "no_llm",
          metrics_snapshot: { revenue30d, niches: winByNiche.length, queue_backlog: queueBacklog },
        },
      } as ContentOutput
    }

    const rawOutput = await ctx.memoryLlm({
      system: STRATEGY_SYSTEM,
      prompt: buildMetricsPrompt({ windowDays, winByNiche, winByPlatform, revenue30d, goals, topLearnings, activityFailures, queueBacklog, activePipelines }),
      maxTokens: 2000,
    })

    const proposals = parseProposals(rawOutput).slice(0, maxProposals)

    if (proposals.length === 0) {
      return {
        extra: { skipped: true, reason: "no_proposals_parsed", raw: rawOutput.slice(0, 200) },
      } as ContentOutput
    }

    // ── 10. Store proposals ───────────────────────────────────────────────────
    const riskRanks: Record<string, number> = { low: 0, medium: 1, high: 2 }
    const maxRiskRank = riskRanks[maxAutoApproveRisk] ?? 0
    let stored = 0
    let autoApproved = 0

    for (const p of proposals) {
      const isAutoApprovable =
        p.confidence >= minConfidenceAutoApprove &&
        (riskRanks[p.riskLevel] ?? 2) <= maxRiskRank

      await ctx.db.insert(daemonProposals).values({
        id: ulid(),
        pipelineId: ctx.pipelineId,
        actionType: p.actionType,
        title: p.title.slice(0, 200),
        description: p.description.slice(0, 1000),
        reasoning: (p.reasoning ?? p.description).slice(0, 500),
        confidence: Math.min(1, Math.max(0, p.confidence)),
        riskLevel: (["low", "medium", "high"] as const).includes(p.riskLevel as "low" | "medium" | "high") ? p.riskLevel : "medium",
        status: isAutoApprovable ? "approved" : "pending",
        proposedConfig: JSON.stringify(p.proposedConfig),
        metricsSnapshot: JSON.stringify({ revenue30d, winByNiche, winByPlatform }),
        autoApprovable: isAutoApprovable ? 1 : 0,
        expiresAt: now + windowDays * 86400,
        createdAt: now,
      })

      stored++
      if (isAutoApprovable) autoApproved++
    }

    // Execute auto-approved proposals immediately
    if (autoApproved > 0) {
      await executePendingProposals(ctx.db)
    }

    return {
      extra: {
        proposals_generated: proposals.length,
        proposals_stored: stored,
        auto_approved: autoApproved,
        revenue_30d: revenue30d,
        win_rates: winByNiche.slice(0, 5).map((n) => ({
          niche: n.niche,
          win_rate: n.total > 0 ? Math.round((n.won / n.total) * 100) : 0,
        })),
      },
    } as ContentOutput
  },
})
