import { ulid } from "ulid"
import { eq, and, asc, sql } from "drizzle-orm"
import type { ServerDb } from "./db"
import { daemonQueue } from "./schema"
import { getActivity } from "./activity"
import { spawnOpenCode } from "./spawn"
import type { ActivityContext } from "./types"

const TICK_MS = 10_000
const MAX_CONCURRENT = 3
const STALE_LOCK_MS = 30 * 60 * 1000 // 30 minutes

export interface QueueProcessorOpts {
  db: ServerDb
  tickIntervalMs?: number
  maxConcurrent?: number
}

export function createQueueProcessor(opts: QueueProcessorOpts) {
  const { db, tickIntervalMs = TICK_MS, maxConcurrent = MAX_CONCURRENT } = opts
  const workerId = ulid()
  let intervalId: ReturnType<typeof setInterval> | null = null

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

  async function tick() {
    await recoverStaleLocks()

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
      async enqueue(type, input, opts) {
        const newId = ulid()
        const ts = Math.floor(Date.now() / 1000)
        await db.insert(daemonQueue).values({
          id: newId,
          activityType: type,
          status: "pending",
          priority: opts?.priority ?? 5,
          dependsOn: opts?.dependsOn ?? null,
          inputJson: JSON.stringify(input ?? {}),
          triggeredBy: id,
          createdAt: ts,
        })
        return newId
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
