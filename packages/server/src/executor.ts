import { ulid } from "ulid"
import { eq } from "drizzle-orm"
import type { ServerDb } from "./db"
import { daemonProposals, daemonPipelines, oppNiches } from "./schema"

export interface ExecutionSummary {
  executed: number
  failed: number
  skipped: number
}

interface ChangeThresholdConfig {
  pipeline: string
  field: string
  from?: number
  to: number | string
}

interface NicheConfig {
  niche: string
  reason?: string
  ai_agent_fit_delta?: number
}

interface DisableScannerConfig {
  scanner: string
  reason?: string
}

interface CreatePipelineConfig {
  strategy: string
  name: string
  scheduleCron?: string
  config?: Record<string, unknown>
}

interface UpdatePromptConfig {
  pipeline: string
  field: string
  new_prompt: string
}

async function applyProposal(db: ServerDb, row: typeof daemonProposals.$inferSelect): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  const config = row.proposedConfig ? (JSON.parse(row.proposedConfig) as Record<string, unknown>) : {}

  switch (row.actionType) {
    case "change_threshold":
    case "increase_batch_size":
    case "update_prompt": {
      const c = config as unknown as ChangeThresholdConfig & UpdatePromptConfig
      const pipelineName = c.pipeline
      const field = c.field
      const value = row.actionType === "update_prompt" ? (c as unknown as UpdatePromptConfig).new_prompt : c.to

      if (!pipelineName || !field || value === undefined) {
        throw new Error(`${row.actionType}: proposedConfig must have pipeline, field, and to/new_prompt`)
      }

      const [pipeline] = await db
        .select()
        .from(daemonPipelines)
        .where(eq(daemonPipelines.strategy, pipelineName))
        .limit(1)

      if (!pipeline) throw new Error(`Pipeline not found: ${pipelineName}`)

      const existing = JSON.parse(pipeline.configJson || "{}")
      const oldValue = existing[field]
      existing[field] = value

      await db
        .update(daemonPipelines)
        .set({ configJson: JSON.stringify(existing), updatedAt: now })
        .where(eq(daemonPipelines.id, pipeline.id))

      console.log(`[executor] ${row.actionType}: ${pipelineName}.${field} = ${JSON.stringify(value)} (was ${JSON.stringify(oldValue)})`)
      break
    }

    case "focus_niche": {
      const c = config as unknown as NicheConfig
      if (!c.niche) throw new Error("focus_niche: proposedConfig must have niche")

      const [niche] = await db
        .select()
        .from(oppNiches)
        .where(eq(oppNiches.name, c.niche))
        .limit(1)

      if (!niche) throw new Error(`Niche not found: ${c.niche}`)

      const delta = c.ai_agent_fit_delta ?? 15
      const newFit = Math.min(100, (niche.aiAgentFit ?? 50) + delta)

      await db
        .update(oppNiches)
        .set({ aiAgentFit: newFit, updatedAt: now })
        .where(eq(oppNiches.id, niche.id))

      console.log(`[executor] focus_niche: ${c.niche}.aiAgentFit ${niche.aiAgentFit} → ${newFit}`)
      break
    }

    case "deprioritize_niche": {
      const c = config as unknown as NicheConfig
      if (!c.niche) throw new Error("deprioritize_niche: proposedConfig must have niche")

      const [niche] = await db
        .select()
        .from(oppNiches)
        .where(eq(oppNiches.name, c.niche))
        .limit(1)

      if (!niche) throw new Error(`Niche not found: ${c.niche}`)

      const newFit = Math.max(0, (niche.aiAgentFit ?? 50) - 20)

      await db
        .update(oppNiches)
        .set({ aiAgentFit: newFit, updatedAt: now })
        .where(eq(oppNiches.id, niche.id))

      console.log(`[executor] deprioritize_niche: ${c.niche}.aiAgentFit ${niche.aiAgentFit} → ${newFit}`)
      break
    }

    case "disable_scanner": {
      const c = config as unknown as DisableScannerConfig
      if (!c.scanner) throw new Error("disable_scanner: proposedConfig must have scanner")

      await db
        .update(daemonPipelines)
        .set({ enabled: 0, updatedAt: now })
        .where(eq(daemonPipelines.strategy, c.scanner))

      console.log(`[executor] disable_scanner: ${c.scanner} disabled`)
      break
    }

    case "create_pipeline": {
      const c = config as unknown as CreatePipelineConfig
      if (!c.strategy || !c.name) throw new Error("create_pipeline: proposedConfig must have strategy and name")

      await db.insert(daemonPipelines).values({
        id: ulid(),
        name: c.name,
        strategy: c.strategy,
        scheduleCron: c.scheduleCron ?? "0 * * * *",
        configJson: JSON.stringify(c.config ?? {}),
        enabled: 1,
        maxRetries: 3,
        retryDelaySec: 300,
        maxRunsPerDay: 0,
        createdAt: now,
        updatedAt: now,
      })

      console.log(`[executor] create_pipeline: created ${c.strategy}`)
      break
    }

    default:
      console.warn(`[executor] Unknown actionType: ${row.actionType} — skipping`)
  }
}

/**
 * Finds all approved proposals and applies their actions.
 * Expired proposals are marked as expired without execution.
 */
export async function executePendingProposals(db: ServerDb): Promise<ExecutionSummary> {
  const summary: ExecutionSummary = { executed: 0, failed: 0, skipped: 0 }
  const rows = await db.select().from(daemonProposals).where(eq(daemonProposals.status, "approved"))
  const now = Math.floor(Date.now() / 1000)

  for (const row of rows) {
    if (row.expiresAt && row.expiresAt < now) {
      await db
        .update(daemonProposals)
        .set({ status: "expired" })
        .where(eq(daemonProposals.id, row.id))
      summary.skipped++
      continue
    }

    try {
      await applyProposal(db, row)
      await db
        .update(daemonProposals)
        .set({ status: "executed", executedAt: now })
        .where(eq(daemonProposals.id, row.id))
      summary.executed++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[executor] Failed to apply proposal ${row.id} (${row.actionType}): ${message}`)
      await db
        .update(daemonProposals)
        .set({ status: "failed" })
        .where(eq(daemonProposals.id, row.id))
      summary.failed++
    }
  }

  return summary
}
