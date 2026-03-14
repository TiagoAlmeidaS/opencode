import type { ServerDb } from "./db"
import { runJob } from "./runner"
import { cronMatches } from "./cron"
import { executePendingProposals } from "./executor"
import { daemonPipelines, daemonJobs } from "./schema"
import { eq, and } from "drizzle-orm"

const TICK_MS = 60_000

export interface SchedulerOpts {
  db: ServerDb
  tickIntervalMs?: number
}

export function createScheduler(opts: SchedulerOpts) {
  const { db, tickIntervalMs = TICK_MS } = opts
  let intervalId: ReturnType<typeof setInterval> | null = null

  async function tick() {
    const now = new Date()
    const pipelines = await db
      .select()
      .from(daemonPipelines)
      .where(eq(daemonPipelines.enabled, 1))

    for (const row of pipelines) {
      if (!cronMatches(row.scheduleCron, now)) continue

      const [running] = await db
        .select()
        .from(daemonJobs)
        .where(
          and(
            eq(daemonJobs.pipelineId, row.id),
            eq(daemonJobs.status, "running")
          )
        )
        .limit(1)
      if (running) continue

      const [pending] = await db
        .select()
        .from(daemonJobs)
        .where(
          and(
            eq(daemonJobs.pipelineId, row.id),
            eq(daemonJobs.status, "pending")
          )
        )
        .orderBy(daemonJobs.createdAt)
        .limit(1)
      if (pending) continue

      await runJob(db, row.id, {
        id: row.id,
        name: row.name,
        strategy: row.strategy,
        configJson: row.configJson,
      })
    }

    await executePendingProposals(db).catch((err) => {
      console.error("[opencode-server] proposal executor error:", err)
    })
  }

  function start() {
    if (intervalId) return
    intervalId = setInterval(() => {
      tick().catch((err) => {
        console.error("[opencode-server] scheduler tick error:", err)
      })
    }, tickIntervalMs)
    tick().catch((err) => console.error("[opencode-server] initial tick error:", err))
  }

  function stop() {
    if (intervalId) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  return { start, stop, tick }
}
