/**
 * Minimal RAG: Qdrant vector store and retrieval for memory/skills.
 * Optional; requires OPENCODE_QDRANT_URL and an embed function.
 */
const COLLECTION = "opencode_memory"

export interface RagConfig {
  qdrantUrl: string
  embed: (text: string) => Promise<number[]>
  vectorSize?: number
}

let config: RagConfig | null = null

export function setRagConfig(c: RagConfig | null) {
  config = c
}

export function getRagConfig(): RagConfig | null {
  return config
}

async function ensureCollection(vectorSize: number) {
  const base = config?.qdrantUrl?.replace(/\/$/, "")
  if (!base) return false
  const res = await fetch(`${base}/collections/${COLLECTION}`, { method: "GET" }).catch(() => null)
  if (res?.ok) return true
  await fetch(`${base}/collections/${COLLECTION}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      vectors: { size: vectorSize, distance: "Cosine" },
    }),
  })
  return true
}

export async function addChunks(
  chunks: { id: string; text: string; source: string; metadata?: Record<string, unknown> }[]
): Promise<boolean> {
  if (!config || chunks.length === 0) return false
  const vectors = await Promise.all(chunks.map((c) => config!.embed(c.text)))
  const size = vectors[0]?.length ?? 0
  if (size === 0) return false
  await ensureCollection(size)
  const base = config.qdrantUrl.replace(/\/$/, "")
  const points = chunks.map((c, i) => ({
    id: c.id,
    vector: vectors[i],
    payload: {
      text: c.text,
      source: c.source,
      ...(c.metadata ?? {}),
    },
  }))
  const res = await fetch(`${base}/collections/${COLLECTION}/points?wait=true`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ points }),
  })
  return res.ok
}

export async function search(query: string, limit: number): Promise<{ text: string; source: string; score: number }[]> {
  if (!config) return []
  const vector = await config.embed(query)
  if (vector.length === 0) return []
  const base = config.qdrantUrl.replace(/\/$/, "")
  const res = await fetch(`${base}/collections/${COLLECTION}/points/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vector, limit, with_payload: true }),
  })
  if (!res.ok) return []
  const data = (await res.json()) as { result?: { id: unknown; score?: number; payload?: { text?: string; source?: string } }[] }
  return (data.result ?? []).map((r) => ({
    text: r.payload?.text ?? "",
    source: r.payload?.source ?? "",
    score: r.score ?? 0,
  }))
}

/** Chunk text by paragraphs/sections (max length, overlap 0). */
export function chunkText(text: string, maxChunkLen = 800, source: string): { id: string; text: string; source: string }[] {
  const chunks: { id: string; text: string; source: string }[] = []
  const lines = text.split(/\n+/)
  let current = ""
  let index = 0
  for (const line of lines) {
    if (current.length + line.length + 1 > maxChunkLen && current.length > 0) {
      chunks.push({ id: `${source}:${index++}`, text: current.trim(), source })
      current = ""
    }
    current += (current ? "\n" : "") + line
  }
  if (current.trim()) chunks.push({ id: `${source}:${index}`, text: current.trim(), source })
  return chunks
}
