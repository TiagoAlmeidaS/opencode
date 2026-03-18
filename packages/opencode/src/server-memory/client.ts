import { Config } from "@/config/config"
import { Flag } from "@/flag/flag"
import { Log } from "@/util/log"

const log = Log.create({ service: "server-memory" })

export type RagChunk = { text: string; source?: string; score?: number }

export type LearningRow = {
  id: string
  category: string
  key: string
  title: string
  body: string
  confidence: number
  source: string | null
  tags: string | null
  positiveCount: number
  negativeCount: number
  createdAt: number
  updatedAt: number
}

function authHeader(): Record<string, string> {
  const p = Flag.OPENCODE_SERVER_PASSWORD
  if (!p) return {}
  const u = Flag.OPENCODE_SERVER_USERNAME || "opencode"
  const b = Buffer.from(`${u}:${p}`).toString("base64")
  return { Authorization: `Basic ${b}` }
}

/** Resolves /server API base (no trailing slash). */
export async function base(): Promise<string | undefined> {
  const fromEnv = process.env.OPENCODE_SERVER_MEMORY_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/+$/, "")
  const cfg = await Config.get()
  const fromCfg = cfg.server?.memory?.url?.trim()
  if (fromCfg) return fromCfg.replace(/\/+$/, "")
  const root = process.env.OPENCODE_SERVER_URL?.trim()
  if (root) return `${root.replace(/\/+$/, "")}/server`
  return undefined
}

async function timeoutMs(): Promise<number> {
  const cfg = await Config.get()
  return cfg.server?.memory?.timeoutMs ?? 8000
}

export async function retrieveRag(root: string, q: string, limit: number): Promise<RagChunk[]> {
  if (!q.trim()) return []
  const u = new URL(`${root}/memory/retrieve`)
  u.searchParams.set("q", q.slice(0, 4000))
  u.searchParams.set("limit", String(Math.min(20, Math.max(1, limit))))
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), await timeoutMs())
  const res = await fetch(u.href, { headers: { ...authHeader() }, signal: ctrl.signal }).finally(() =>
    clearTimeout(t),
  )
  if (!res.ok) {
    log.warn("memory retrieve failed", { status: res.status })
    return []
  }
  const j = (await res.json()) as { chunks?: RagChunk[] }
  return Array.isArray(j.chunks) ? j.chunks : []
}

export async function fetchLearnings(
  root: string,
  opts: { category?: string; limit?: number },
): Promise<LearningRow[]> {
  const u = new URL(`${root}/learnings`)
  u.searchParams.set("limit", String(Math.min(200, Math.max(1, opts.limit ?? 25))))
  if (opts.category) u.searchParams.set("category", opts.category)
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), await timeoutMs())
  const res = await fetch(u.href, { headers: { ...authHeader() }, signal: ctrl.signal }).finally(() =>
    clearTimeout(t),
  )
  if (!res.ok) {
    log.warn("learnings list failed", { status: res.status })
    return []
  }
  const rows = (await res.json()) as LearningRow[]
  return Array.isArray(rows) ? rows : []
}

export function fmtRag(chunks: RagChunk[]): string {
  if (!chunks.length) return ""
  const lines = chunks.map(
    (c, i) =>
      `### chunk ${i + 1}${c.source ? ` (${c.source})` : ""}\n${c.text}`,
  )
  return ["<server-memory-rag>", ...lines, "</server-memory-rag>"].join("\n\n")
}

export function fmtLearnings(rows: LearningRow[]): string {
  if (!rows.length) return ""
  const lines = rows.map((r) => `- **${r.key}** (${r.category}, conf=${r.confidence.toFixed(2)}): ${r.title}\n  ${r.body.slice(0, 500)}${r.body.length > 500 ? "…" : ""}`)
  return ["<agent-learnings>", ...lines, "</agent-learnings>"].join("\n\n")
}

export async function putLearning(
  root: string,
  input: {
    key: string
    category: string
    title: string
    body: string
    confidence?: number
    tags?: string[]
    source?: string
  },
): Promise<LearningRow | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), await timeoutMs())
  const res = await fetch(`${root}/learnings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(input),
    signal: ctrl.signal,
  }).finally(() => clearTimeout(t))
  if (!res.ok) {
    log.warn("learnings create failed", { status: res.status })
    return null
  }
  return (await res.json()) as LearningRow
}

export async function contextForUserMessage(text: string): Promise<string[]> {
  const root = await base()
  if (!root) return []
  const cfg = await Config.get()
  const mem = cfg.server?.memory
  const ragOn = mem?.rag !== false
  const learnOn = mem?.learnings !== false
  const out: string[] = []
  const q = text.trim().slice(0, 4000)
  if (ragOn && q) {
    const chunks = await retrieveRag(root, q, 5)
    const s = fmtRag(chunks)
    if (s) out.push(s)
  }
  if (learnOn) {
    const rows = await fetchLearnings(root, { limit: 20 })
    const s = fmtLearnings(rows)
    if (s) out.push(s)
  }
  return out
}

export const ServerMemory = {
  base,
  retrieveRag,
  fetchLearnings,
  putLearning,
  contextForUserMessage,
  fmtRag,
  fmtLearnings,
}
