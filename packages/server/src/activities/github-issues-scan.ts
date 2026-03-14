import { Octokit } from "@octokit/rest"
import type { Activity, ActivityContext, ActivityOutput } from "../types"

interface GithubIssuesScanInput {
  repo: string
  labels?: string[]
  state?: "open" | "closed" | "all"
  limit?: number
  token?: string
}

export const githubIssuesScanActivity: Activity = {
  type: "github-issues-scan",
  displayName: "GitHub Issues Scan",
  description: "Scans a GitHub repository for issues and enqueues implementation tasks",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as GithubIssuesScanInput

    if (!input.repo) throw new Error("input.repo is required (e.g. 'owner/repo')")

    const [owner, repo] = input.repo.split("/")
    if (!owner || !repo) throw new Error("input.repo must be in 'owner/repo' format")

    const octokit = new Octokit({ auth: input.token ?? process.env.GITHUB_TOKEN })

    const issues = await octokit.issues.listForRepo({
      owner,
      repo,
      state: input.state ?? "open",
      labels: input.labels?.join(","),
      per_page: Math.min(input.limit ?? 20, 100),
    })

    let enqueued = 0
    for (const issue of issues.data) {
      if (issue.pull_request) continue // skip PRs
      await ctx.enqueue(
        "implement-issue",
        {
          repo: input.repo,
          issueNumber: issue.number,
          title: issue.title,
          body: issue.body ?? "",
        },
        { priority: 5 },
      )
      enqueued++
    }

    return {
      summary: `Found ${issues.data.length} issues, enqueued ${enqueued} tasks`,
      extra: { totalIssues: issues.data.length, enqueued },
    }
  },
}
