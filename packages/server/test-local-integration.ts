/**
 * Local integration test for the implement-code pipeline.
 *
 * Tests the full path:
 *   spawnOpenCode → implement-code activity → generate-docs → PR check
 *
 * Run with:
 *   bun run --env-file=../../.env.server test-local-integration.ts
 *
 * Optional args:
 *   --repo owner/repo     (default: TiagoAlmeidaS/atendimento_atacado)
 *   --issue <number>      (default: uses TEST_ISSUE_NUMBER env or 1)
 *   --spawn-only          skip implement-code, just test spawnOpenCode directly
 *   --task "..."          custom task for --spawn-only mode
 */

import { Database as BunDatabase } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { ulid } from "ulid"
import { mkdir, rm, writeFile } from "fs/promises"
import path from "path"
import * as schema from "./src/schema"
import { spawnOpenCode } from "./src/spawn"
import { implementCodeActivity } from "./src/activities/implement-code"
import type { ActivityContext } from "./src/types"

// ── Parse args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const REPO = opt("--repo", "TiagoAlmeidaS/atendimento_atacado")
const ISSUE_NUMBER = parseInt(opt("--issue", process.env.TEST_ISSUE_NUMBER ?? "1"), 10)
const SPAWN_ONLY = flag("--spawn-only")
const CUSTOM_TASK = opt("--task", "")

// ── Env validation ────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`❌  Missing env var: ${name}`)
    console.error(`    Make sure you're running with: bun run --env-file=../../.env.server test-local-integration.ts`)
    process.exit(1)
  }
  return v
}

const GITHUB_TOKEN = requireEnv("GITHUB_TOKEN")
const MEMORY_LLM_PROVIDER = process.env.MEMORY_LLM_PROVIDER ?? "(not set)"

console.log("╔══════════════════════════════════════════════════════════════╗")
console.log("║        OpenCode Local Integration Test                      ║")
console.log("╚══════════════════════════════════════════════════════════════╝")
console.log()
console.log("Config:")
console.log("  MEMORY_LLM_PROVIDER  =", MEMORY_LLM_PROVIDER)
console.log("  AZURE_DEPLOYMENT     =", process.env.AZURE_OPENAI_DEPLOYMENT ?? "(not set)")
console.log("  OPENROUTER_MODEL     =", process.env.OPENROUTER_MODEL ?? "(not set)")
console.log("  OPENCODE_CLI_PATH    =", process.env.OPENCODE_CLI_PATH ?? "opencode (from PATH)")
console.log("  OPENCODE_CONFIG      =", process.env.OPENCODE_CONFIG_CONTENT ?? "(not set)")
console.log("  Repo                 =", REPO)
console.log("  Mode                 =", SPAWN_ONLY ? "spawn-only" : `implement-code (issue #${ISSUE_NUMBER})`)
console.log()

// ── Mode 1: spawn-only — just test if the CLI works ──────────────────────────

if (SPAWN_ONLY) {
  const task = CUSTOM_TASK || "List the files in the current directory and write a simple summary to SUMMARY.md"
  const workDir = path.join(process.env.TEMP ?? "/tmp", `opencode-local-test-${Date.now()}`)

  console.log("── SPAWN-ONLY TEST ──────────────────────────────────────────────")
  console.log("  workDir:", workDir)
  console.log("  task:", task.slice(0, 80) + "...")
  console.log()

  await mkdir(workDir, { recursive: true })
  // Put a minimal file so the CLI has something to work with
  await writeFile(path.join(workDir, "package.json"), JSON.stringify({ name: "test-project", version: "1.0.0" }, null, 2))
  await writeFile(path.join(workDir, "README.md"), "# Test project\n\nA minimal test project.\n")

  const started = Date.now()
  console.log("⏳  Calling spawnOpenCode...")

  try {
    const result = await spawnOpenCode(task, workDir, 5 * 60 * 1000) // 5 min timeout
    const elapsed = ((Date.now() - started) / 1000).toFixed(1)

    console.log()
    console.log("✅  spawnOpenCode SUCCEEDED in", elapsed + "s")
    console.log("  sessionId:", result.sessionId ?? "(null — no session created)")
    console.log("  output length:", result.output.length)
    console.log()
    console.log("── OUTPUT (last 800 chars) ──────────────────────────────────────")
    console.log(result.output.slice(-800))
    console.log()

    if (!result.sessionId) {
      console.log("⚠️   WARNING: CLI returned code 0 but no session was created.")
      console.log("    This usually means the LLM API was unavailable.")
      console.log("    Check your MEMORY_LLM_PROVIDER / API keys.")
    } else {
      console.log("🎉  CLI created session:", result.sessionId)
      console.log("    The LLM pipeline is working correctly!")
    }
  } catch (err) {
    const elapsed = ((Date.now() - started) / 1000).toFixed(1)
    console.log()
    console.log("❌  spawnOpenCode FAILED in", elapsed + "s")
    console.log("  Error:", err instanceof Error ? err.message : String(err))
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }

  process.exit(0)
}

