import type { ServerDb } from "./db"
import { getPipeline } from "./registry"
import type { PipelineContext, ContentOutput } from "./types"
import { daemonJobs, daemonContent, daemonLogs } from "./schema"
import { eq } from "drizzle-orm"
import { ulid } from "ulid"

export interface RunJobExtra {
  opencodeDbPath?: string
  memoryLlm?: PipelineContext["memoryLlm"]
  embed?: PipelineContext["embed"]
}

export async function runJob(
  db: ServerDb,
  pipelineId: string,
  pipelineRow: { id: string; name: string; strategy: string; configJson: string },
  extra?: RunJobExtra
): Promise<{ jobId: string; ok: boolean; error?: string }> {
  const pipeline = getPipeline(pipelineRow.strategy)
  if (!pipeline) {
    return { jobId: "", ok: false, error: `Unknown strategy: ${pipelineRow.strategy}` }
  }

  const jobId = ulid()
  const now = Math.floor(Date.now() / 1000)
  await db.insert(daemonJobs).values({
    id: jobId,
    pipelineId,
    status: "pending",
    attempt: 1,
    createdAt: now,
  })

  const startedAt = Math.floor(Date.now() / 1000)
  await db.update(daemonJobs).set({ status: "running", startedAt }).where(eq(daemonJobs.id, jobId))

  const ctx: PipelineContext = {
    pipelineId,
    jobId,
    config: JSON.parse(pipelineRow.configJson || "{}"),
    db,
    opencodeDbPath: extra?.opencodeDbPath,
    memoryLlm: extra?.memoryLlm,
    embed: extra?.embed,
  }

  try {
    const result = await pipeline.execute(ctx)
    const completedAt = Math.floor(Date.now() / 1000)
    const durationMs = (completedAt - startedAt) * 1000
    await db
      .update(daemonJobs)
      .set({
        status: "completed",
        completedAt,
        durationMs,
        outputJson: result ? JSON.stringify(result) : null,
      })
      .where(eq(daemonJobs.id, jobId))

    if (result && (result.contentId || result.title)) {
      const contentId = (result as ContentOutput).contentId ?? ulid()
      await db.insert(daemonContent).values({
        id: contentId,
        jobId,
        pipelineId,
        contentType: (result as ContentOutput).contentType ?? "article",
        platform: (result as ContentOutput).platform ?? "local",
        title: (result as ContentOutput).title ?? null,
        slug: (result as ContentOutput).slug ?? null,
        url: (result as ContentOutput).url ?? null,
        status: (result as ContentOutput).status ?? "draft",
        wordCount: (result as ContentOutput).wordCount ?? null,
        llmModel: (result as ContentOutput).llmModel ?? null,
        llmTokensUsed: (result as ContentOutput).llmTokensUsed ?? null,
        llmCostUsd: (result as ContentOutput).llmCostUsd ?? null,
        createdAt: now,
      })
    }

    return { jobId, ok: true }
  } catch (err) {
    const completedAt = Math.floor(Date.now() / 1000)
    const durationMs = (completedAt - startedAt) * 1000
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack ?? null : null
    await db
      .update(daemonJobs)
      .set({
        status: "failed",
        completedAt,
        durationMs,
        errorMessage: message,
        errorStack: stack,
      })
      .where(eq(daemonJobs.id, jobId))
    await db.insert(daemonLogs).values({
      pipelineId,
      jobId,
      level: "error",
      message,
      contextJson: stack ? JSON.stringify({ stack }) : null,
      createdAt: completedAt,
    })
    return { jobId, ok: false, error: message }
  }
}
