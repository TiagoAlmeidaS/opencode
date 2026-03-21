/**
 * Pipeline: dev_cycle_learning
 * Extracts structured learnings from completed/failed dev cycle jobs.
 * Reads session transcripts, spec, PR outcome, and error context to produce
 * actionable patterns stored in agent_learnings and indexed in Qdrant.
 */
import { ulid } from "ulid"
import { and, eq, isNull, inArray, desc } from "drizzle-orm"
import type { Pipeline } from "../types"
import { registerPipeline } from "../registry"
import { repoIssueJobs, agentLearnings } from "../schema"
import { listEligibleSessions, type SessionTranscript } from "../memory/session-reader"
import { addChunks } from "../memory/rag"

interface Config {
  since_days?: number
  max_jobs?: number
}

interface Learning {
  category: string
  key: string
  title: string
  body: string
  confidence: number
  tags: string[]
  signal: "positive" | "negative" | "neutral"
}

const SYSTEM = `You are a dev-cycle learning extractor. Analyze the execution context of an automated coding agent job and extract structured learnings.
Focus on actionable patterns that help future jobs succeed. Respond ONLY with valid JSON array.`

function buildPrompt(
  job: typeof repoIssueJobs.$inferSelect,
  transcript: string | null,
): string {
  const outcome = job.pr_outcome ?? (job.status === "failed" ? "failed" : job.status)
  const spec = job.specJson ? (() => { try { return JSON.stringify(JSON.parse(job.specJson), null, 2).slice(0, 2000) } catch { return job.specJson?.slice(0, 2000) } })() : null
  const reviews = job.pr_review_comments?.slice(0, 2000)
  const output = job.cli_output?.slice(-3000)

  return `Analyze this dev cycle job and extract 2-6 actionable learnings.

REPO: ${job.repoFullName}
ISSUE: ${job.issueTitle}
OUTCOME: ${outcome}
${spec ? `\nSPEC (summary):\n${spec}` : ""}
${reviews ? `\nPR REVIEW COMMENTS:\n${reviews}` : ""}
${output ? `\nCLI OUTPUT (tail):\n${output}` : ""}
${transcript ? `\nSESSION TRANSCRIPT (excerpt):\n${transcript.slice(0, 6000)}` : ""}

Extract learnings in categories:
- "dev-cycle": execution patterns (retry behavior, dependency install, test strategy)
- "repo": repo-specific conventions (framework, test runner, package manager, branch naming)
- "pattern": general success/failure patterns
- "error_pattern": specific errors with root cause and fix (include error_type, root_cause, fix_applied in the body as JSON context)

Return JSON array:
[
  {
    "category": "dev-cycle" | "repo" | "pattern" | "error_pattern",
    "key": "kebab-case-id",
    "title": "Short title (max 60 chars)",
    "body": "Actionable insight in 1-3 sentences.",
    "confidence": 0.0-1.0,
    "tags": ["tag1", "tag2"],
    "signal": "positive" | "negative" | "neutral"
  }
]`
}

function parse(text: string): Learning[] {
  try {
    const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
    const arr = JSON.parse(clean)
    if (!Array.isArray(arr)) return []
    return arr.filter(
      (l): l is Learning =>
        typeof l.category === "string" &&
        typeof l.key === "string" &&
        typeof l.title === "string" &&
        typeof l.body === "string" &&
        typeof l.confidence === "number",
    )
  } catch {
    return []
  }
}

