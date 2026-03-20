/**
 * Pipeline: self_improvement
 * Analyzes recent failures, learnings and patterns to propose improvement
 * issues on GitHub. Issues are labeled 'self-improvement' and require an
 * 'approved' label (added by a human) before repo_issue_worker picks them up.
 */
import { ulid } from "ulid"
import { and, eq, inArray, desc, gte } from "drizzle-orm"
import { registerPipeline } from "../registry"
import type { Pipeline, PipelineContext, ContentOutput } from "../types"
import { repoIssueJobs, agentLearnings, daemonQueue, selfImprovementProposals } from "../schema"
import { createGitHubIssue, issueExists } from "../github-utils"

interface Config {
  target_repo: string
  since_days?: number
  max_proposals?: number
  issue_label?: string
  approved_label?: string
}

interface Proposal {
  title: string
  body: string
  priority: number
  category: string
}

const SYSTEM = `You are a senior software engineer analyzing an autonomous coding system.
Based on the data provided (recent failures, agent learnings, queue errors), propose concrete improvements.
Each proposal should be a GitHub issue that another AI agent can implement.
Respond ONLY with a valid JSON array.`

function buildPrompt(
  failures: { repo: string; title: string; error: string }[],
  learnings: { category: string; title: string; body: string; confidence: number }[],
  queueErrors: { type: string; error: string }[],
  repo: string,
): string {
  return `Analyze the following data from the last week and propose up to 3 improvement issues for repo "${repo}".

RECENT FAILURES (${failures.length}):
${failures.map((f) => `- [${f.repo}] ${f.title}: ${f.error}`).join("\n") || "(none)"}

AGENT LEARNINGS (${learnings.length}):
${learnings.map((l) => `- [${l.category}] ${l.title} (conf=${l.confidence}): ${l.body}`).join("\n") || "(none)"}

QUEUE ERRORS (${queueErrors.length}):
${queueErrors.map((q) => `- [${q.type}] ${q.error}`).join("\n") || "(none)"}

Propose improvements in categories:
- "bug-fix": fix recurring failures or errors
- "optimization": improve performance, reduce cost, or increase reliability
- "new-feature": add capability that would prevent observed issues
- "new-domain": explore a new area based on patterns

Return JSON array:
[
  {
    "title": "Short descriptive title (max 80 chars)",
    "body": "Markdown body with: ## Motivation\\n...\\n## Proposed Solution\\n...\\n## Files to Touch\\n...",
    "priority": 1-3,
    "category": "bug-fix" | "optimization" | "new-feature" | "new-domain"
  }
]`
}

function parse(raw: string): Proposal[] {
  try {
    const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
    const arr = JSON.parse(clean)
    if (!Array.isArray(arr)) return []
    return arr.filter(
      (p): p is Proposal =>
        typeof p.title === "string" &&
        typeof p.body === "string" &&
        typeof p.category === "string",
    )
  } catch {
    return []
  }
}

const pipeline: Pipeline = {
  strategy: "self_improvement",
  displayName: "Self-Improvement",

  async execute(ctx: PipelineContext): Promise<ContentOutput | void> {
    const db = ctx.db
    if (!db) return { contentType: "self-improvement", platform: "github", title: "Skipped (no DB)", status: "draft" }

    const cfg = ctx.config as unknown as Config
    const repo = cfg.target_repo?.trim()
    if (!repo) throw new Error("target_repo is required")
    const token = process.env.GITHUB_TOKEN
    if (!token) throw new Error("GITHUB_TOKEN not configured")

    const days = cfg.since_days ?? 7
    const maxProposals = cfg.max_proposals ?? 3
    const label = cfg.issue_label ?? "self-improvement"
    const since = Math.floor(Date.now() / 1000) - days * 86400

    const failed = await db
      .select()
      .from(repoIssueJobs)
      .where(and(eq(repoIssueJobs.status, "failed"), gte(repoIssueJobs.updatedAt, since)))
      .orderBy(desc(repoIssueJobs.updatedAt))
      .limit(20)

    const failures = failed.map((j) => ({
      repo: j.repoFullName,
      title: j.issueTitle,
      error: (j.cli_output ?? "unknown").slice(-500),
    }))

    const recent = await db
      .select()
      .from(agentLearnings)
      .where(gte(agentLearnings.updatedAt, since))
      .orderBy(desc(agentLearnings.confidence))
      .limit(30)

    const learningData = recent.map((l) => ({
      category: l.category,
      title: l.title,
      body: l.body,
      confidence: l.confidence,
    }))

    const queueFails = await db
      .select()
      .from(daemonQueue)
      .where(and(eq(daemonQueue.status, "failed"), gte(daemonQueue.createdAt, since)))
      .orderBy(desc(daemonQueue.createdAt))
      .limit(15)

    const queueErrors = queueFails.map((q) => ({
      type: q.activityType,
      error: (q.errorMessage ?? "unknown").slice(0, 300),
    }))

    if (failures.length === 0 && learningData.length === 0 && queueErrors.length === 0) {
      return {
        contentType: "self-improvement",
        platform: "github",
        title: "No data to analyze",
        status: "draft",
        extra: { proposals: 0 },
      }
    }

    if (!ctx.memoryLlm) {
      return {
        contentType: "self-improvement",
        platform: "github",
        title: "Skipped (no LLM)",
        status: "draft",
      }
    }

    const raw = await ctx.memoryLlm({
      system: SYSTEM,
      prompt: buildPrompt(failures, learningData, queueErrors, repo),
      maxTokens: 2000,
    })

    const proposals = parse(raw).slice(0, maxProposals)
    if (proposals.length === 0) {
      return {
        contentType: "self-improvement",
        platform: "github",
        title: "LLM returned no proposals",
        status: "draft",
        extra: { proposals: 0 },
      }
    }

    let created = 0
    const now = Math.floor(Date.now() / 1000)

    for (const p of proposals) {
      const dup = await issueExists(token, repo, p.title)
      if (dup) continue

      try {
        const { number, url } = await createGitHubIssue(token, repo, {
          title: p.title,
          body: `${p.body}\n\n---\n_Auto-generated by self-improvement pipeline. Add \`approved\` label to start implementation._`,
          labels: [label],
        })

        await db.insert(selfImprovementProposals).values({
          id: ulid(),
          pipeline_run_id: ctx.jobId,
          issue_number: number,
          repo,
          title: p.title,
          category: p.category,
          status: "proposed",
          created_at: now,
          updated_at: now,
        })

        created++
      } catch (err) {
        console.warn(`[self_improvement] Failed to create issue "${p.title}":`, err)
      }
    }

    return {
      contentType: "self-improvement",
      platform: "github",
      title: `Self-improvement: ${created} proposals created`,
      status: "draft",
      extra: { analyzed: { failures: failures.length, learnings: learningData.length, queueErrors: queueErrors.length }, proposals: created },
    }
  },
}

registerPipeline(pipeline)
