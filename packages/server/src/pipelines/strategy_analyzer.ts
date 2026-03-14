/**
 * Strategy Analyzer pipeline (stub).
 * Full flow: load metrics/revenue/goals -> build prompt -> LLM -> parse proposals -> store; auto-approve low-risk.
 * This stub creates one placeholder proposal; wire OpenCode provider for real analysis.
 */
import type { Pipeline } from "../types"
import { registerPipeline } from "../registry"
import { daemonProposals } from "../schema"
import { ulid } from "ulid"

export interface StrategyAnalyzerConfig {
  llm?: { provider?: string; model?: string }
  analysis_window_days?: number
  min_confidence_for_auto_approve?: number
  max_auto_approve_risk?: string
  max_proposals_per_run?: number
}

const strategyAnalyzer: Pipeline = {
  strategy: "strategy_analyzer",
  displayName: "Strategy Analyzer",
  async execute(ctx) {
    const config = ctx.config as StrategyAnalyzerConfig
    if (!ctx.db) return
    const now = Math.floor(Date.now() / 1000)
    await ctx.db.insert(daemonProposals).values({
      id: ulid(),
      pipelineId: ctx.pipelineId,
      actionType: "scale_up",
      title: "[Stub] Scale up content frequency",
      description: "Placeholder proposal from strategy_analyzer stub.",
      reasoning: "Migrated pipeline; wire LLM for real analysis.",
      confidence: config?.min_confidence_for_auto_approve ?? 0.85,
      riskLevel: config?.max_auto_approve_risk ?? "low",
      status: "pending",
      autoApprovable: 1,
      createdAt: now,
    })
  },
}

registerPipeline(strategyAnalyzer)
