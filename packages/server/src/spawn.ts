import { Database as BunDatabase } from "bun:sqlite"
import path from "path"
import { applyAzureOpenAiEnvAliases } from "@opencode-ai/util/azure-openai-env"

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
const CLI = process.env.OPENCODE_CLI_PATH ?? "opencode"
const OPENCODE_DB = process.env.OPENCODE_DB_PATH
  ?? path.join(process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : "/data", "opencode.db")

/**
 * Build OPENCODE_CONFIG_CONTENT and any extra env vars needed by the CLI
 * based on MEMORY_LLM_PROVIDER and the provider-specific env vars already
 * configured in the server. This avoids having to maintain a separate
 * OPENCODE_CONFIG_CONTENT in .env.server.
 *
 * Priority: explicit OPENCODE_CONFIG_CONTENT > dynamic build from provider vars.
 */
function buildCliEnv(): Record<string, string> {
  applyAzureOpenAiEnvAliases()
  const extra: Record<string, string> = {}
  const provider = process.env.MEMORY_LLM_PROVIDER ?? "openrouter"

  // Always inject Azure credentials when Azure is the active provider (after aliases).
  if (provider === "azure") {
    const apiKey = process.env.AZURE_API_KEY ?? ""
    const resourceName = process.env.AZURE_RESOURCE_NAME ?? ""
    if (apiKey) extra.AZURE_API_KEY = apiKey
    if (resourceName) extra.AZURE_RESOURCE_NAME = resourceName
  }

  // If OPENCODE_CONFIG_CONTENT is already set (e.g. explicit override in .env.server),
  // respect it and only return the credential aliases above.
  if (process.env.OPENCODE_CONFIG_CONTENT) {
    return extra
  }

  // Build OPENCODE_CONFIG_CONTENT dynamically from provider env vars.
  if (provider === "azure") {
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-4o-mini"
    const resourceName = extra.AZURE_RESOURCE_NAME ?? ""
    extra.OPENCODE_CONFIG_CONTENT = JSON.stringify({
      model: `azure/${deployment}`,
      provider: { azure: { options: { resourceName } } },
    })
  } else if (provider === "openrouter") {
    const model = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini"
    extra.OPENCODE_CONFIG_CONTENT = JSON.stringify({ model: `openrouter/${model}` })
  }

  return extra
}

export interface SpawnResult {
  output: string
  sessionId: string | null
}

function findSession(cwd: string, before: number): string | null {
  try {
    const db = new BunDatabase(OPENCODE_DB, { readonly: true })
    try {
      const row = db
        .query<{ id: string }, [string, number]>(
          `SELECT id FROM session WHERE directory = ? AND time_updated >= ? ORDER BY time_updated DESC LIMIT 1`,
        )
        .get(cwd, before)
      return row?.id ?? null
    } finally {
      db.close()
    }
  } catch {
    return null
  }
}

export async function spawnOpenCode(
  task: string,
  cwd: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<SpawnResult> {
  const before = Math.floor(Date.now() / 1000) - 2

  const proc = Bun.spawn([CLI, "run", task], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...buildCliEnv() },
  })

  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    proc.kill()
  }, timeoutMs)

  const [stdoutBuf, stderrBuf] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])

  await proc.exited
  clearTimeout(timeout)

  if (timedOut) {
    throw new Error(`OpenCode CLI timed out after ${Math.round(timeoutMs / 1000)}s`)
  }

  const output = [stdoutBuf, stderrBuf].filter(Boolean).join("\n").trim()

  if (proc.exitCode !== 0) {
    throw new Error(`OpenCode CLI exited with code ${proc.exitCode}: ${output.slice(0, 1000)}`)
  }

  const sessionId = findSession(cwd, before)

  // If the CLI exited with code 0 but never created a session and produced
  // minimal output (only the DB migration banner), it means the CLI failed
  // to start a real session — typically due to an LLM config error or API
  // rate limit that the CLI swallows silently.
  const MIGRATION_ONLY = /^(Performing one time database migration[\s\S]*?Database migration complete\.?\s*)$/
  if (!sessionId && MIGRATION_ONLY.test(output)) {
    throw new Error(
      `OpenCode CLI exited without starting a session (LLM config error or API rate-limit). Output: ${output.slice(0, 500)}`,
    )
  }

  return { output, sessionId }
}
