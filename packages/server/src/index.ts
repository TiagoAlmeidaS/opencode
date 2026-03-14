/**
 * OpenCode Server — daemon/scheduler layer for background pipelines.
 * Use with `opencode serve --daemon` or config `server.daemon: true`.
 */
import path from "path"
import { getDb, closeDb, getDefaultDbPath, type ServerDb } from "./db"
import { createScheduler } from "./scheduler"
import { createQueueProcessor } from "./queue"
import { ServerRoutes } from "./routes"
import "./pipelines"
import "./activities"
import type { MemoryLlmOptions } from "./types"

export { getDb, closeDb, getDefaultDbPath }
export type { ServerDb } from "./db"
export { registerPipeline, getPipeline, listPipelineStrategies } from "./registry"
export { registerActivity, getActivity, listActivityTypes } from "./activity"
export { ServerRoutes }
export { createScheduler } from "./scheduler"
export { createQueueProcessor } from "./queue"
export type { Pipeline, PipelineContext, ContentOutput, MemoryLlmOptions, Activity, ActivityContext, ActivityOutput } from "./types"
export * from "./schema"

export interface OpenCodeServerOpts {
  dbPath: string
  daemon?: boolean
  tickIntervalMs?: number
  /** Path to opencode.db for memory pipelines. Defaults to same dir as dbPath with filename opencode.db. */
  opencodeDbPath?: string
  /** Optional LLM for memory extraction/consolidation (e.g. injected by host using OpenCode provider). */
  memoryLlm?: (opts: MemoryLlmOptions) => Promise<string>
  /** Optional embedding function for RAG (memory retrieval). */
  memoryEmbed?: (text: string) => Promise<number[]>
  /** Optional Qdrant URL for RAG (e.g. OPENCODE_QDRANT_URL). */
  qdrantUrl?: string
}

export interface OpenCodeServerInstance {
  db: ServerDb
  routes: ReturnType<typeof ServerRoutes>
  scheduler: ReturnType<typeof createScheduler>
  queue: ReturnType<typeof createQueueProcessor>
  startDaemon(): void
  stopDaemon(): void
}

export function createOpenCodeServer(opts: OpenCodeServerOpts): OpenCodeServerInstance {
  const db = getDb(opts.dbPath)
  const opencodeDbPath =
    opts.opencodeDbPath ?? path.join(path.dirname(opts.dbPath), "opencode.db")
  const scheduler = createScheduler({
    db,
    tickIntervalMs: opts.tickIntervalMs,
    runJobExtra: {
      opencodeDbPath,
      memoryLlm: opts.memoryLlm,
      embed: opts.memoryEmbed,
    },
  })
  const queue = createQueueProcessor({
    db,
    memoryLlm: opts.memoryLlm,
    embed: opts.memoryEmbed,
  })
  const routes = ServerRoutes(db, {
    memoryEmbed: opts.memoryEmbed,
    qdrantUrl: opts.qdrantUrl,
  })

  return {
    db,
    routes,
    scheduler,
    queue,
    startDaemon() {
      if (opts.daemon) {
        scheduler.start()
        queue.start()
      }
    },
    stopDaemon() {
      queue.stop()
      scheduler.stop()
      closeDb()
    },
  }
}
