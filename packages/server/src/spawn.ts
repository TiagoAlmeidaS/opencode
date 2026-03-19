import { Database as BunDatabase } from "bun:sqlite"
import path from "path"

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
const CLI = process.env.OPENCODE_CLI_PATH ?? "opencode"
const OPENCODE_DB = process.env.OPENCODE_DB_PATH
  ?? path.join(process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : "/data", "opencode.db")

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

  const proc = Bun.spawn([CLI, "run", "--task", task], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
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
  return { output, sessionId }
}
