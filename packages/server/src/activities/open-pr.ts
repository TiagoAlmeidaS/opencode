import { ulid } from "ulid"
import { eq } from "drizzle-orm"
import { Octokit } from "@octokit/rest"
import { repoIssueJobs, oppSubmissions, oppOpportunities } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"
import { runGit } from "./dev-cycle-shared"
import { getBountyWalletSnippet } from "../financial-config"

interface Input {
  repo_issue_job_id: string
}

export const openPrActivity: Activity = {
  type: "open-pr",
  displayName: "Open PR",
  description: "Commit, push, abre PR draft com docs no body",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as Input
    if (!input.repo_issue_job_id) throw new Error("repo_issue_job_id é obrigatório")

    const token = process.env.GITHUB_TOKEN
    if (!token) throw new Error("GITHUB_TOKEN não configurado")

    const [job] = await ctx.db
      .select()
      .from(repoIssueJobs)
      .where(eq(repoIssueJobs.id, input.repo_issue_job_id))
      .limit(1)
    if (!job?.branchName || !job.localWorkPath) throw new Error("branch ou workspace ausente — implement-code antes")
    if (!job.docsMarkdown) throw new Error("docs ausentes")
    if (job.prUrl) {
      return { summary: `PR já aberto: ${job.prUrl}`, extra: { skipped: true, pr_url: job.prUrl } }
    }

    const workDir = job.localWorkPath
    const st = await runGit(["status", "--porcelain"], workDir)
    if (!st.trim()) throw new Error("Working tree vazio — nada a commitar")

    await runGit(["add", "-A"], workDir)
    const msg =
      job.issueNumber != null
        ? `feat: ${job.issueTitle.slice(0, 60)} [agent] [closes #${job.issueNumber}]`
        : `feat: ${job.issueTitle.slice(0, 60)} [agent]`
    await runGit(["commit", "-m", msg], workDir)
    await runGit(["push", "-u", "origin", job.branchName], workDir)

    const octokit = new Octokit({ auth: token })
    const { data: user } = await octokit.users.getAuthenticated()
    const forkOwner = user.login
    const base = job.baseBranch || "main"
    const [own, rep] = job.repoFullName.split("/")
    const docs = job.docsMarkdown ?? ""
    const issueLine =
      job.issueNumber != null
        ? `Closes #${job.issueNumber}\n\n`
        : ""
    const body = `${issueLine}${docs}

---

## Aguardando aprovação humana

Revise e **aprove o PR** no GitHub para merge. Este PR está em **draft** até aprovação.

${getBountyWalletSnippet() ? `### Pagamento\n\n${getBountyWalletSnippet()}` : ""}
`

    let pr: { html_url: string; number: number }

    if (job.useFork === 1 && job.upstreamOwner && job.upstreamRepo) {
      const { data } = await octokit.pulls.create({
        owner: job.upstreamOwner,
        repo: job.upstreamRepo,
        head: `${forkOwner}:${job.branchName}`,
        base,
        title: `[Agent] ${job.issueTitle.slice(0, 80)}`,
        body,
        draft: true,
      })
      pr = { html_url: data.html_url, number: data.number }
    } else {
      const { data } = await octokit.pulls.create({
        owner: own,
        repo: rep,
        head: job.branchName,
        base,
        title: `[Agent] ${job.issueTitle.slice(0, 80)}`,
        body,
        draft: true,
      })
      pr = { html_url: data.html_url, number: data.number }
    }

    const now = Math.floor(Date.now() / 1000)
    await ctx.db
      .update(repoIssueJobs)
      .set({
        prUrl: pr.html_url,
        prNumber: pr.number,
        prDraft: 1,
        status: "pr-open",
        updatedAt: now,
      })
      .where(eq(repoIssueJobs.id, job.id))

    if (job.opportunityId) {
      await ctx.db
        .update(oppOpportunities)
        .set({ status: "applied", updatedAt: now })
        .where(eq(oppOpportunities.id, job.opportunityId))
      await ctx.db.insert(oppSubmissions).values({
        id: ulid(),
        opportunityId: job.opportunityId,
        platform: "github",
        submissionType: "pr",
        externalUrl: pr.html_url,
        status: "pending-approval",
        prNumber: pr.number,
        submittedAt: now,
        triggeredBy: ctx.queueItemId,
        createdAt: now,
        updatedAt: now,
      })
    }

    return { summary: `PR draft: ${pr.html_url}`, extra: { pr_url: pr.html_url } }
  },
}
