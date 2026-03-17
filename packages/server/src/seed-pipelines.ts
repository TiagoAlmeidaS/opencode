/**
 * Seeds default pipelines on first run.
 * Only creates pipelines that don't already exist (by strategy).
 * Disable via SEED_DEFAULT_PIPELINES=false.
 */
import { ulid } from "ulid"
import { eq } from "drizzle-orm"
import type { ServerDb } from "./db"
import { daemonPipelines } from "./schema"

const DEFAULTS: Array<{
  strategy: string
  name: string
  scheduleCron: string
  configJson?: Record<string, unknown>
}> = [
  {
    strategy: "daily-opportunity-report",
    name: "Relatório Diário",
    scheduleCron: "0 8 * * *",
    configJson: { top_n: 10, period_hours: 24 },
  },
  {
    strategy: "weekly-opportunity-report",
    name: "Relatório Semanal",
    scheduleCron: "0 9 * * 1",
    configJson: { top_n: 20 },
  },
]

export async function seedDefaultPipelines(db: ServerDb) {
  if (process.env.SEED_DEFAULT_PIPELINES === "false") return
  const now = Math.floor(Date.now() / 1000)
  for (const def of DEFAULTS) {
    const [existing] = await db
      .select({ id: daemonPipelines.id })
      .from(daemonPipelines)
      .where(eq(daemonPipelines.strategy, def.strategy))
      .limit(1)
    if (existing) continue

    await db.insert(daemonPipelines).values({
      id: ulid(),
      name: def.name,
      strategy: def.strategy,
      configJson: JSON.stringify(def.configJson ?? {}),
      scheduleCron: def.scheduleCron,
      enabled: 1,
      maxRetries: 3,
      retryDelaySec: 300,
      createdAt: now,
      updatedAt: now,
    })
  }
}
