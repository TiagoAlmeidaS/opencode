import { eq, desc } from "drizzle-orm"
import { Octokit } from "@octokit/rest"
import path from "path"
import { mkdir, rm, cp } from "fs/promises"
import { repoIssueJobs, agentLearnings } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"
import { workDirForJob, runGit } from "./dev-cycle-shared"
import { checkExistingPR } from "../github-utils"
import { search } from "../memory/rag"

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

    // ── RAG Enrichment: fetch relevant learnings before first attempt ─────────
    const ragContext = await fetchRagContext(ctx, job)
    // Track used learning IDs for effectiveness metrics
    for (const lid of ragContext.learningIds) {
      const [row] = await ctx.db.select({ usedCount: agentLearnings.usedCount }).from(agentLearnings).where(eq(agentLearnings.id, lid)).limit(1)
      if (row) await ctx.db.update(agentLearnings).set({ usedCount: row.usedCount + 1 }).where(eq(agentLearnings.id, lid))
    }

    const MAX_OUTPUT = 10_000

    let sessionId: string | null = null
    let cliOutput = ""
    for (let n = 1; n <= MAX_TRIES; n++) {
      await ctx.updateProgress?.(`OpenCode tentativa ${n}/${MAX_TRIES}`)
      if (n > 1) {
        const spec = await readSpec(workDir)
        if (spec) job = { ...job, specJson: spec }
        // In-job retry: extract and store error pattern from previous failure
        await extractInJobRetryLearning(ctx, job, cliOutput, n - 1)
      }
      const task = buildTask(job, n, n > 1 ? cliOutput : undefined, ragContext.context)
      const codingModel = ctx.llmRouter?.modelFor("coding")
      try {
        const result = await ctx.spawnOpenCode(task, workDir, { model: codingModel })
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
    await ctx.db
      .update(repoIssueJobs)
      .set({
        branchName: branch,
        localWorkPath: workDir,
        forkRepoFullName: forkFull,
        specJson: spec,
        session_id: sessionId,
        cli_output: cliOutput,
        used_learning_ids: ragContext.learningIds.length > 0 ? JSON.stringify(ragContext.learningIds) : null,
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

/** Extracts and stores an error_pattern learning from a failed CLI attempt (in-job retry). */
async function extractInJobRetryLearning(
  ctx: ActivityContext,
  job: typeof repoIssueJobs.$inferSelect,
  errorOutput: string,
  attempt: number,
): Promise<void> {
  const memLlm = ctx.llmRouter
    ? (opts: import("../types").MemoryLlmOptions) => ctx.llmRouter!.call("memory", opts)
    : ctx.memoryLlm
  if (!memLlm || !errorOutput) return

  try {
    const raw = await memLlm({
      system: "You are an error pattern extractor. Extract a single structured error pattern from a failed coding agent attempt. Respond with JSON only.",
      prompt: `A coding agent failed on attempt ${attempt} for repo "${job.repoFullName}" issue "${job.issueTitle}".

Failed output (tail):
${errorOutput.slice(-2000)}

Extract a single error_pattern learning as JSON:
{
  "key": "error-pattern-<slug>",
  "title": "<short error description, max 60 chars>",
  "body": "<root cause and fix in 2 sentences>",
  "confidence": <0.0-1.0>,
  "tags": ["<repo>", "<language-or-framework>"]
}`,
      maxTokens: 400,
    })

    const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
    const parsed = JSON.parse(clean) as { key?: string; title?: string; body?: string; confidence?: number; tags?: string[] }
    if (!parsed.key || !parsed.title || !parsed.body) return

    const now = Math.floor(Date.now() / 1000)
    const key = `${parsed.key}-${job.repoFullName.replace(/\//g, "-")}`.slice(0, 100)
    const [existing] = await ctx.db.select().from(agentLearnings).where(eq(agentLearnings.key, key)).limit(1)

    if (existing) {
      const conf = Math.round((existing.confidence * 0.7 + (parsed.confidence ?? 0.5) * 0.3) * 100) / 100
      await ctx.db.update(agentLearnings).set({ body: parsed.body, confidence: conf, negativeCount: existing.negativeCount + 1, updatedAt: now }).where(eq(agentLearnings.id, existing.id))
    } else {
      const { ulid } = await import("ulid")
      await ctx.db.insert(agentLearnings).values({
        id: ulid(),
        category: "error_pattern",
        key,
        title: parsed.title.slice(0, 60),
        body: parsed.body,
        confidence: parsed.confidence ?? 0.5,
        source: "in-job-retry",
        positiveCount: 0,
        negativeCount: 1,
        tags: JSON.stringify([job.repoFullName, ...(parsed.tags ?? [])]),
        usedCount: 0,
        helpedCount: 0,
        createdAt: now,
        updatedAt: now,
      })
    }
  } catch { /* LLM or parse failure — skip silently */ }
}

async function fetchRagContext(
  ctx: ActivityContext,
  job: typeof repoIssueJobs.$inferSelect,
): Promise<{ context: string; learningIds: string[] }> {
  const parts: string[] = []
  const learningIds: string[] = []

  // 1. Qdrant semantic search for relevant past learnings
  if (ctx.embed) {
    try {
      const query = `${job.repoFullName} ${job.issueTitle}`
      const results = await search(query, 5)
      if (results.length > 0) {
        parts.push("### Learnings from similar past executions:")
        for (const r of results) {
          if (r.score >= 0.6) parts.push(`- ${r.text.slice(0, 300)}`)
        }
      }
    } catch { /* RAG unavailable — skip */ }
  }

  // 2. Fetch top error_pattern learnings for this repo from DB
  try {
    const repoTag = job.repoFullName
    const rows = await ctx.db
      .select()
      .from(agentLearnings)
      .where(eq(agentLearnings.category, "error_pattern"))
      .orderBy(desc(agentLearnings.confidence))
      .limit(6)

    // Filter by repo tag if possible
    const repoRows = rows.filter((r) => {
      try { return (JSON.parse(r.tags ?? "[]") as string[]).includes(repoTag) } catch { return false }
    })
    const relevant = repoRows.length > 0 ? repoRows : rows.slice(0, 4)

    if (relevant.length > 0) {
      parts.push("### Known error patterns (avoid repeating these):")
      for (const r of relevant) {
        parts.push(`- [${r.key}] ${r.title}: ${r.body.slice(0, 200)}`)
        learningIds.push(r.id)
      }
    }
  } catch { /* DB query failed — skip */ }

  if (parts.length === 0) return { context: "", learningIds }

  return {
    context: ["## Context from Previous Executions", ...parts].join("\n"),
    learningIds,
  }
}

function buildTask(
  job: typeof repoIssueJobs.$inferSelect,
  attempt: number,
  prev?: string,
  ragContext?: string,
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

  if (ragContext) {
    parts.push(``, ragContext)
  }

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
