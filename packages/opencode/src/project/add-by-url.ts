import path from "path"
import { existsSync } from "fs"
import { mkdir } from "fs/promises"
import { Global } from "../global"
import { Project } from "./project"
import { git } from "../util/git"
import { which } from "../util/which"
import { Log } from "../util/log"
import { Process } from "../util/process"

const log = Log.create({ service: "project.add-by-url" })

const ALLOWED_HOSTS = ["github.com", "www.github.com"]

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const trimmed = url.trim().replace(/\.git$/i, "")
  try {
    const u = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`)
    const host = u.hostname.toLowerCase().replace(/^www\./, "")
    if (host !== "github.com") return null
    const parts = u.pathname.replace(/^\/+/, "").split("/").filter(Boolean)
    if (parts.length < 2) return null
    return { owner: parts[0], repo: parts[1] }
  } catch {
    return null
  }
}

function isAllowedUrl(url: string): boolean {
  try {
    const u = new URL(url.trim().startsWith("http") ? url.trim() : `https://${url.trim()}`)
    const host = u.hostname.toLowerCase().replace(/^www\./, "")
    return ALLOWED_HOSTS.includes(host)
  } catch {
    return false
  }
}

async function runClone(args: string[], cwd: string): Promise<void> {
  const result = await Process.run(["git", ...args], {
    cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    nothrow: true,
  })
  if (result.code !== 0) {
    const err = result.stderr.toString().trim().slice(0, 500)
    throw new Error(err || `git clone failed with code ${result.code}`)
  }
}

export async function addProjectByUrl(input: {
  url: string
  branch?: string
  token?: string
}): Promise<Project.Info> {
  const { url, branch } = input
  if (!url?.trim()) throw new Error("URL is required")

  if (!isAllowedUrl(url)) {
    throw new Error("Only GitHub URLs are allowed (e.g. https://github.com/owner/repo)")
  }

  const parsed = parseGitHubUrl(url)
  if (!parsed) throw new Error("Invalid GitHub URL; use https://github.com/owner/repo")

  const reqTok = input.token?.trim() ?? ""
  const envTok = process.env.GITHUB_TOKEN?.trim() ?? ""
  const token = reqTok || envTok

  if (!which("git")) throw new Error("Git is not installed")

  const slug = `${parsed.owner}-${parsed.repo}`
  const baseDir = path.join(Global.Path.data, "projects")
  const targetDir = path.join(baseDir, slug)
  const cloneUrl = token
    ? `https://x-access-token:${token}@github.com/${parsed.owner}/${parsed.repo}.git`
    : `https://github.com/${parsed.owner}/${parsed.repo}.git`

  if (existsSync(targetDir)) {
    log.info("addProjectByUrl: directory exists, registering", { targetDir })
    const { project } = await Project.fromDirectory(targetDir)
    return project
  }

  await mkdir(baseDir, { recursive: true })
  const cloneArgs = ["clone", "--depth", "1", cloneUrl, slug]
  if (branch) cloneArgs.splice(2, 0, "-b", branch)
  try {
    await runClone(cloneArgs, baseDir)
  } catch (err) {
    if (!token) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(
        `${msg} — For private repos, send a GitHub PAT from the app or set GITHUB_TOKEN on the server.`,
      )
    }
    throw err
  }

  const { project } = await Project.fromDirectory(targetDir)
  return project
}
