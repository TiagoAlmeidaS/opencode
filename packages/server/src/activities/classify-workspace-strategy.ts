import { eq } from "drizzle-orm"
import { Octokit } from "@octokit/rest"
import { oppOpportunities } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"
import { ensureOppDevCycle } from "../opp-dev-cycle"
import { parseGithubUrl } from "./dev-cycle-shared"

interface ClassifyWorkspaceInput {
  opportunity_id: string
}

// ── GitHub context enrichment ─────────────────────────────────────────────────

interface GithubContext {
  repo: {
    full_name: string
    description: string | null
    language: string | null
    topics: string[]
    fork: boolean
  }
  issue: {
    title: string
    body: string
    labels: string[]
    assignees: string[]
    state: string
    comments: number
  } | null
  hasAssignee: boolean
}

async function fetchGithubContext(url: string, token: string): Promise<GithubContext | null> {
  const parsed = parseGithubUrl(url)
  if (!parsed) return null

  const octokit = new Octokit({ auth: token })

  let repo
  try {
    const { data } = await octokit.repos.get({ owner: parsed.owner, repo: parsed.repo })
    repo = {
      full_name: data.full_name,
      description: data.description,
      language: data.language,
      topics: data.topics ?? [],
      fork: data.fork,
    }
  } catch {
    return null
  }

  let issue: GithubContext["issue"] = null
  if (parsed.issueNumber) {
    try {
      const { data } = await octokit.issues.get({
        owner: parsed.owner,
        repo: parsed.repo,
        issue_number: parsed.issueNumber,
      })
      issue = {
        title: data.title,
        body: (data.body ?? "").slice(0, 1500),
        labels: data.labels.map((l) => (typeof l === "string" ? l : l.name ?? "")),
        assignees: data.assignees?.map((a) => a.login) ?? [],
        state: data.state,
        comments: data.comments,
      }
    } catch { /* issue fetch failed — proceed without it */ }
  }

  return {
    repo,
    issue,
    hasAssignee: (issue?.assignees?.length ?? 0) > 0,
  }
}

// ── LLM prompt ────────────────────────────────────────────────────────────────

const SYSTEM = `You are a workspace strategy classifier for an autonomous development agent.
Respond ONLY with valid JSON, no markdown.

MAIN RULE: If the opportunity points to an existing GitHub repository (issue URL, PR URL, or repo URL),
the strategy MUST be "fork-temp". The agent will fork, implement, and open a PR on the upstream repo.

"dedicated-repo" is RARE — only when the opportunity explicitly asks to create a standalone project
with NO target repository (e.g. "create a CLI tool from scratch", "build an SDK" with no reference repo).

"extend-repo" is for when a dedicated repo from the agent already exists in the same niche.`

function buildPrompt(
  opp: { type: string; title: string; description: string | null; url: string | null },
  ghCtx: GithubContext | null,
): string {
  const ghBlock = ghCtx
    ? `GitHub Context:
Repo: ${ghCtx.repo.full_name} (${ghCtx.repo.language ?? "unknown"})
Description: ${ghCtx.repo.description ?? "N/A"}
Topics: ${ghCtx.repo.topics.join(", ") || "none"}
Is fork: ${ghCtx.repo.fork}
${ghCtx.issue
  ? `Issue: ${ghCtx.issue.title}
Labels: ${ghCtx.issue.labels.join(", ") || "none"}
Assignees: ${ghCtx.issue.assignees.join(", ") || "none"}
State: ${ghCtx.issue.state}
Comments: ${ghCtx.issue.comments}
Body:\n${ghCtx.issue.body.slice(0, 800)}`
  : "No specific issue (URL points to repo only)"}`
    : "No GitHub context (URL is not GitHub)"

  return `Analyze this opportunity and determine workspace strategy:

Type: ${opp.type}
Title: ${opp.title}
URL: ${opp.url ?? "N/A"}
Description: ${(opp.description ?? "").slice(0, 600)}

${ghBlock}

Return JSON:
{
  "strategy": "fork-temp" | "dedicated-repo" | "extend-repo",
  "reasoning": "1-sentence explanation",
  "confidence": 0..100,
  "suggested_repo_name": "kebab-case name if dedicated-repo, null otherwise",
  "should_skip": true/false,
  "skip_reason": "if should_skip=true, why (e.g. issue already has assignee)"
}`
}

