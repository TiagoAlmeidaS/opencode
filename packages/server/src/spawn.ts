const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

const CLI = process.env.OPENCODE_CLI_PATH ?? "opencode"

export async function spawnOpenCode(
  task: string,
  cwd: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<string> {
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

  if (proc.exitCode !== 0) {
    const errOutput = [stderrBuf, stdoutBuf].filter(Boolean).join("\n").trim().slice(0, 1000)
    throw new Error(`OpenCode CLI exited with code ${proc.exitCode}: ${errOutput}`)
  }

  return [stdoutBuf, stderrBuf].filter(Boolean).join("\n").trim()
}