// ── Mode 2: full implement-code against a real GitHub issue ──────────────────

console.log("── FULL IMPLEMENT-CODE TEST ─────────────────────────────────────")

// Create a temporary SQLite DB
const tempDb = path.join(process.env.TEMP ?? "/tmp", `opencode-itest-${Date.now()}.db`)
const sqlite = new BunDatabase(tempDb)
const db = drizzle({ client: sqlite, schema })

// Seed the minimal schema needed
sqlite.run(`
  CREATE TABLE IF NOT EXISTS daemon_pipelines (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, strategy TEXT NOT NULL,
    config_json TEXT NOT NULL DEFAULT '{}', schedule_cron TEXT NOT NULL DEFAULT '0 3 * * *',
    enabled INTEGER NOT NULL DEFAULT 1, max_retries INTEGER NOT NULL DEFAULT 3,
    retry_delay_sec INTEGER NOT NULL DEFAULT 300, max_runs_per_day INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  )
`)
sqlite.run(`
  CREATE TABLE IF NOT EXISTS repo_issue_jobs (
    id TEXT PRIMARY KEY, pipeline_id TEXT, opportunity_id TEXT,
    repo_full_name TEXT NOT NULL, issue_number INTEGER, issue_title TEXT NOT NULL,
    issue_body TEXT, status TEXT NOT NULL DEFAULT 'pending',
    spec_json TEXT, test_files TEXT, docs_markdown TEXT,
    branch_name TEXT, fork_repo_full_name TEXT, upstream_owner TEXT, upstream_repo TEXT,
    local_work_path TEXT, pr_url TEXT, pr_number INTEGER, pr_draft INTEGER DEFAULT 1,
    base_branch TEXT DEFAULT 'main', use_fork INTEGER DEFAULT 0,
    require_passing_tests INTEGER DEFAULT 1, session_id TEXT, cli_output TEXT,
    learning_extracted_at INTEGER, pr_outcome TEXT, pr_outcome_at INTEGER,
    pr_review_comments TEXT, retry_count INTEGER DEFAULT 0,
    self_improvement_proposal_id TEXT, upstream_issue_number INTEGER,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  )
`)
sqlite.run(`
  CREATE TABLE IF NOT EXISTS daemon_queue (
    id TEXT PRIMARY KEY, activity_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
    priority INTEGER NOT NULL DEFAULT 5, input_json TEXT, output_json TEXT,
    error_message TEXT, started_at INTEGER, completed_at INTEGER, duration_ms INTEGER,
    locked_by TEXT, locked_at INTEGER, triggered_by TEXT,
    related_opportunity_id TEXT, depends_on TEXT, created_at INTEGER NOT NULL
  )
`)

