import type { ServerDb } from "./db"
import { daemonProposals } from "./schema"
import { eq } from "drizzle-orm"

export interface ExecutionSummary {
  executed: number
  failed: number
  skipped: number
}

/**
 * Execute approved proposals: mark as executed (and optionally apply action).
 * Minimal implementation: set status = 'executed', executed_at = now.
 */
export async function executePendingProposals(db: ServerDb): Promise<ExecutionSummary> {
  const summary: ExecutionSummary = { executed: 0, failed: 0, skipped: 0 }
  const rows = await db
    .select()
    .from(daemonProposals)
    .where(eq(daemonProposals.status, "approved"))

  const now = Math.floor(Date.now() / 1000)
  for (const row of rows) {
    try {
      await db
        .update(daemonProposals)
        .set({ status: "executed", executedAt: now })
        .where(eq(daemonProposals.id, row.id))
      summary.executed++
    } catch {
      await db
        .update(daemonProposals)
        .set({ status: "failed" })
        .where(eq(daemonProposals.id, row.id))
      summary.failed++
    }
  }
  return summary
}
