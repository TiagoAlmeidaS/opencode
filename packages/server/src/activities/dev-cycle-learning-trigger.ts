/**
 * Activity: dev-cycle-learning
 * Extrai learnings de um único repoIssueJob imediatamente após completar/falhar.
 * Enfileirado automaticamente por notify-pr-approval (completed) e pelo
 * queue processor (failed). Mesma lógica do pipeline dev_cycle_learning,
 * mas focado em um job específico e sem acesso ao opencode.db.
 */
import { ulid } from "ulid"
import { eq } from "drizzle-orm"
import { repoIssueJobs, agentLearnings } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"
import { addChunks } from "../memory/rag"

interface Input {
  repo_issue_job_id: string
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

function buildPrompt(job: typeof repoIssueJobs.$inferSelect): string {
  const outcome = job.pr_outcome ?? (job.status === "failed" ? "failed" : job.status)
  const spec = job.specJson
    ? (() => { try { return JSON.stringify(JSON.parse(job.specJson), null, 2).slice(0, 2000) } catch { return job.specJson?.slice(0, 2000) } })()
    : null
  const reviews = job.pr_review_comments?.slice(0, 2000)
  const output = job.cli_output?.slice(-3000)

  return `Analyze this dev cycle job and extract 2-6 actionable learnings.

REPO: ${job.repoFullName}
ISSUE: ${job.issueTitle}
OUTCOME: ${outcome}
${spec ? `\nSPEC (summary):\n${spec}` : ""}
${reviews ? `\nPR REVIEW COMMENTS:\n${reviews}` : ""}
${output ? `\nCLI OUTPUT (tail):\n${output}` : ""}

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

export const devCycleLearningTriggerActivity: Activity = {
  type: "dev-cycle-learning",
  displayName: "Dev Cycle Learning (trigger)",
  description: "Extrai learnings de um repoIssueJob específico imediatamente após completion/failure",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as Input
    if (!input.repo_issue_job_id) {
      return { summary: "repo_issue_job_id ausente", extra: { skipped: true } }
    }

    const [job] = await ctx.db
      .select()
      .from(repoIssueJobs)
      .where(eq(repoIssueJobs.id, input.repo_issue_job_id))
      .limit(1)

    if (!job) {
      return { summary: "Job não encontrado", extra: { skipped: true } }
    }

    // Skip if already extracted
    if (job.learning_extracted_at) {
      return { summary: "Learnings já extraídos para este job", extra: { skipped: true } }
    }

    let learnings: Learning[] = []
    const memLlm = ctx.llmRouter
      ? (opts: import("../types").MemoryLlmOptions) => ctx.llmRouter!.call("memory", opts)
      : ctx.memoryLlm

    if (memLlm) {
      try {
        const raw = await memLlm({
          system: SYSTEM,
          prompt: buildPrompt(job),
          maxTokens: 1500,
        })
        learnings = parse(raw)
      } catch { /* LLM failure — fall through to heuristic */ }
    }

    // Heuristic fallback
    if (learnings.length === 0 && job.status === "failed") {
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

    if (learnings.length === 0) {
      const now = Math.floor(Date.now() / 1000)
      await ctx.db.update(repoIssueJobs).set({ learning_extracted_at: now }).where(eq(repoIssueJobs.id, job.id))
      return { summary: "Nenhum learning extraído", extra: { skipped: true, reason: "no_learnings" } }
    }

    const now = Math.floor(Date.now() / 1000)
    let created = 0
    let updated = 0

    for (const l of learnings) {
      const [existing] = await ctx.db
        .select()
        .from(agentLearnings)
        .where(eq(agentLearnings.key, l.key))
        .limit(1)

      if (existing) {
        const conf = Math.round((existing.confidence * 0.7 + l.confidence * 0.3) * 100) / 100
        await ctx.db
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
        await ctx.db.insert(agentLearnings).values({
          id: ulid(),
          category: l.category,
          key: l.key,
          title: l.title,
          body: l.body,
          confidence: l.confidence,
          source: "dev-cycle-learning",
          positiveCount: l.signal === "positive" ? 1 : 0,
          negativeCount: l.signal === "negative" ? 1 : 0,
          tags: JSON.stringify(l.tags),
          usedCount: 0,
          helpedCount: 0,
          createdAt: now,
          updatedAt: now,
        })
        created++
      }
    }

    // Index in Qdrant
    let indexed = 0
    if (ctx.embed && learnings.length > 0) {
      const chunks = learnings.map((l) => ({
        id: `dcl:${l.key}`,
        text: `[${l.category}] ${l.title}\n${l.body}`,
        source: `dev-cycle-learning/${l.key}`,
        metadata: { category: l.category, confidence: l.confidence, signal: l.signal, repo: job.repoFullName },
      }))
      if (await addChunks(chunks)) indexed = chunks.length
    }

    await ctx.db
      .update(repoIssueJobs)
      .set({ learning_extracted_at: now })
      .where(eq(repoIssueJobs.id, job.id))

    return {
      summary: `Dev cycle learning: ${created} new, ${updated} updated${indexed > 0 ? `, ${indexed} indexed` : ""}`,
      extra: { created, updated, indexed, job_id: job.id },
    }
  },
}