// Fetch the real issue from GitHub
console.log(`⏳  Fetching issue #${ISSUE_NUMBER} from ${REPO}...`)
const [owner, repo] = REPO.split("/")
const issueResp = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${ISSUE_NUMBER}`, {
  headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: "application/vnd.github.v3+json" },
})
if (!issueResp.ok) {
  console.error(`❌  GitHub API error: ${issueResp.status} ${await issueResp.text()}`)
  process.exit(1)
}
const issue = (await issueResp.json()) as { title: string; body?: string | null }
console.log("  Issue title:", issue.title)
console.log()

// Insert pipeline row (required FK)
const pipelineId = ulid()
const now = Math.floor(Date.now() / 1000)
sqlite.run(
  `INSERT INTO daemon_pipelines VALUES (?,?,?,?,?,1,3,300,0,?,?)`,
  [pipelineId, "Integration Test Pipeline", "repo-issue-worker", "{}", "* * * * *", now, now],
)

// Insert the job
const jobId = ulid()
sqlite.run(
  `INSERT INTO repo_issue_jobs (id, pipeline_id, repo_full_name, issue_number, issue_title, issue_body, status, base_branch, use_fork, require_passing_tests, retry_count, created_at, updated_at)
   VALUES (?,?,?,?,?,?,'pending','main',0,0,0,?,?)`,
  [jobId, pipelineId, REPO, ISSUE_NUMBER, issue.title, issue.body ?? "", now, now],
)

console.log("  Job ID:", jobId)
console.log("  Starting implement-code activity...")
console.log()

// Build a mock memoryLlm (for docs step — we only test implement-code here)
const ctx: ActivityContext = {
  queueItemId: ulid(),
  input: { repo_issue_job_id: jobId },
  db,
  spawnOpenCode,
  memoryLlm: async (opts) => {
    // Simple pass-through using the same Azure/OpenRouter provider
    const provider = MEMORY_LLM_PROVIDER
    if (provider === "azure") {
      const key = process.env.AZURE_OPENAI_API_KEY!
      const base = process.env.AZURE_OPENAI_BASE_URL!
      const dep = process.env.AZURE_OPENAI_DEPLOYMENT!
      const ver = process.env.AZURE_OPENAI_API_VERSION ?? "2024-06-01"
      const url = `${base}/openai/deployments/${dep}/chat/completions?api-version=${ver}`
      const r = await fetch(url, {
        method: "POST",
        headers: { "api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          max_tokens: opts.maxTokens ?? 1024,
          messages: [
            ...(opts.system ? [{ role: "system", content: opts.system }] : []),
            { role: "user", content: opts.prompt },
          ],
        }),
      })
      const d = (await r.json()) as { choices?: { message?: { content?: string } }[] }
      return d.choices?.[0]?.message?.content ?? ""
    }
    // fallback: openrouter
    const key = process.env.OPENROUTER_API_KEY!
    const model = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini"
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 1024,
        messages: [
          ...(opts.system ? [{ role: "system", content: opts.system }] : []),
          { role: "user", content: opts.prompt },
        ],
      }),
    })
    const d = (await r.json()) as { choices?: { message?: { content?: string } }[] }
    return d.choices?.[0]?.message?.content ?? ""
  },
  async enqueue() { return ulid() },
  async updateProgress(step) { console.log("  [progress]", step) },
}

const started = Date.now()
try {
  const result = await implementCodeActivity.execute(ctx)
  const elapsed = ((Date.now() - started) / 1000).toFixed(1)

  // Read final job state
  const final = sqlite.query(`SELECT * FROM repo_issue_jobs WHERE id = ?`).get(jobId) as Record<string, unknown>

  console.log()
  console.log("╔══════════════════════════════════════════════════════════════╗")
  console.log("║  RESULT                                                      ║")
  console.log("╚══════════════════════════════════════════════════════════════╝")
  console.log("  Elapsed      :", elapsed + "s")
  console.log("  Status       :", final.status)
  console.log("  Session ID   :", final.session_id ?? "(null)")
  console.log("  Branch       :", final.branch_name ?? "(none)")
  console.log("  specJson     :", final.spec_json ? "✅  present (" + String(final.spec_json).length + " chars)" : "❌  null")
  console.log("  Summary      :", (result as { summary?: string })?.summary ?? "-")
  console.log()
  console.log("── CLI Output (last 600 chars) ──────────────────────────────────")
  console.log(String(final.cli_output ?? "").slice(-600))
  console.log()

  if (final.spec_json) {
    console.log("🎉  SUCCESS — CLI generated a spec. Full pipeline should work!")
    console.log()
    console.log("── Spec preview ─────────────────────────────────────────────────")
    console.log(String(final.spec_json).slice(0, 500))
  } else if (final.session_id) {
    console.log("⚠️   CLI created a session but didn't generate a spec file.")
    console.log("    Check the task prompt or SKILL.md configuration.")
  } else {
    console.log("❌  CLI did not create a session. LLM API may be unavailable.")
  }

} catch (err) {
  const elapsed = ((Date.now() - started) / 1000).toFixed(1)
  console.log()
  console.log("❌  implement-code FAILED in", elapsed + "s")
  console.log("  Error:", err instanceof Error ? err.message : String(err))

  const final = sqlite.query(`SELECT status, cli_output FROM repo_issue_jobs WHERE id = ?`).get(jobId) as Record<string, unknown>
  console.log("  Job status after error:", final?.status)
  console.log("  CLI output:", String(final?.cli_output ?? "").slice(-400))
} finally {
  sqlite.close()
  await rm(tempDb, { force: true }).catch(() => {})
  // Clean up workspace if it exists
  const workDir = `/tmp/opencode-rj/${jobId}`
  await rm(workDir, { recursive: true, force: true }).catch(() => {})
}
