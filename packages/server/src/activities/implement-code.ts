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

// ─── Adaptive timeout ─────────────────────────────────────────────────────────
const SHORT_MS  = 15 * 60 * 1000  // body < 500 chars, no spec
const MEDIUM_MS = 30 * 60 * 1000  // default
const LONG_MS   = 50 * 60 * 1000  // body > 3000 chars or spec > 2000 chars

function computeTimeoutMs(job: typeof repoIssueJobs.$inferSelect): number {
  const envMs = parseInt(process.env.CLI_TIMEOUT_MS ?? "", 10)
  if (!isNaN(envMs) && envMs > 0) return envMs
  const bodyLen = (job.issueBody ?? "").length
  const specLen = (job.specJson ?? "").length
  if (specLen > 2000 || bodyLen > 3000) return LONG_MS
  if (bodyLen < 500 && specLen === 0) return SHORT_MS
  return MEDIUM_MS
}

// ─── Empty issue body detection ───────────────────────────────────────────────
// Returns true when the issue body is empty, too short, or contains only
// template placeholders — saves 30+ min of wasted CLI execution.
const BODY_PLACEHOLDERS = [
  /critério funcional \d+/i,
  /tarefa técnica? \d+/i,
  /task técnica? \d+/i,
  /acceptance criteria \d+/i,
  /^\s*\[[ x]\]\s*$/,
  /^(tbd|wip|todo|placeholder)$/i,
]

export function detectEmptyIssueBody(body: string | null | undefined): boolean {
  if (!body || body.trim().length === 0) return true
  const stripped = body.replace(/<!--[\s\S]*?-->/g, "").trim()
  if (stripped.length < 80) return true
  const lines = stripped.split("\n").filter((l) => l.trim().length > 0)
  const substantive = lines.filter(
    (l) => !BODY_PLACEHOLDERS.some((p) => p.test(l.trim())) && !/^#{1,4}\s/.test(l),
  )
  return substantive.length < 3
}

// ─── Stuck-loop detection ─────────────────────────────────────────────────────
// If the CLI agent output shows ≥ STUCK_EDIT_THRESHOLD consecutive edit
// failures without any test-passing signal, the agent is stuck in a loop.
const STUCK_EDIT_THRESHOLD = 4
const STUCK_BASH_THRESHOLD = 4

