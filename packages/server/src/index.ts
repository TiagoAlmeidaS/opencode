/**
 * OpenCode Server — daemon/scheduler layer for background pipelines.
 * Use with `opencode serve --daemon` or config `server.daemon: true`.
 */
import { getDb, closeDb, getDefaultDbPath, type ServerDb } from "./db"
import { createScheduler } from "./scheduler"
import { ServerRoutes } from "./routes"
import "./pipelines"

export { getDb, closeDb, getDefaultDbPath }
export type { ServerDb } from "./db"
export { registerPipeline, getPipeline, listPipelineStrategies } from "./registry"
export { ServerRoutes }
export { createScheduler } from "./scheduler"
export type { Pipeline, PipelineContext, ContentOutput } from "./types"
export * from "./schema"

export interface OpenCodeServerOpts {
  dbPath: string
  daemon?: boolean
  tickIntervalMs?: number
}

export interface OpenCodeServerInstance {
  db: ServerDb
  routes: ReturnType<typeof ServerRoutes>
  scheduler: ReturnType<typeof createScheduler>
  startDaemon(): void
  stopDaemon(): void
}

export function createOpenCodeServer(opts: OpenCodeServerOpts): OpenCodeServerInstance {
  const db = getDb(opts.dbPath)
  const scheduler = createScheduler({
    db,
    tickIntervalMs: opts.tickIntervalMs,
  })
  const routes = ServerRoutes(db)

  return {
    db,
    routes,
    scheduler,
    startDaemon() {
      if (opts.daemon) scheduler.start()
    },
    stopDaemon() {
      scheduler.stop()
      closeDb()
    },
  }
}
