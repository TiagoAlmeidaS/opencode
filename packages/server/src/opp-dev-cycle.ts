import { ulid } from "ulid"
import { eq } from "drizzle-orm"
import { Octokit } from "@octokit/rest"
import type { ServerDb } from "./db"
import { repoIssueJobs } from "./schema"
import { parseGithubUrl, parseRepoFullName } from "./activities/dev-cycle-shared"
import { enqueueDevCycleChain } from "./repo-job-chain"
import { DEV_CYCLE_QUEUES } from "./rabbitmq"

export async function ensureOppDevCycle(
  db: ServerDb,
  opts: {
    opp: {
      id: string
      title: string
      description: string | null
      url: string | null
      workspaceRepoUrl: string | null
    }
    triggeredBy: string
    mode: "fork-temp" | "direct"
    /** Publica diretamente no RabbitMQ quando disponível (event-driven). Fallback: polling via enqueueDevCycleChain. */
    publishFn?: (queue: string, payload: unknown) => void
  },
): Promise<void> {
  const [existing] = await db
    .select()
    .from(repoIssueJobs)
    .where(eq(repoIssueJobs.opportunityId, opts.opp.id))
    .limit(1)

  const STUCK_HOURS = 2
  const stuckCutoff = Math.floor((Date.now() - STUCK_HOURS * 60 * 60 * 1000) / 1000)
  const active = ["spec", "tests", "implementing", "docs", "pr-open"]
  if (existing) {
    if (existing.status === "completed" || existing.status === "pending") return
    // Job ativo mas sem update há mais de STUCK_HOURS → tratar como falho e re-tentar
    const isStuckActive = active.includes(existing.status) && existing.updatedAt < stuckCutoff
    if (active.includes(existing.status) && !isStuckActive) return
    if (existing.status === "failed" || isStuckActive) {
      const ts = Math.floor(Date.now() / 1000)
      await db
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
          updatedAt: ts,
        })
        .where(eq(repoIssueJobs.id, existing.id))
      if (opts.publishFn) {
        opts.publishFn(DEV_CYCLE_QUEUES.implementCode, { repo_issue_job_id: existing.id })
      } else {
        await enqueueDevCycleChain(db, {
          jobId: existing.id,
          dedupKey: opts.opp.id,
          triggeredBy: opts.triggeredBy,
        })
      }
    }
    return
  }

  const token = process.env.GITHUB_TOKEN
  if (!token) throw new Error("GITHUB_TOKEN não configurado")
  const octokit = new Octokit({ auth: token })
  const now = Math.floor(Date.now() / 1000)

  let repoFull: string
  let issueNum: number | null = null
  let base = "main"
  let upstreamOwner: string | null = null
  let upstreamRepo: string | null = null
  let useFork = 0

  if (opts.mode === "fork-temp") {
    const u = opts.opp.url
    if (!u) throw new Error("Oportunidade sem URL")
    const p = parseGithubUrl(u)
    if (!p) throw new Error("URL GitHub inválida para fork-temp")
    repoFull = `${p.owner}/${p.repo}`
    issueNum = p.issueNumber
    upstreamOwner = p.owner
    upstreamRepo = p.repo
    useFork = 1
    try {
      const { data: ri } = await octokit.repos.get({ owner: p.owner, repo: p.repo })
      base = ri.default_branch
    } catch { /* keep main */ }
  } else {
    const u = opts.opp.workspaceRepoUrl ?? opts.opp.url
    if (!u) throw new Error("Sem repo URL")
    const gh = parseGithubUrl(u)
    if (gh) {
      repoFull = `${gh.owner}/${gh.repo}`
      issueNum = gh.issueNumber
    } else {
      const pr = parseRepoFullName(u)
      if (!pr) throw new Error("Repo URL inválido")
      repoFull = `${pr.owner}/${pr.repo}`
    }
    const [o, r] = repoFull.split("/")
    try {
      const { data: ri } = await octokit.repos.get({ owner: o, repo: r })
      base = ri.default_branch
    } catch { /* empty */ }
  }

  const id = ulid()
  await db.insert(repoIssueJobs).values({
    id,
    opportunityId: opts.opp.id,
    repoFullName: repoFull,
    issueNumber: issueNum,
    issueTitle: opts.opp.title,
    issueBody: opts.opp.description,
    status: "pending",
    baseBranch: base,
    useFork,
    upstreamOwner,
    upstreamRepo,
    createdAt: now,
    updatedAt: now,
  })

  if (opts.publishFn) {
    opts.publishFn(DEV_CYCLE_QUEUES.implementCode, { repo_issue_job_id: id })
  } else {
    await enqueueDevCycleChain(db, {
      jobId: id,
      dedupKey: opts.opp.id,
      triggeredBy: opts.triggeredBy,
    })
  }
}
