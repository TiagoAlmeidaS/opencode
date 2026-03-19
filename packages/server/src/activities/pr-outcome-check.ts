import { eq, and, isNull, isNotNull, inArray } from "drizzle-orm"
import { Octokit } from "@octokit/rest"
import { repoIssueJobs } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"

const BATCH = 20

function parsePrUrl(url: string): { owner: string; repo: string; number: number } | null {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
  if (!m) return null
  return { owner: m[1], repo: m[2], number: parseInt(m[3], 10) }
}

export const prOutcomeCheckActivity: Activity = {
  type: "pr-outcome-check",
  displayName: "PR Outcome Check",
  description: "Polls GitHub PRs and records merge/rejection outcome for learning",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const token = process.env.GITHUB_TOKEN
    if (!token) return { summary: "GITHUB_TOKEN not set — skipped", extra: { skipped: true } }

    const jobs = await ctx.db
      .select()
      .from(repoIssueJobs)
      .where(
        and(
          inArray(repoIssueJobs.status, ["completed", "pr-open"]),
          isNotNull(repoIssueJobs.prUrl),
          isNull(repoIssueJobs.pr_outcome),
        ),
      )
      .limit(BATCH)

    if (jobs.length === 0) return { summary: "No PRs to check", extra: { checked: 0 } }

    const octokit = new Octokit({ auth: token })
    let merged = 0
    let rejected = 0
    let pending = 0

    for (const job of jobs) {
      const parsed = parsePrUrl(job.prUrl!)
      if (!parsed) continue

      try {
        const { data: pr } = await octokit.pulls.get({
          owner: parsed.owner,
          repo: parsed.repo,
          pull_number: parsed.number,
        })

        if (pr.state === "open") {
          pending++
          continue
        }

        const outcome = pr.merged_at ? "merged" : "rejected"
        const now = Math.floor(Date.now() / 1000)

        let comments = ""
        try {
          const { data: reviews } = await octokit.pulls.listReviews({
            owner: parsed.owner,
            repo: parsed.repo,
            pull_number: parsed.number,
            per_page: 30,
          })
          comments = reviews
            .filter((r) => r.body)
            .map((r) => `[${r.state}] ${r.user?.login}: ${r.body}`)
            .join("\n")
            .slice(0, 8000)
        } catch { /* reviews optional */ }

        await ctx.db
          .update(repoIssueJobs)
          .set({
            pr_outcome: outcome,
            pr_outcome_at: now,
            pr_review_comments: comments || null,
            updatedAt: now,
          })
          .where(eq(repoIssueJobs.id, job.id))

        if (outcome === "merged") merged++
        else rejected++
      } catch { /* skip individual PR errors */ }
    }

    return {
      summary: `Checked ${jobs.length} PRs: ${merged} merged, ${rejected} rejected, ${pending} still open`,
      extra: { checked: jobs.length, merged, rejected, pending },
    }
  },
}
