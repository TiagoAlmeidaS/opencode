/**
 * Pipeline: niche-explorer
 * Enfileira discover-niches (LLM → novos opp_niches + opcional analyze-niche-relations).
 * Cron sugerido: 0 4 * * 0 (semanal) ou manual.
 */
import { ulid } from "ulid"
import { daemonQueue } from "../schema"
import { registerPipeline } from "../registry"
import type { PipelineContext, ContentOutput } from "../types"

interface Cfg {
  max_new?: number
  focus_hint?: string
  enqueue_relations?: boolean
}

registerPipeline({
  strategy: "niche-explorer",
  displayName: "Niche Explorer",

  async execute(ctx: PipelineContext): Promise<ContentOutput | void> {
    if (!ctx.db) return
    const cfg = (ctx.config ?? {}) as unknown as Cfg
    const now = Math.floor(Date.now() / 1000)
    const id = ulid()
    await ctx.db.insert(daemonQueue).values({
      id,
      activityType: "discover-niches",
      status: "pending",
      priority: 4,
      inputJson: JSON.stringify({
        max_new: cfg.max_new ?? 5,
        focus_hint: cfg.focus_hint ?? "",
        enqueue_relations: cfg.enqueue_relations !== false,
      }),
      triggeredBy: ctx.jobId,
      createdAt: now,
    })
    return { extra: { queue_item_id: id } }
  },
})
