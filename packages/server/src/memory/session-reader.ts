/**
 * Reads OpenCode sessions and messages from opencode.db for the memory pipeline.
 * Uses a minimal schema to avoid depending on @opencode-ai/opencode.
 */
import { Database as BunDatabase } from "bun:sqlite"
import path from "path"

export interface EligibleSessionOptions {
  /** Only sessions updated on or after this timestamp (ms). */
  sinceTs?: number
  /** Max number of sessions to return. */
  limit?: number
  /** If true, only root sessions (no parent_id). */
  rootsOnly?: boolean
  /** Exclude sessions already present in extractedSessionIds. */
  excludeSessionIds?: Set<string>
}

export interface SessionTranscript {
  sessionId: string
  title: string
  directory: string
  updatedAt: number
  transcript: string
}

function getDbPath(opencodeDbPath: string): string {
  if (path.isAbsolute(opencodeDbPath)) return opencodeDbPath
  return path.resolve(opencodeDbPath)
}

/**
 * Build a plain-text transcript from session messages and parts.
 * message.data is JSON: { role, parts?: [...] }; part.data is JSON: { type, text?, ... }.
 */
function buildTranscript(messages: { data: string }[], partsByMessage: Map<string, { data: string }[]>): string {
  const lines: string[] = []
  for (const msg of messages) {
    let parsed: { role?: string; parts?: unknown[] } | null = null
    try {
      parsed = JSON.parse(msg.data) as { role?: string; parts?: unknown[] }
    } catch {
      continue
    }
    const role = parsed?.role ?? "unknown"
    lines.push(`[${role}]`)
    const parts = parsed?.parts
    if (Array.isArray(parts)) {
      for (const p of parts) {
        if (p && typeof p === "object" && "text" in p && typeof (p as { text: unknown }).text === "string") {
          lines.push((p as { text: string }).text)
        }
      }
    }
    const msgId = (msg as unknown as { id: string }).id
    const partRows = partsByMessage.get(msgId)
    if (partRows) {
      for (const row of partRows) {
        try {
          const part = JSON.parse(row.data) as { type?: string; text?: string; [k: string]: unknown }
          if (part.text) lines.push(part.text)
          if (part.type === "tool_result" && part.output != null) {
            const out = typeof part.output === "string" ? part.output : JSON.stringify(part.output)
            lines.push(out.slice(0, 2000))
          }
        } catch {
          // skip
        }
      }
    }
    lines.push("")
  }
  return lines.join("\n").trim()
}

/**
 * List eligible sessions from opencode.db and return their transcripts.
 */
export async function listEligibleSessions(
  opencodeDbPath: string,
  options: EligibleSessionOptions = {}
): Promise<SessionTranscript[]> {
  const dbPath = getDbPath(opencodeDbPath)
  const db = new BunDatabase(dbPath, { readonly: true })
  try {
    const sinceTs = options.sinceTs ?? 0
    const limit = options.limit ?? 50
    const rootsOnly = options.rootsOnly !== false
    const excludeSessionIds = options.excludeSessionIds ?? new Set<string>()

    const sessionRows = db
      .query<{ id: string; directory: string; title: string; time_updated: number }, [number, number]>(
        rootsOnly
          ? `SELECT id, directory, title, time_updated FROM session
             WHERE parent_id IS NULL AND (time_archived IS NULL OR time_archived = 0) AND time_updated >= ?
             ORDER BY time_updated DESC LIMIT ?`
          : `SELECT id, directory, title, time_updated FROM session
             WHERE (time_archived IS NULL OR time_archived = 0) AND time_updated >= ?
             ORDER BY time_updated DESC LIMIT ?`
      )
      .all(Math.floor(sinceTs / 1000), limit) as {
      id: string
      directory: string
      title: string
      time_updated: number
    }[]

    const results: SessionTranscript[] = []
    for (const row of sessionRows) {
      if (excludeSessionIds.has(row.id)) continue
      const messages = db
        .query<{ id: string; data: string }, [string]>(
          `SELECT id, data FROM message WHERE session_id = ? ORDER BY time_created ASC, id ASC`
        )
        .all(row.id) as { id: string; data: string }[]
      const messageIds = messages.map((m) => m.id)
      const partsByMessage = new Map<string, { data: string }[]>()
      if (messageIds.length > 0) {
        const placeholders = messageIds.map(() => "?").join(",")
        const parts = db
          .query<{ message_id: string; data: string }, string[]>(
            `SELECT message_id, data FROM part WHERE message_id IN (${placeholders}) ORDER BY message_id, id`
          )
          .all(...messageIds) as { message_id: string; data: string }[]
        for (const p of parts) {
          const list = partsByMessage.get(p.message_id) ?? []
          list.push({ data: p.data })
          partsByMessage.set(p.message_id, list)
        }
      }
      const transcript = buildTranscript(messages, partsByMessage)
      results.push({
        sessionId: row.id,
        title: row.title,
        directory: row.directory,
        updatedAt: row.time_updated * 1000,
        transcript,
      })
    }
    return results
  } finally {
    db.close()
  }
}
