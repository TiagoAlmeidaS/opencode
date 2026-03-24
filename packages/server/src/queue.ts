import { ulid } from "ulid"
import { eq, and, asc, sql, inArray } from "drizzle-orm"
import type { ServerDb } from "./db"
import { daemonQueue, repoIssueJobs } from "./schema"
import { getActivity } from "./activity"
import { spawnOpenCode } from "./spawn"
import type { ActivityContext, MemoryLlmOptions } from "./types"

/**
 * Enfileira uma activity com dedup por relatedOpportunityId.
 * Se já existe entrada `pending` ou `running` com o mesmo activityType +
 * relatedOpportunityId, retorna o ID existente sem inserir duplicata.
 */
export async function enqueueDeduped(
  db: ServerDb,
  opts: {
    activityType: string
    input: unknown
    priority?: number
    triggeredBy?: string
    relatedOpportunityId?: string
  },
): Promise<{ id: string; skipped: boolean }> {
  if (opts.relatedOpportunityId) {
    const [existing] = await db
      .select({ id: daemonQueue.id })
      .from(daemonQueue)
      .where(
        and(
          eq(daemonQueue.activityType, opts.activityType),
          eq(daemonQueue.relatedOpportunityId, opts.relatedOpportunityId),
          inArray(daemonQueue.status, ["pending", "running"]),
        ),
      )
      .limit(1)

    if (existing) return { id: existing.id, skipped: true }
  }

  const newId = ulid()
  const ts = Math.floor(Date.now() / 1000)
  await db.insert(daemonQueue).values({
    id: newId,
    activityType: opts.activityType,
    status: "pending",
    priority: opts.priority ?? 5,
    inputJson: JSON.stringify(opts.input ?? {}),
    triggeredBy: opts.triggeredBy ?? null,
    relatedOpportunityId: opts.relatedOpportunityId ?? null,
    createdAt: ts,
  })
  return { id: newId, skipped: false }
}

const TICK_MS = 10_000
const MAX_CONCURRENT = 3
const STALE_LOCK_MS = 55 * 60 * 1000 // 55 min — must exceed LONG_MS (50 min) in implement-code to avoid race
const STALE_JOB_MS = 60 * 60 * 1000 // 1 hour — jobs active with no pending/running steps

export interface QueueProcessorOpts {
  db: ServerDb
  tickIntervalMs?: number
  maxConcurrent?: number
  /** LLM injetado pelo host para Activities que precisam de análise. */
  memoryLlm?: (opts: MemoryLlmOptions) => Promise<string>
  /** Embedding function para Activities de RAG. */
  embed?: (text: string) => Promise<number[]>
}

/**
 * Recursively cancels all pending queue items that depend (directly or
 * transitively) on a failed item. Running items are skipped — they will
 * fail on their own and trigger another round of cascading.
 */
async function cancelDependents(db: ServerDb, failedId: string, failedType: string): Promise<void> {
  const dependents = await db
    .select({ id: daemonQueue.id, activityType: daemonQueue.activityType })
    .from(daemonQueue)
    .where(and(eq(daemonQueue.dependsOn, failedId), eq(daemonQueue.status, "pending")))
  if (dependents.length === 0) return
  const now = Math.floor(Date.now() / 1000)
  for (const dep of dependents) {
    await db
      .update(daemonQueue)
      .set({
        status: "failed",
        errorMessage: `Cancelled: dependency ${failedType} failed`,
        completedAt: now,
      })
      .where(eq(daemonQueue.id, dep.id))
    await cancelDependents(db, dep.id, dep.activityType)
  }
}

