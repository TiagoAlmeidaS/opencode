/**
 * Memory pipeline — Phase 1: extract raw memory and session summary from OpenCode sessions.
 * Reads opencode.db, calls LLM (if provided) per session, persists to memory_extractions.
 */
import type { Pipeline } from "../types"
import { registerPipeline } from "../registry"
import { listEligibleSessions } from "../memory/session-reader"
import { memoryExtractions } from "../schema"
import { ulid } from "ulid"

export interface MemoryExtractConfig {
  /** Only process sessions updated in the last N days. */
  since_days?: number
  /** Max sessions to process per run. */
  max_sessions_per_run?: number
  /** Min transcript length (chars) to process; skip shorter. */
  min_transcript_length?: number
}

const EXTRACT_SYSTEM = `You are a memory extraction agent. Given a conversation transcript from a coding assistant session, extract:
1. raw_memory: Learnings, user preferences, procedures that worked, failure patterns, and any reusable knowledge. Be concise but specific. Use bullet points.
2. session_summary: One short paragraph (2-4 sentences) summarizing what the session was about and the outcome.

Output ONLY valid JSON with exactly these two keys: "raw_memory" (string) and "session_summary" (string). No markdown, no code fence.`

function buildExtractPrompt(transcript: string, title: string, directory: string): string {
  return `Session title: ${title}
Directory: ${directory}

Transcript:
---
${transcript.slice(0, 30000)}
---

Extract raw_memory and session_summary as JSON.`
}

function parseExtractOutput(text: string): { raw_memory: string; session_summary: string } | null {
  const trimmed = text.trim()
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  try {
    const parsed = JSON.parse(jsonMatch[0]) as unknown
    if (parsed && typeof parsed === "object" && "raw_memory" in parsed && "session_summary" in parsed) {
      return {
        raw_memory: String((parsed as { raw_memory: unknown }).raw_memory),
        session_summary: String((parsed as { session_summary: unknown }).session_summary),
      }
    }
  } catch {
    // fallback: treat whole as raw_memory, first line as summary
  }
  return {
    raw_memory: trimmed.slice(0, 15000),
    session_summary: trimmed.slice(0, 500).split("\n")[0] || "Session",
  }
}

const memoryExtract: Pipeline = {
  strategy: "memory_extract",
  displayName: "Memory Extract (Phase 1)",
  async execute(ctx) {
    const config = ctx.config as MemoryExtractConfig
    const opencodeDbPath = ctx.opencodeDbPath
    const db = ctx.db
    if (!opencodeDbPath || !db) {
      return {
        contentType: "memory",
        platform: "local",
        title: "Memory extract skipped (no opencode DB or server DB)",
        status: "draft",
      }
    }

    const sinceDays = config?.since_days ?? 7
    const maxSessions = config?.max_sessions_per_run ?? 20
    const minTranscriptLength = config?.min_transcript_length ?? 100

    const sinceTs = Date.now() - sinceDays * 24 * 60 * 60 * 1000

    const existing = await db.select({ sessionId: memoryExtractions.sessionId }).from(memoryExtractions)
    const excludeSessionIds = new Set(existing.map((r) => r.sessionId))

    const sessions = await listEligibleSessions(opencodeDbPath, {
      sinceTs,
      limit: maxSessions,
      rootsOnly: true,
      excludeSessionIds,
    })

    let extracted = 0
    const now = Math.floor(Date.now() / 1000)
    for (const s of sessions) {
      if (s.transcript.length < minTranscriptLength) continue
      const prompt = buildExtractPrompt(s.transcript, s.title, s.directory)
      let rawMemory: string
      let sessionSummary: string
      const memLlm = ctx.llmRouter
        ? (opts: import("../types").MemoryLlmOptions) => ctx.llmRouter!.call("memory", opts)
        : ctx.memoryLlm
      if (memLlm) {
        try {
          const out = await memLlm({
            prompt,
            system: EXTRACT_SYSTEM,
            maxTokens: 2000,
          })
          const parsed = parseExtractOutput(out)
          if (parsed) {
            rawMemory = parsed.raw_memory
            sessionSummary = parsed.session_summary
          } else {
            rawMemory = out.slice(0, 15000)
            sessionSummary = s.title
          }
        } catch (err) {
          rawMemory = `[Extraction failed: ${err instanceof Error ? err.message : String(err)}]\n${s.transcript.slice(0, 5000)}`
          sessionSummary = s.title
        }
      } else {
        rawMemory = s.transcript.slice(0, 15000)
        sessionSummary = s.title
      }
      await db.insert(memoryExtractions).values({
        id: ulid(),
        sessionId: s.sessionId,
        rawMemory,
        sessionSummary,
        sourceUpdatedAt: Math.floor(s.updatedAt / 1000),
        createdAt: now,
      })
      extracted++
    }

    return {
      contentType: "memory",
      platform: "local",
      title: `Memory extract: ${extracted} sessions`,
      status: "draft",
      extra: { extracted, totalEligible: sessions.length },
    }
  },
}

registerPipeline(memoryExtract)