interface LlmResult {
  strategy: string
  suggested_repo_name: string | null
  confidence: number
  should_skip: boolean
  skip_reason: string | null
}

// ── Heuristic fallback (conservative: always fork-temp without LLM) ───────────

function heuristicStrategy(opp: { type: string; url: string | null }): "fork-temp" | "dedicated-repo" {
  const url = (opp.url ?? "").toLowerCase()
  if (url.includes("github.com")) return "fork-temp"
  if (opp.type === "oss-bounty" || opp.type === "bug-bounty") return "fork-temp"
  return "fork-temp"
}

// ── Activity ──────────────────────────────────────────────────────────────────

export const classifyWorkspaceStrategyActivity: Activity = {
  type: "classify-workspace-strategy",
  displayName: "Classify Workspace Strategy",
  description: "Determina se a oportunidade usa fork temporário ou repo dedicado reutilizável (LLM + GitHub context)",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as ClassifyWorkspaceInput
    if (!input.opportunity_id) throw new Error("opportunity_id é obrigatório")

    const [opp] = await ctx.db
      .select()
      .from(oppOpportunities)
      .where(eq(oppOpportunities.id, input.opportunity_id))
      .limit(1)

    if (!opp) throw new Error(`Oportunidade não encontrada: ${input.opportunity_id}`)

    if (opp.workspaceStrategy) {
      return {
        summary: `Estratégia já definida: ${opp.workspaceStrategy}`,
        extra: { strategy: opp.workspaceStrategy, skipped: true },
      }
    }

    const now = Math.floor(Date.now() / 1000)
    const token = process.env.GITHUB_TOKEN

    // Enrich with real GitHub data
    let ghCtx: GithubContext | null = null
    if (token && opp.url) {
      try {
        ghCtx = await fetchGithubContext(opp.url, token)
      } catch { /* enrichment failed — proceed without it */ }
    }

    let strategy: string
    let suggestedRepoName: string | null = null
    let shouldSkip = false
    let skipReason: string | null = null

    if (ctx.memoryLlm) {
      const raw = await ctx.memoryLlm({ system: SYSTEM, prompt: buildPrompt(opp, ghCtx), maxTokens: 384 })
      try {
        const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
        const result = JSON.parse(clean) as LlmResult
        strategy = result.strategy
        suggestedRepoName = result.suggested_repo_name ?? null
        shouldSkip = result.should_skip ?? false
        skipReason = result.skip_reason ?? null
      } catch {
        strategy = heuristicStrategy(opp)
      }
    } else {
      strategy = heuristicStrategy(opp)
    }

    // Store strategy + skip metadata for downstream activities
    await ctx.db
      .update(oppOpportunities)
      .set({ workspaceStrategy: strategy, updatedAt: now })
      .where(eq(oppOpportunities.id, opp.id))

    if (shouldSkip) {
      return {
        summary: `Skipped: ${skipReason ?? "LLM recommended skip"}`,
        extra: { strategy, should_skip: true, skip_reason: skipReason },
      }
    }

    if (strategy === "fork-temp") {
      // Enqueue claim step before the dev cycle
      await ctx.enqueue("claim-bounty-issue", {
        opportunity_id: opp.id,
      }, { priority: 4, relatedOpportunityId: opp.id })
    } else if (strategy === "dedicated-repo") {
      await ctx.enqueue("create-dedicated-repo", {
        opportunity_id: opp.id,
        repo_name: suggestedRepoName,
      }, { priority: 4, relatedOpportunityId: opp.id })
    } else if (strategy === "extend-repo") {
      await ensureOppDevCycle(ctx.db, {
        opp,
        triggeredBy: ctx.queueItemId,
        mode: "direct",
      })
    }

    return {
      summary: `Estratégia: ${strategy}${suggestedRepoName ? ` → repo: ${suggestedRepoName}` : ""}${shouldSkip ? " (skip)" : ""}`,
      extra: { strategy, suggested_repo_name: suggestedRepoName, github_context: !!ghCtx },
    }
  },
}
