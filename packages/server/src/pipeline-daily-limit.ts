import { and, eq, gte, lt, sql } from "drizzle-orm"
import type { ServerDb } from "./db"
import { daemonJobs } from "./schema"

export function utcDayStartUnix(nowSec: number): number {
  const d = new Date(nowSec * 1000)
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000)
}

export async function countPipelineJobsToday(db: ServerDb, pipelineId: string, nowSec: number): Promise<number> {
  const start = utcDayStartUnix(nowSec)
  const end = start + 86400
  const [r] = await db
    .select({ n: sql<number>`count(*)` })
    .from(daemonJobs)
    .where(
      and(eq(daemonJobs.pipelineId, pipelineId), gte(daemonJobs.createdAt, start), lt(daemonJobs.createdAt, end)),
    )
  return Number(r?.n ?? 0)
}

export function dailyLimitBlocks(maxPerDay: number, countToday: number): boolean {
  return maxPerDay > 0 && countToday >= maxPerDay
}
