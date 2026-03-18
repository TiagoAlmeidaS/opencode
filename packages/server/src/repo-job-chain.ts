import { eq } from "drizzle-orm"
import type { ServerDb } from "./db"
import { daemonQueue } from "./schema"
import { enqueueDeduped } from "./queue"

const STEPS: [string, number][] = [
  ["generate-spec", 5],
  ["generate-tdd-tests", 5],
  ["implement-code", 5],
  ["generate-docs", 6],
  ["open-pr", 6],
  ["notify-pr-approval", 7],
]

/**
 * Enfileira ciclo completo. dedupKey: opp.id ou repo-job:{jobId} para dedup na fila.
 */
export async function enqueueDevCycleChain(
  db: ServerDb,
  opts: { jobId: string; dedupKey: string; triggeredBy?: string },
): Promise<{ firstId: string; skipped: boolean }> {
  const base = { repo_issue_job_id: opts.jobId }
  let prev: string | null = null
  let skipped = false
  for (let i = 0; i < STEPS.length; i++) {
    const [type, pri] = STEPS[i]
    const r = await enqueueDeduped(db, {
      activityType: type,
      input: base,
      priority: pri,
      triggeredBy: opts.triggeredBy ?? "dev-cycle",
      relatedOpportunityId: opts.dedupKey,
    })
    if (i === 0 && r.skipped) {
      skipped = true
      return { firstId: r.id, skipped: true }
    }
    if (prev) {
      await db.update(daemonQueue).set({ dependsOn: prev }).where(eq(daemonQueue.id, r.id))
    }
    prev = r.id
  }
  return { firstId: prev!, skipped: false }
}
