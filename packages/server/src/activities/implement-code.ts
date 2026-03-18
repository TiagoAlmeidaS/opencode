import { eq } from "drizzle-orm"
import { Octokit } from "@octokit/rest"
import path from "path"
import { mkdir, rm, writeFile } from "fs/promises"
import { repoIssueJobs } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"
import {
  workDirForJob,
  runGit,
  runCommand,
  detectTestCommand,
} from "./dev-cycle-shared"

interface Input {
  repo_issue_job_id: string
}

const MAX_TRIES = 3

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40)
    .replace(/^-|-$/g, "") || "task"
}

export const implementCodeActivity: Activity = {
  type: "implement-code",
  displayName: "Implement Code",
  description: "Clone/fork, escreve testes, spawnOpenCode até testes passarem",

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
    if (!job?.specJson || !job.testFiles) throw new Error("spec ou testFiles ausentes")

    const tests = JSON.parse(job.testFiles) as { path: string; content: string }[]
    const octokit = new Octokit({ auth: token })
    const { data: user } = await octokit.users.getAuthenticated()
    const forkOwner = user.login
    const [owner, repo] = job.repoFullName.split("/")
    if (!owner || !repo) throw new Error(`repo_full_name inválido: ${job.repoFullName}`)

    const base = job.baseBranch || "main"
    let cloneUrl: string
    let forkFull: string | null = job.forkRepoFullName

    if (job.useFork === 1 && job.upstreamOwner && job.upstreamRepo) {
      if (!forkFull) {
        await ctx.updateProgress?.("Fork no GitHub...")
        try {
          const { data: f } = await octokit.repos.createFork({
            owner: job.upstreamOwner,
            repo: job.upstreamRepo,
          })
          forkFull = f.full_name
          await new Promise((r) => setTimeout(r, 2500))
        } catch {
          forkFull = `${forkOwner}/${job.upstreamRepo}`
        }
      }
      cloneUrl = `https://x-access-token:${token}@github.com/${forkFull}.git`
    } else {
      cloneUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`
    }

    const workDir = workDirForJob(job.id)
    await rm(path.dirname(workDir), { recursive: true, force: true }).catch(() => {})
    await mkdir(path.dirname(workDir), { recursive: true })
    await ctx.updateProgress?.("Clone...")
    await runGit(["clone", "--depth", "80", cloneUrl, workDir], path.dirname(workDir))
    await runGit(["config", "user.email", "opencode-agent@users.noreply.github.com"], workDir)
    await runGit(["config", "user.name", "OpenCode Agent"], workDir)

    try {
      await runGit(["fetch", "origin", base], workDir)
    } catch {
      try {
        await runGit(["fetch", "origin", "main"], workDir)
      } catch { /* use default branch */ }
    }
    let branchBase = base
    try {
      await runGit(["checkout", base], workDir)
    } catch {
      branchBase = (await runGit(["branch", "-r"], workDir)).split("\n").find((l) => l.includes("origin/HEAD"))
        ? "main"
        : "master"
      await runGit(["checkout", branchBase], workDir).catch(() => runGit(["checkout", "-b", "agent-work"], workDir))
    }

    const branch =
      job.issueNumber != null
        ? `agent/issue-${job.issueNumber}-${slug(job.issueTitle)}`
        : `agent/opp-${job.id.slice(-8)}-${Date.now()}`
    await runGit(["checkout", "-b", branch], workDir)

    for (const f of tests) {
      const full = path.join(workDir, f.path)
      await mkdir(path.dirname(full), { recursive: true })
      await writeFile(full, f.content, "utf8")
    }

    const testCmd = await detectTestCommand(workDir)
    let failOut = ""
    if (testCmd) {
      const first = await runCommand(testCmd, workDir)
      failOut = first.ok ? "(tests passed before impl — continuing)" : first.out
    } else {
      failOut = "(no test runner detected)"
    }

    const task = `Implement code to satisfy this spec and pass all tests.

SPEC (JSON):
${job.specJson!.slice(0, 6000)}

TEST FILES:
${tests.map((t) => `--- ${t.path} ---\n${t.content.slice(0, 2000)}`).join("\n\n")}

LAST TEST OUTPUT:
${failOut.slice(0, 2500)}

Make minimal changes. Do not commit or push.`

    let lastOut = failOut
    for (let n = 1; n <= MAX_TRIES; n++) {
      await ctx.updateProgress?.(`OpenCode tentativa ${n}/${MAX_TRIES}`)
      await ctx.spawnOpenCode(
        n === 1 ? task : `${task}\n\nPREVIOUS FAILURE:\n${lastOut.slice(0, 2000)}`,
        workDir,
      )
      if (!testCmd) break
      const r = await runCommand(testCmd, workDir)
      if (r.ok) break
      lastOut = r.out
      if (n === MAX_TRIES) throw new Error(`Testes ainda falhando após ${MAX_TRIES} tentativas: ${lastOut.slice(0, 500)}`)
    }

    const now = Math.floor(Date.now() / 1000)
    await ctx.db
      .update(repoIssueJobs)
      .set({
        branchName: branch,
        localWorkPath: workDir,
        forkRepoFullName: forkFull,
        status: "implementing",
        updatedAt: now,
      })
      .where(eq(repoIssueJobs.id, job.id))

    return {
      summary: `Branch ${branch} — workspace ${workDir}`,
      extra: { branch, fork: forkFull },
    }
  },
}
