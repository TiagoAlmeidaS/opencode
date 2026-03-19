import path from "path"
import { tmpdir } from "os"

export function workDirForJob(jobId: string): string {
  return path.join(tmpdir(), "opencode-rj", jobId, "repo")
}

export function parseGithubUrl(url: string): { owner: string; repo: string; issueNumber: number | null } | null {
  const base = url.match(/github\.com\/([^/]+)\/([^/?#]+)/)
  if (!base) return null
  const repoName = base[2].replace(/\.git$/, "")
  const issueMatch = url.match(/\/issues\/(\d+)/)
  return {
    owner: base[1],
    repo: repoName,
    issueNumber: issueMatch ? parseInt(issueMatch[1], 10) : null,
  }
}

export function parseRepoFullName(full: string): { owner: string; repo: string } | null {
  const p = full.trim().replace(/^https?:\/\/github\.com\//, "").split("/").filter(Boolean)
  if (p.length < 2) return null
  return { owner: p[0], repo: p[1].replace(/\.git$/, "") }
}

export async function runGit(args: string[], cwd: string): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  })
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  await proc.exited
  if (proc.exitCode !== 0) throw new Error(`git ${args[0]}: ${err.trim().slice(0, 400)}`)
  return out.trim()
}

export async function runCommand(cmd: string, cwd: string): Promise<{ ok: boolean; out: string }> {
  try {
    const parts = cmd.split(/\s+/)
    const proc = Bun.spawn(parts, { cwd, stdout: "pipe", stderr: "pipe" })
    const [out, err] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    await proc.exited
    return { ok: proc.exitCode === 0, out: (out + "\n" + err).trim().slice(0, 4000) }
  } catch (err) {
    return { ok: false, out: `Runtime not available: ${err}` }
  }
}

export async function detectTestCommand(cwd: string): Promise<string | null> {
  try {
    const pkg = JSON.parse(await Bun.file(path.join(cwd, "package.json")).text()) as {
      scripts?: Record<string, string>
    }
    if (pkg.scripts?.["test:ci"]) return "npm run test:ci"
    if (pkg.scripts?.test && !pkg.scripts.test.includes("no test")) return "npm test"
  } catch { /* empty */ }
  if (await Bun.file(path.join(cwd, "go.mod")).exists()) return "go test ./..."
  if (await Bun.file(path.join(cwd, "Cargo.toml")).exists()) return "cargo test"
  if (
    (await Bun.file(path.join(cwd, "pytest.ini")).exists()) ||
    (await Bun.file(path.join(cwd, "pyproject.toml")).exists()) ||
    (await Bun.file(path.join(cwd, "setup.py")).exists())
  )
    return "python -m pytest --tb=short -q"
  if (await Bun.file(path.join(cwd, "Gemfile")).exists()) return "bundle exec rspec --format progress"
  if (await Bun.file(path.join(cwd, "pom.xml")).exists()) return "mvn test -q"
  if (await Bun.file(path.join(cwd, "composer.json")).exists()) return "composer test"
  return null
}
