import { eq } from "drizzle-orm"
import { Octokit } from "@octokit/rest"
import path from "path"
import { mkdir, rm, cp } from "fs/promises"
import { repoIssueJobs } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"
import { workDirForJob, runGit } from "./dev-cycle-shared"
import { checkExistingPR } from "../github-utils"

const SKILLS_SRC = path.resolve(import.meta.dir, "../../../../.opencode/skills")

interface Input {
  repo_issue_job_id: string
}

const MAX_TRIES = 3
const SPEC_PATH = ".opencode/spec.json"

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
  description: "Clone/fork, delega spec+testes+impl para a CLI OpenCode",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as Input
    if (!input.repo_issue_job_id) throw new Error("repo_issue_job_id é obrigatório")

    const token = process.env.GITHUB_TOKEN
    if (!token) throw new Error("GITHUB_TOKEN não configurado")

    const [row] = await ctx.db
      .select()
      .from(repoIssueJobs)
      .where(eq(repoIssueJobs.id, input.repo_issue_job_id))
      .limit(1)
    if (!row) throw new Error(`repo_issue_job não encontrado: ${input.repo_issue_job_id}`)
    let job = row

    const octokit = new Octokit({ auth: token })
    const { data: user } = await octokit.users.getAuthenticated()
    const forkOwner = user.login
    const [owner, repo] = job.repoFullName.split("/")
    if (!owner || !repo) throw new Error(`repo_full_name inválido: ${job.repoFullName}`)

    if (job.issueNumber != null) {
      const pr = await checkExistingPR(token, job.repoFullName, job.issueNumber, forkOwner)
      if (pr.exists && !pr.isOwn) {
        const now = Math.floor(Date.now() / 1000)
        await ctx.db
          .update(repoIssueJobs)
          .set({ status: "skipped", updatedAt: now })
          .where(eq(repoIssueJobs.id, job.id))
        return {
          summary: `Skipped — PR already exists by @${pr.author}: ${pr.url}`,
          extra: { skipped: true, existingPR: pr.url },
        }
      }
    }

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

    await injectSkills(workDir)

    const MAX_OUTPUT = 10_000

    let sessionId: string | null = null
    let cliOutput = ""
    for (let n = 1; n <= MAX_TRIES; n++) {
      await ctx.updateProgress?.(`OpenCode tentativa ${n}/${MAX_TRIES}`)
      if (n > 1) {
        const spec = await readSpec(workDir)
        if (spec) job = { ...job, specJson: spec }
      }
      const task = buildTask(job, n, n > 1 ? cliOutput : undefined)
      try {
        const result = await ctx.spawnOpenCode(task, workDir)
        sessionId = result.sessionId ?? sessionId
        cliOutput = result.output.slice(-MAX_OUTPUT)
        break
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        cliOutput = msg.slice(-MAX_OUTPUT)
        if (n === MAX_TRIES) {
          if (job.requirePassingTests !== 0) {
            throw new Error(`CLI falhou após ${MAX_TRIES} tentativas: ${msg.slice(0, 500)}`)
          }
          await ctx.updateProgress?.("CLI falhou mas require_passing_tests=false — prosseguindo")
        }
      }
    }

    const spec = await readSpec(workDir)
    const now = Math.floor(Date.now() / 1000)
    await ctx.db
      .update(repoIssueJobs)
      .set({
        branchName: branch,
        localWorkPath: workDir,
        forkRepoFullName: forkFull,
        specJson: spec,
        session_id: sessionId,
        cli_output: cliOutput,
        status: "implementing",
        updatedAt: now,
      })
      .where(eq(repoIssueJobs.id, job.id))

    return {
      summary: `Branch ${branch} — workspace ${workDir}`,
      extra: { branch, fork: forkFull, sessionId },
    }
  },
}

function buildTask(
  job: typeof repoIssueJobs.$inferSelect,
  attempt: number,
  prev?: string,
): string {
  const body = job.issueBody ? job.issueBody.slice(0, 10_000) : "(sem descrição)"
  const num = job.issueNumber != null ? ` #${job.issueNumber}` : ""
  const base = job.baseBranch || "main"
  const strict = job.requirePassingTests !== 0

  const parts: string[] = [
    `Implement code to satisfy this GitHub issue.`,
    ``,
    `ISSUE TITLE: ${job.issueTitle}`,
    `ISSUE${num}: ${job.repoFullName}`,
    `BASE BRANCH: ${base}`,
    `PASSING TESTS REQUIRED: ${strict ? "yes" : "no — open draft PR if tests fail"}`,
    ``,
    `ISSUE BODY:`,
    body,
  ]

  if (job.specJson && attempt > 1) {
    parts.push(``, `PREVIOUS SPEC (from attempt ${attempt - 1} — reuse or improve):`, job.specJson.slice(0, 4000))
  }

  if (prev) {
    parts.push(``, `PREVIOUS ATTEMPT (${attempt - 1}) FAILED. Output:`, prev.slice(0, 3000), ``, `Fix the issues above and try again.`)
  }

  parts.push(
    ``,
    `Instructions:`,
    ``,
    `PHASE 1 — DISCOVERY`,
    `Check if .opencode/skills/pm-discover/SKILL.md exists and follow it. Otherwise:`,
    `1. Map the project directory structure. Detect monorepo vs single-app.`,
    `2. Read the main manifest (package.json, Cargo.toml, go.mod, *.csproj, etc.) to identify language, framework, package manager, and scripts.`,
    `3. Read AGENTS.md, CLAUDE.md, CONTRIBUTING.md, or any conventions file present.`,
    `4. Identify the test framework, test directory, and read 1-2 existing test files to learn patterns.`,
    `5. Identify architecture layers (API, services, models, UI).`,
    ``,
    `PHASE 2 — PLAN`,
    `6. Write a spec file at ${SPEC_PATH} as JSON with: title, goal, scope, acceptance_criteria, technical_approach, files_to_touch, test_scenarios.`,
    `7. Extract acceptance criteria from the issue body. For each criterion, plan: (a) code task, (b) unit test, (c) integration test if applicable.`,
    ``,
    `PHASE 3 — BUILD`,
    `8. Install ALL dependencies required to build and test the project. Use whatever tools are available (bun, npm, npx, pip, cargo, dotnet, go, etc.).`,
    `9. Write tests following the project's existing patterns (Given/When/Then where appropriate).`,
    `10. Implement the code to pass all tests.`,
    `11. Run the project's full test suite and ensure ALL tests pass. If a test runner is not installed, install it first. Adapt to the runtime available.`,
    ``,
    `PHASE 4 — FINALIZE`,
    `12. Make minimal, focused changes. Do not commit or push.`,
    `13. If any step fails, diagnose the error, fix it, and retry until tests pass.`,
  )

  return parts.join("\n")
}

async function readSpec(cwd: string): Promise<string | null> {
  try {
    const raw = await Bun.file(path.join(cwd, SPEC_PATH)).text()
    JSON.parse(raw)
    return raw
  } catch {
    return null
  }
}

async function injectSkills(cwd: string): Promise<void> {
  try {
    const exists = await Bun.file(path.join(SKILLS_SRC, "pm-discover", "SKILL.md")).exists()
    if (!exists) return
    const dst = path.join(cwd, ".opencode", "skills")
    await mkdir(dst, { recursive: true })
    await cp(SKILLS_SRC, dst, { recursive: true })
  } catch { /* skills injection is best-effort */ }
}
