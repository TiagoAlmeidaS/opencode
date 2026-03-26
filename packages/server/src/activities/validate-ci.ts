import { eq } from "drizzle-orm"
import { Octokit } from "@octokit/rest"
import { repoIssueJobs } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"
import { checkCIStatus } from "../github-utils"

interface Input {
  repo_issue_job_id: string
}

export const validateCiActivity: Activity = {
  type: "validate-ci",
  displayName: "Validate CI",
  description: "Checks GitHub CI status for the PR branch; undrafts PR on pass",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as Input
    if (!input.repo_issue_job_id) throw new Error("repo_issue_job_id é obrigatório")

    const [job] = await ctx.db
      .select()
      .from(repoIssueJobs)
      .where(eq(repoIssueJobs.id, input.repo_issue_job_id))
      .limit(1)

    if (!job) throw new Error(`repo_issue_job não encontrado: ${input.repo_issue_job_id}`)

    // If implement-code was skipped, nothing to check
    if (job.status === "skipped") {
      return { summary: "Skipped — implement-code foi pulado", extra: { skipped: true } }
    }

    const token = process.env.GITHUB_TOKEN
    if (!token) {
      const now = Math.floor(Date.now() / 1000)
      await ctx.db
        .update(repoIssueJobs)
        .set({ ci_status: "skipped", ci_checked_at: now, updatedAt: now })
        .where(eq(repoIssueJobs.id, job.id))
      return { summary: "GITHUB_TOKEN não configurado — CI check ignorado", extra: { skipped: true } }
    }

    if (!job.prUrl || !job.prNumber) {
      return { summary: "PR não encontrado — open-pr deve rodar antes de validate-ci", extra: { skipped: true } }
    }

    const branch = job.branchName
    if (!branch) {
      return { summary: "branchName ausente — CI check ignorado", extra: { skipped: true } }
    }

    // Prefer upstreamOwner/Repo (fork mode), else split repoFullName
    const owner = job.upstreamOwner ?? job.repoFullName.split("/")[0]
    const repo = job.upstreamRepo ?? job.repoFullName.split("/")[1]

    const octokit = new Octokit({ auth: token })
    const now = Math.floor(Date.now() / 1000)

    const { conclusion, failingChecks } = await checkCIStatus(octokit, owner, repo, branch)

    const updates: Partial<typeof repoIssueJobs.$inferInsert> = {
      ci_status: conclusion,
      ci_checked_at: now,
      updatedAt: now,
    }

    // CI passed → convert draft PR to ready-for-review
    if (conclusion === "passing" && job.prDraft === 1) {
      try {
        await octokit.pulls.update({
          owner,
          repo,
          pull_number: job.prNumber,
          draft: false,
        })
        updates.prDraft = 0
      } catch {
        // Non-fatal: some plans/repos don't support draft API
      }
    }

    await ctx.db.update(repoIssueJobs).set(updates).where(eq(repoIssueJobs.id, job.id))

    const labels: Record<string, string> = {
      passing: "CI passou ✅",
      failing: `CI falhou ❌ (${failingChecks.slice(0, 3).join(", ")})`,
      pending: "CI em execução ⏳",
      skipped: "sem CI configurado",
    }

    return {
      summary: labels[conclusion] ?? conclusion,
      extra: { ci_conclusion: conclusion, failingChecks },
    }
  },
}