export function createQueueProcessor(opts: QueueProcessorOpts) {
  const { db, tickIntervalMs = TICK_MS, maxConcurrent = MAX_CONCURRENT, memoryLlm, embed } = opts
  const workerId = ulid()
  let intervalId: ReturnType<typeof setInterval> | null = null
  let tickCount = 0

  async function recoverStaleLocks() {
    const staleCutoff = Math.floor((Date.now() - STALE_LOCK_MS) / 1000)
    await db
      .update(daemonQueue)
      .set({ status: "pending", lockedBy: null, lockedAt: null })
      .where(
        and(
          eq(daemonQueue.status, "running"),
          sql`${daemonQueue.lockedAt} < ${staleCutoff}`,
        ),
      )
  }

  async function recoverStaleJobs() {
    const staleCutoff = Math.floor((Date.now() - STALE_JOB_MS) / 1000)
    const staleJobs = await db
      .select()
      .from(repoIssueJobs)
      .where(
        and(
          inArray(repoIssueJobs.status, ["spec", "tests", "implementing", "docs", "pr-open"]),
          sql`${repoIssueJobs.updatedAt} < ${staleCutoff}`,
        ),
      )

    for (const job of staleJobs) {
      const [activeStep] = await db
        .select({ id: daemonQueue.id })
        .from(daemonQueue)
        .where(
          and(
            sql`json_extract(${daemonQueue.inputJson}, '$.repo_issue_job_id') = ${job.id}`,
            inArray(daemonQueue.status, ["pending", "running"]),
          ),
        )
        .limit(1)

      if (!activeStep) {
        const now = Math.floor(Date.now() / 1000)
        await db
          .update(repoIssueJobs)
          .set({ status: "failed", updatedAt: now })
          .where(eq(repoIssueJobs.id, job.id))
        console.warn(`[queue] stale job recovered → failed: ${job.id} (was ${job.status})`)
      }
    }
  }

  async function tick() {
    tickCount++
    await recoverStaleLocks()
    if (tickCount % 6 === 0) await recoverStaleJobs().catch((e) => console.error("[queue] recoverStaleJobs error:", e))

    // Find pending items whose dependency (if any) is already completed
    const pendingItems = await db
      .select()
      .from(daemonQueue)
      .where(eq(daemonQueue.status, "pending"))
      .orderBy(asc(daemonQueue.priority), asc(daemonQueue.createdAt))
      .limit(maxConcurrent * 2)

    const eligible: typeof pendingItems = []
    for (const item of pendingItems) {
      if (!item.dependsOn) {
        eligible.push(item)
      } else {
        const [dep] = await db
          .select({ status: daemonQueue.status })
          .from(daemonQueue)
          .where(eq(daemonQueue.id, item.dependsOn))
          .limit(1)
        if (dep?.status === "completed") {
          eligible.push(item)
        }
      }
      if (eligible.length >= maxConcurrent) break
    }

    await Promise.all(eligible.map((item) => processItem(item.id)))
  }

  async function processItem(id: string) {
    const now = Math.floor(Date.now() / 1000)

    // Atomic lock
    await db
      .update(daemonQueue)
      .set({ status: "running", lockedBy: workerId, lockedAt: now, startedAt: now })
      .where(and(eq(daemonQueue.id, id), eq(daemonQueue.status, "pending")))

    const [item] = await db
      .select()
      .from(daemonQueue)
      .where(and(eq(daemonQueue.id, id), eq(daemonQueue.lockedBy, workerId)))
      .limit(1)

    if (!item) return // another worker grabbed it

    const activity = getActivity(item.activityType)
    if (!activity) {
      const completedAt = Math.floor(Date.now() / 1000)
      await db
        .update(daemonQueue)
        .set({
          status: "failed",
          errorMessage: `Unknown activity type: ${item.activityType}`,
          completedAt,
          durationMs: (completedAt - (item.startedAt ?? completedAt)) * 1000,
        })
        .where(eq(daemonQueue.id, id))
      return
    }

    const ctx: ActivityContext = {
      queueItemId: id,
      input: JSON.parse(item.inputJson ?? "{}"),
      db,
      spawnOpenCode,
      memoryLlm,
      embed,
      async enqueue(type, input, opts) {
        const result = await enqueueDeduped(db, {
          activityType: type,
          input,
          priority: opts?.priority ?? 5,
          triggeredBy: id,
          relatedOpportunityId: opts?.relatedOpportunityId,
        })
        if (opts?.dependsOn && !result.skipped) {
          await db
            .update(daemonQueue)
            .set({ dependsOn: opts.dependsOn })
            .where(eq(daemonQueue.id, result.id))
        }
        return result.id
      },
      async updateProgress(step: string) {
        await db
          .update(daemonQueue)
          .set({ outputJson: JSON.stringify({ summary: step }) })
          .where(eq(daemonQueue.id, id))
      },
    }

    try {
      const output = await activity.execute(ctx)
      const completedAt = Math.floor(Date.now() / 1000)
      await db
        .update(daemonQueue)
        .set({
          status: "completed",
          outputJson: output ? JSON.stringify(output) : null,
          completedAt,
          durationMs: (completedAt - (item.startedAt ?? completedAt)) * 1000,
          lockedBy: null,
          lockedAt: null,
        })
        .where(eq(daemonQueue.id, id))
    } catch (err) {
      const completedAt = Math.floor(Date.now() / 1000)
      await db
        .update(daemonQueue)
        .set({
          status: "failed",
          errorMessage: err instanceof Error ? err.message : String(err),
          completedAt,
          durationMs: (completedAt - (item.startedAt ?? completedAt)) * 1000,
          lockedBy: null,
          lockedAt: null,
        })
        .where(eq(daemonQueue.id, id))
      await cancelDependents(db, id, item.activityType).catch((e) =>
        console.error("[queue] cancelDependents error:", e),
      )
      try {
        const inp = JSON.parse(item.inputJson ?? "{}") as { repo_issue_job_id?: string }
        if (inp.repo_issue_job_id) {
          await db
            .update(repoIssueJobs)
            .set({ status: "failed", updatedAt: completedAt })
            .where(eq(repoIssueJobs.id, inp.repo_issue_job_id))
        }
      } catch (jobUpdateErr) {
        console.error("[queue] failed to propagate failure to repoIssueJob:", jobUpdateErr)
      }
    }
  }

  function start() {
    if (intervalId) return
    intervalId = setInterval(() => {
      tick().catch((err) => console.error("[opencode-server] queue tick error:", err))
    }, tickIntervalMs)
    tick().catch((err) => console.error("[opencode-server] queue initial tick error:", err))
  }

  function stop() {
    if (intervalId) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  return { start, stop, tick }
}
