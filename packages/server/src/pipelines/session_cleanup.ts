/**
 * Pipeline: session_cleanup
 * Retention policy for CLI sessions. Deletes messages and parts from
 * sessions older than retention_days (default 7) that have already been
 * processed by memory_extract. Keeps session rows for metadata reference.
 */
import { Database as BunDatabase } from "bun:sqlite"
import type { Pipeline } from "../types"
import { registerPipeline } from "../registry"
import { memoryExtractions } from "../schema"

interface Config {
  retention_days?: number
}

const sessionCleanup: Pipeline = {
  strategy: "session_cleanup",
  displayName: "Session Cleanup",
  async execute(ctx) {
    const config = ctx.config as Config
    const days = config?.retention_days ?? 7
    const opencodeDbPath = ctx.opencodeDbPath
    const db = ctx.db

    if (!opencodeDbPath) {
      return { contentType: "maintenance", platform: "local", title: "Skipped (no opencode DB path)", status: "draft" }
    }

    const cutoff = Math.floor(Date.now() / 1000) - days * 86400

    const extracted = new Set<string>()
    if (db) {
      const rows = await db.select({ sessionId: memoryExtractions.sessionId }).from(memoryExtractions)
      for (const r of rows) extracted.add(r.sessionId)
    }

    let odb: BunDatabase
    try {
      odb = new BunDatabase(opencodeDbPath, { readonly: false })
    } catch {
      return { contentType: "maintenance", platform: "local", title: "Cannot open opencode.db for write", status: "draft" }
    }

    try {
      const stale = odb
        .query<{ id: string }, [number]>(
          `SELECT id FROM session WHERE time_updated < ? AND (time_archived IS NULL OR time_archived = 0)`,
        )
        .all(cutoff) as { id: string }[]

      let cleaned = 0
      let skipped = 0

      for (const row of stale) {
        if (!extracted.has(row.id)) {
          skipped++
          continue
        }

        odb.run(`DELETE FROM part WHERE session_id = ?`, [row.id])
        odb.run(`DELETE FROM message WHERE session_id = ?`, [row.id])
        odb.run(`UPDATE session SET time_archived = ? WHERE id = ?`, [Math.floor(Date.now() / 1000), row.id])
        cleaned++
      }

      return {
        contentType: "maintenance",
        platform: "local",
        title: `Session cleanup: ${cleaned} archived, ${skipped} skipped (not yet extracted)`,
        status: "draft",
        extra: { cleaned, skipped, staleTotal: stale.length, retentionDays: days },
      }
    } finally {
      odb.close()
    }
  },
}

registerPipeline(sessionCleanup)