const devCycleLearning: Pipeline = {
  strategy: "dev_cycle_learning",
  displayName: "Dev Cycle Learning",
  async execute(ctx) {
    const config = ctx.config as Config
    const db = ctx.db
    const opencodeDbPath = ctx.opencodeDbPath
    if (!db) return { contentType: "learning", platform: "local", title: "Skipped (no DB)", status: "draft" }

    const days = config?.since_days ?? 7
    const maxJobs = config?.max_jobs ?? 20
    const since = Math.floor(Date.now() / 1000) - days * 86400

    const jobs = await db
      .select()
      .from(repoIssueJobs)
      .where(
        and(
          inArray(repoIssueJobs.status, ["completed", "failed"]),
          isNull(repoIssueJobs.learning_extracted_at),
        ),
      )
      .orderBy(desc(repoIssueJobs.updatedAt))
      .limit(maxJobs)

    const eligible = jobs.filter((j) => j.updatedAt >= since)
    if (eligible.length === 0) {
      return { contentType: "learning", platform: "local", title: "No jobs to learn from", status: "draft" }
    }

    let sessions: SessionTranscript[] = []
    if (opencodeDbPath) {
      try {
        sessions = await listEligibleSessions(opencodeDbPath, {
          sinceTs: since * 1000,
          limit: 100,
          rootsOnly: false,
        })
      } catch { /* opencode.db may not exist in some environments */ }
    }
    const sessionMap = new Map(sessions.map((s) => [s.sessionId, s]))

    let created = 0
    let updated = 0
    let indexed = 0
    const now = Math.floor(Date.now() / 1000)

    for (const job of eligible) {
      const transcript = job.session_id ? sessionMap.get(job.session_id)?.transcript ?? null : null

      let learnings: Learning[] = []
      if (ctx.memoryLlm) {
        try {
          const raw = await ctx.memoryLlm({
            system: SYSTEM,
            prompt: buildPrompt(job, transcript),
            maxTokens: 1500,
          })
          learnings = parse(raw)
        } catch { /* LLM failure -- skip job but don't block pipeline */ }
      } else {
        if (job.status === "failed") {
          learnings.push({
            category: "dev-cycle",
            key: `fail-${job.repoFullName.replace(/\//g, "-")}-${job.id.slice(-6)}`,
            title: `Failure in ${job.repoFullName}`,
            body: `Job failed for issue "${job.issueTitle}". CLI output: ${(job.cli_output ?? "unknown").slice(0, 300)}`,
            confidence: 0.4,
            tags: [job.repoFullName],
            signal: "negative",
          })
        }
      }

      for (const l of learnings) {
        const [existing] = await db
          .select()
          .from(agentLearnings)
          .where(eq(agentLearnings.key, l.key))
          .limit(1)

        if (existing) {
          const conf = Math.round((existing.confidence * 0.7 + l.confidence * 0.3) * 100) / 100
          await db
            .update(agentLearnings)
            .set({
              body: l.body,
              confidence: conf,
              positiveCount: existing.positiveCount + (l.signal === "positive" ? 1 : 0),
              negativeCount: existing.negativeCount + (l.signal === "negative" ? 1 : 0),
              tags: JSON.stringify(l.tags),
              updatedAt: now,
            })
            .where(eq(agentLearnings.id, existing.id))
          updated++
        } else {
          await db.insert(agentLearnings).values({
            id: ulid(),
            category: l.category,
            key: l.key,
            title: l.title,
            body: l.body,
            confidence: l.confidence,
            source: "dev-cycle-learning",
            positiveCount: l.signal === "positive" ? 1 : 0,
            negativeCount: l.signal === "negative" ? 1 : 0,
            usedCount: 0,
            helpedCount: 0,
            tags: JSON.stringify(l.tags),
            createdAt: now,
            updatedAt: now,
          })
          created++
        }
      }

      if (ctx.embed && learnings.length > 0) {
        const chunks = learnings.map((l) => ({
          id: `dcl:${l.key}`,
          text: `[${l.category}] ${l.title}\n${l.body}`,
          source: `dev-cycle-learning/${l.key}`,
          metadata: { category: l.category, confidence: l.confidence, signal: l.signal, repo: job.repoFullName },
        }))
        if (await addChunks(chunks)) indexed += chunks.length
      }

      await db
        .update(repoIssueJobs)
        .set({ learning_extracted_at: now })
        .where(eq(repoIssueJobs.id, job.id))
    }

    return {
      contentType: "learning",
      platform: "local",
      title: `Dev cycle learning: ${eligible.length} jobs → ${created} new, ${updated} updated`,
      status: "draft",
      extra: { jobs: eligible.length, created, updated, indexed },
    }
  },
}

registerPipeline(devCycleLearning)
