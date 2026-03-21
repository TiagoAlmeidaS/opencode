import { Database as BunDatabase } from "bun:sqlite"
import path from "path"

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
  // If the caller already set a config, respect it as-is
  if (process.env.OPENCODE_CONFIG_CONTENT) {
    return {}
  }

  const provider = process.env.MEMORY_LLM_PROVIDER ?? "openrouter"

  if (provider === "azure") {
    const baseUrl = process.env.AZURE_OPENAI_BASE_URL ?? ""
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-4o-mini"
    const apiKey = process.env.AZURE_OPENAI_API_KEY ?? ""
    // Extract resource name from URL: https://my-resource.openai.azure.com → my-resource
    const resourceName = baseUrl ? new URL(baseUrl).hostname.split(".")[0] : ""
    const config = JSON.stringify({
      model: `azure/${deployment}`,
      provider: { azure: { options: { resourceName } } },
    })
    return {
      OPENCODE_CONFIG_CONTENT: config,
      AZURE_API_KEY: apiKey, // @ai-sdk/azure reads AZURE_API_KEY
    }
  }

  if (provider === "openrouter") {
    const model = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini"
    const config = JSON.stringify({ model: `openrouter/${model}` })
    return { OPENCODE_CONFIG_CONTENT: config }
  }

  return {}
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