export function detectStuckLoop(output: string): { stuck: boolean; reason: string | null } {
  const editFailures = (output.match(/edit failed/gi) ?? []).length
  const multipleMatches = (output.match(/Found multiple matches for oldString/gi) ?? []).length
  const notFound = (output.match(/Could not find oldString/gi) ?? []).length

  // Agent is considered stuck if it racked up many edit errors with no test-pass signal
  const hasSuccessSignal = /all tests passed|tests passed.*0 fail|no tests failing|build successful/i.test(output)

  if (editFailures >= STUCK_EDIT_THRESHOLD && !hasSuccessSignal) {
    return {
      stuck: true,
      reason: `Agent stuck in edit loop: ${editFailures} edit failures (${multipleMatches} "multiple matches", ${notFound} "not found"). The agent should use the Write tool to rewrite the file instead of retrying Edit.`,
    }
  }

  // Detect bash tool failure loop: agent generating calls with undefined/null command
  const bashToolErrors = (output.match(/bash tool was called with invalid arguments/gi) ?? []).length
  if (bashToolErrors >= STUCK_BASH_THRESHOLD && !hasSuccessSignal) {
    return {
      stuck: true,
      reason: `Agent stuck in bash failure loop: ${bashToolErrors} bash calls with undefined/null command. Agent is context-confused — generating malformed tool calls.`,
    }
  }

  return { stuck: false, reason: null }
}

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

    if (detectEmptyIssueBody(job.issueBody)) {
      await ctx.db
        .update(repoIssueJobs)
        .set({ status: "skipped", updatedAt: Math.floor(Date.now() / 1000) })
        .where(eq(repoIssueJobs.id, job.id))
      return {
        summary: "Skipped — issue body is empty or template-only",
        extra: { skipped: true, reason: "empty_issue_body" },
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

    const timeoutMs = computeTimeoutMs(job)
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
        const result = await ctx.spawnOpenCode(task, workDir, timeoutMs, async (chunk) => {
          const lastLine = chunk.split("\n").reverse().find((l) => l.trim().length > 10) ?? ""
          await ctx.updateProgress?.(`CLI (tentativa ${n}/${MAX_TRIES}): ${lastLine.slice(0, 120)}`)
        })
        sessionId = result.sessionId ?? sessionId
        cliOutput = result.output.slice(-MAX_OUTPUT)
        break
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        cliOutput = msg.slice(-MAX_OUTPUT)
        if (n === MAX_TRIES) {
          if (job.requirePassingTests !== 0) {
            // Persist the error output before throwing so it's visible in the job detail
            await ctx.db
              .update(repoIssueJobs)
              .set({ cli_output: cliOutput, updatedAt: Math.floor(Date.now() / 1000) })
              .where(eq(repoIssueJobs.id, job.id))
            throw new Error(`CLI falhou após ${MAX_TRIES} tentativas: ${msg.slice(0, 500)}`)
          }
          await ctx.updateProgress?.("CLI falhou mas require_passing_tests=false — prosseguindo")
        }
      }
    }

    const spec = await readSpec(workDir)
    const now = Math.floor(Date.now() / 1000)

    // Detect if the agent got stuck in an edit loop (CLI exited 0 but made no progress)
    const loopCheck = detectStuckLoop(cliOutput)
    if (loopCheck.stuck) {
      await ctx.db
        .update(repoIssueJobs)
        .set({
          branchName: branch,
          localWorkPath: workDir,
          forkRepoFullName: forkFull,
          specJson: spec,
          session_id: sessionId,
          cli_output: `[STUCK LOOP DETECTED] ${loopCheck.reason}\n\n--- CLI output (last 8000 chars) ---\n${cliOutput}`,
          status: "failed",
          updatedAt: now,
        })
        .where(eq(repoIssueJobs.id, job.id))
      throw new Error(`implement-code aborted: ${loopCheck.reason}`)
    }

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
    `⚠️  CRITICAL RULES (read before starting):`,
    ``,
    `RULE 1 — BASELINE TESTS (mandatory first step):`,
    `Before writing a single line of code, run the full test suite ONCE and record which test suites pass or fail.`,
    `This is your BASELINE. Any test suite that fails BEFORE your changes is a PRE-EXISTING failure.`,
    `DO NOT attempt to fix pre-existing test failures — they are out of scope for this issue.`,
    `Your goal is only to ensure tests that were PASSING before remain passing after your changes.`,
    `Document pre-existing failures in your spec and proceed with the feature regardless.`,
    ``,
    `RULE 2 — EDIT LOOP PREVENTION:`,
    `If the Edit tool fails on the same file 2 times in a row (any error: "multiple matches", "not found", etc.),`,
    `STOP retrying Edit immediately. Instead: Read the full file content, then use the Write tool to rewrite`,
    `the entire file with the needed changes. Never attempt more than 2 consecutive Edit failures on any file.`,
    ``,
    `RULE 3 — BASH TOOL FAILURE:`,
    `If you see "bash tool was called with invalid arguments" or "command received undefined", you are`,
    `generating a bash call without a command string. STOP immediately. Do not retry the same call.`,
    `Review what you intended to run and write the command explicitly as a complete string.`,
    `If this error occurs 3 times in a row, abandon the current approach entirely and try a different method.`,
    ``,
    `RULE 4 — MONOREPO TYPE CHECKING:`,
    `NEVER run "npx tsc --noEmit" or "tsc --noEmit" from the repository root unless tsconfig.json`,
    `exists there (run: ls tsconfig.json first to confirm). In a monorepo:`,
    `  - Check package.json scripts for "typecheck", "type-check", or "tsc" keys and use those scripts`,
    `  - Or cd into the package: cd packages/<name> && npx tsc --noEmit`,
    `  - Or use turbo if turbo.json exists at root: npx turbo typecheck`,
    `Always confirm tsconfig.json exists in the current directory before running tsc directly.`,
    ``,
    `Instructions:`,
    ``,
    `PHASE 1 — BASELINE + DISCOVERY`,
    `0. Run the full test suite NOW (before any changes) to establish the baseline.`,
    `   Record: which test suites pass, which fail. Pre-existing failures → skip, do not fix.`,
    `Check if .opencode/skills/pm-discover/SKILL.md exists and follow it. Otherwise:`,
    `1. Map the project directory structure. Detect monorepo vs single-app.`,
    `2. Read the main manifest (package.json, Cargo.toml, go.mod, *.csproj, etc.) to identify language, framework, package manager, and scripts.`,
    `3. Read AGENTS.md, CLAUDE.md, CONTRIBUTING.md, or any conventions file present.`,
    `4. Identify the test framework, test directory, and read 1-2 existing test files to learn patterns.`,
    `5. Identify architecture layers (API, services, models, UI).`,
    ``,
    `PHASE 2 — PLAN`,
    `6. Write a spec file at ${SPEC_PATH} as JSON with: title, goal, scope, acceptance_criteria, technical_approach, files_to_touch, test_scenarios. Include a "baseline_failures" field listing any pre-existing test suite failures.`,
    `7. Extract acceptance criteria from the issue body. For each criterion, plan: (a) code task, (b) unit test, (c) integration test if applicable.`,
    ``,
    `PHASE 3 — BUILD`,
    `8. Install ALL dependencies required to build and test the project. Use whatever tools are available (bun, npm, npx, pip, cargo, dotnet, go, etc.).`,
    `9. Write tests following the project's existing patterns (Given/When/Then where appropriate).`,
    `10. Implement the code to pass all tests.`,
    `11. Run the full test suite. Verify: (a) tests you ADDED pass, (b) tests that were passing in baseline still pass. Ignore pre-existing failures.`,
    ``,
    `PHASE 4 — FINALIZE`,
    `12. Make minimal, focused changes. Do not commit or push.`,
    `13. If any step fails, diagnose the error, fix it, and retry. If an Edit fails twice on the same file → use Write.`,
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
