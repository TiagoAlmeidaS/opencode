import { ulid } from "ulid"
import { eq, and, sql, isNull } from "drizzle-orm"
import { Octokit } from "@octokit/rest"
import { registerPipeline } from "../registry"
import type { PipelineContext, ContentOutput } from "../types"
import { repoIssueJobs } from "../schema"
import { parseRepoFullName } from "../activities/dev-cycle-shared"
import { enqueueDevCycleChain } from "../repo-job-chain"

interface Cfg {
  repo_full_name: string
  label?: string
  base_branch?: string
  max_issues_per_run?: number
  priority_label_prefix?: string
}

const ACTIVE = ["pending", "spec", "tests", "implementing", "docs", "pr-open"]

function prio(labels: { name?: string }[], prefix: string): number {
  for (const l of labels) {
    const n = l.name ?? ""
    if (!n.startsWith(prefix)) continue
    const rest = n.slice(prefix.length).toLowerCase()
    if (rest.includes("high")) return 1
    if (rest.includes("medium")) return 2
    if (rest.includes("low")) return 3
  }
  return 4
}

type IssueRow = {
  number: number
  title: string
  body: string | null
  labels: { name: string }[]
}

function deferIfBlocked(issues: IssueRow[]): IssueRow[] {
  const nums = new Set(issues.map((i) => i.number))
  return issues.filter((i) => {
    const body = i.body ?? ""
    const mentions = [...body.matchAll(/#(\d+)/g)].map((m) => parseInt(m[1], 10))
    return !mentions.some((n) => n !== i.number && nums.has(n))
  })
}

registerPipeline({
  strategy: "repo-issue-worker",
  displayName: "Repo Issue Worker",

  async execute(ctx: PipelineContext): Promise<ContentOutput | void> {
    if (!ctx.db) return
    const cfg = ctx.config as unknown as Cfg
    const full = cfg.repo_full_name?.trim()
    if (!full) throw new Error("repo_full_name é obrigatório")
    const token = process.env.GITHUB_TOKEN
    if (!token) throw new Error("GITHUB_TOKEN não configurado")

    const parsed = parseRepoFullName(full)
    if (!parsed) throw new Error(`repo_full_name inválido: ${full}`)

    const label = cfg.label ?? "agent"
    const maxN = cfg.max_issues_per_run ?? 3
    const prefix = cfg.priority_label_prefix ?? "p:"
    const baseBranch = cfg.base_branch ?? "main"
    const octokit = new Octokit({ auth: token })

    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner: parsed.owner,
      repo: parsed.repo,
      state: "open",
      labels: label,
      per_page: 30,
      sort: "created",
      direction: "asc",
    })

    const list = issues
      .filter((i) => !("pull_request" in i && i.pull_request))
      .map((i) => ({
        number: i.number,
        title: i.title ?? `Issue ${i.number}`,
        body: i.body ?? null,
        labels: i.labels.map((l) => ({ name: typeof l === "string" ? l : l.name ?? "" })),
      }))
      .sort((a, b) => prio(a.labels, prefix) - prio(b.labels, prefix))

    const eligible = deferIfBlocked(list).slice(0, maxN * 2)
    const now = Math.floor(Date.now() / 1000)
    let enq = 0
    const repoFull = `${parsed.owner}/${parsed.repo}`

    for (const issue of eligible) {
      if (enq >= maxN) break

      const [existing] = await ctx.db
        .select()
        .from(repoIssueJobs)
        .where(
          and(
            eq(repoIssueJobs.repoFullName, repoFull),
            eq(repoIssueJobs.issueNumber, issue.number),
            isNull(repoIssueJobs.opportunityId),
          ),
        )
        .limit(1)

      if (existing) {
        if (existing.status === "completed") continue
        if (existing.status === "failed") {
          await ctx.db
            .update(repoIssueJobs)
            .set({
              status: "pending",
              specJson: null,
              testFiles: null,
              docsMarkdown: null,
              branchName: null,
              forkRepoFullName: null,
              localWorkPath: null,
              prUrl: null,
              prNumber: null,
              updatedAt: now,
            })
            .where(eq(repoIssueJobs.id, existing.id))
          const r = await enqueueDevCycleChain(ctx.db, {
            jobId: existing.id,
            dedupKey: `repo-job:${existing.id}`,
            triggeredBy: ctx.jobId,
          })
          if (!r.skipped) enq++
          continue
        }
        if (ACTIVE.includes(existing.status)) continue
        if (existing.status === "pending" && !existing.specJson) {
          const r = await enqueueDevCycleChain(ctx.db, {
            jobId: existing.id,
            dedupKey: `repo-job:${existing.id}`,
            triggeredBy: ctx.jobId,
          })
          if (!r.skipped) enq++
        }
        continue
      }

      const id = ulid()
      await ctx.db.insert(repoIssueJobs).values({
        id,
        pipelineId: ctx.pipelineId,
        opportunityId: null,
        repoFullName: repoFull,
        issueNumber: issue.number,
        issueTitle: issue.title,
        issueBody: issue.body,
        status: "pending",
        baseBranch,
        useFork: 0,
        createdAt: now,
        updatedAt: now,
      })

      const { skipped } = await enqueueDevCycleChain(ctx.db, {
        jobId: id,
        dedupKey: `repo-job:${id}`,
        triggeredBy: ctx.jobId,
      })
      if (!skipped) enq++
    }

    return { extra: { issues_scanned: list.length, chains_enqueued: enq } }
  },
})
