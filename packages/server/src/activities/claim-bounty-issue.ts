import { eq } from "drizzle-orm"
import { Octokit } from "@octokit/rest"
import { oppOpportunities } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"
import { parseGithubUrl } from "./dev-cycle-shared"
import { ensureOppDevCycle } from "../opp-dev-cycle"

interface ClaimInput {
  opportunity_id: string
}

export const claimBountyIssueActivity: Activity = {
  type: "claim-bounty-issue",
  displayName: "Claim Bounty Issue",
  description: "Comenta na issue do GitHub sinalizando que o agente vai trabalhar, e aborta se já claimada",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as ClaimInput
    if (!input.opportunity_id) throw new Error("opportunity_id é obrigatório")

    const token = process.env.GITHUB_TOKEN
    if (!token) throw new Error("GITHUB_TOKEN não configurado")

    const [opp] = await ctx.db
      .select()
      .from(oppOpportunities)
      .where(eq(oppOpportunities.id, input.opportunity_id))
      .limit(1)

    if (!opp) throw new Error(`Oportunidade não encontrada: ${input.opportunity_id}`)
    if (!opp.url) throw new Error("Oportunidade sem URL")

    const parsed = parseGithubUrl(opp.url)
    if (!parsed) throw new Error(`URL não é GitHub: ${opp.url}`)

    const octokit = new Octokit({ auth: token })
    const { data: user } = await octokit.users.getAuthenticated()

    // Only claim if there is a specific issue to comment on
    if (!parsed.issueNumber) {
      await ensureOppDevCycle(ctx.db, {
        opp,
        triggeredBy: ctx.queueItemId,
        mode: "fork-temp",
        publishFn: ctx.publishToRabbit,
      })
      return {
        summary: "No issue number — skipped claim, started dev cycle directly",
        extra: { claimed: false, reason: "no_issue_number" },
      }
    }

    // Fetch current issue state
    const { data: issue } = await octokit.issues.get({
      owner: parsed.owner,
      repo: parsed.repo,
      issue_number: parsed.issueNumber,
    })

    // Abort if issue is closed
    if (issue.state === "closed") {
      return {
        summary: `Issue #${parsed.issueNumber} is closed — aborting`,
        extra: { claimed: false, reason: "closed" },
      }
    }

    // Check if another user (not us) already claimed via assignee
    const otherAssignees = (issue.assignees ?? []).filter((a) => a.login !== user.login)
    if (otherAssignees.length > 0) {
      return {
        summary: `Issue #${parsed.issueNumber} already assigned to ${otherAssignees.map((a) => a.login).join(", ")} — aborting`,
        extra: { claimed: false, reason: "already_assigned", assignees: otherAssignees.map((a) => a.login) },
      }
    }

    // Check if we already commented (idempotency)
    const { data: comments } = await octokit.issues.listComments({
      owner: parsed.owner,
      repo: parsed.repo,
      issue_number: parsed.issueNumber,
      per_page: 100,
    })
    const alreadyClaimed = comments.some(
      (c) => c.user?.login === user.login && c.body?.includes("Working on this"),
    )

    if (!alreadyClaimed) {
      await octokit.issues.createComment({
        owner: parsed.owner,
        repo: parsed.repo,
        issue_number: parsed.issueNumber,
        body: `👋 Working on this. Will submit a PR shortly.\n\n*Automated by [OpenCode](https://opencode.ai) agent*`,
      })
    }

    // Start the dev cycle
    await ensureOppDevCycle(ctx.db, {
      opp,
      triggeredBy: ctx.queueItemId,
      mode: "fork-temp",
      publishFn: ctx.publishToRabbit,
    })

    return {
      summary: `Claimed issue #${parsed.issueNumber} on ${parsed.owner}/${parsed.repo}${alreadyClaimed ? " (already commented)" : ""} — dev cycle enqueued`,
      extra: { claimed: true, issue_number: parsed.issueNumber, already_commented: alreadyClaimed },
    }
  },
}
