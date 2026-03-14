const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

export async function spawnOpenCode(
  task: string,
  cwd: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  const proc = Bun.spawn(["opencode", "run", "--task", task], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  })

  const timeout = setTimeout(() => {
    proc.kill()
  }, timeoutMs)

  const [stdoutBuf, stderrBuf] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])

  await proc.exited
  clearTimeout(timeout)

  const output = [stdoutBuf, stderrBuf].filter(Boolean).join("\n").trim()
  return output
}
