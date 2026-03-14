/**
 * Memory pipeline — RAG index: chunk MEMORY.md, memory_summary.md, and skills, then upsert to Qdrant.
 * Requires OPENCODE_QDRANT_URL and embed (memoryEmbed) to be configured on the server.
 */
import type { Pipeline } from "../types"
import { registerPipeline } from "../registry"
import { getRagConfig, addChunks, chunkText } from "../memory/rag"
import { readFileSync, readdirSync, existsSync } from "fs"
import path from "path"

export interface MemoryRagIndexConfig {
  /** Directory containing MEMORY.md, memory_summary.md, and optionally skills/ (same as memory_consolidation output). */
  memory_output_dir: string
  /** Max chunk length in characters (default 800). */
  max_chunk_len?: number
}

const memoryRagIndex: Pipeline = {
  strategy: "memory_rag_index",
  displayName: "Memory RAG Index",
  async execute(ctx) {
    const config = ctx.config as unknown as MemoryRagIndexConfig
    const outputDir = config?.memory_output_dir
    const rag = getRagConfig()
    if (!outputDir || !rag) {
      return {
        contentType: "memory",
        platform: "local",
        title: "RAG index skipped (no memory_output_dir or Qdrant/embed not configured)",
        status: "draft",
      }
    }

    const maxChunkLen = config?.max_chunk_len ?? 800
    const chunks: { id: string; text: string; source: string }[] = []

    const memoryPath = path.join(outputDir, "MEMORY.md")
    if (existsSync(memoryPath)) {
      const text = readFileSync(memoryPath, "utf-8")
      chunks.push(...chunkText(text, maxChunkLen, "MEMORY.md"))
    }
    const summaryPath = path.join(outputDir, "memory_summary.md")
    if (existsSync(summaryPath)) {
      const text = readFileSync(summaryPath, "utf-8")
      chunks.push(...chunkText(text, maxChunkLen, "memory_summary.md"))
    }
    const skillsDir = path.join(outputDir, "skills")
    if (existsSync(skillsDir)) {
      const dirs = readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory())
      for (const d of dirs) {
        const skillPath = path.join(skillsDir, d.name, "SKILL.md")
        if (existsSync(skillPath)) {
          const text = readFileSync(skillPath, "utf-8")
          chunks.push(...chunkText(text, maxChunkLen, `skills/${d.name}/SKILL.md`))
        }
      }
    }

    if (chunks.length === 0) {
      return {
        contentType: "memory",
        platform: "local",
        title: "RAG index: no content to index",
        status: "draft",
      }
    }

    const ok = await addChunks(chunks.map((c) => ({ ...c, id: c.id.replace(/[^a-z0-9_-]/gi, "_") })))
    return {
      contentType: "memory",
      platform: "local",
      title: `RAG index: ${ok ? chunks.length : 0} chunks`,
      status: "draft",
      extra: { chunks: chunks.length, ok },
    }
  },
}

registerPipeline(memoryRagIndex)
