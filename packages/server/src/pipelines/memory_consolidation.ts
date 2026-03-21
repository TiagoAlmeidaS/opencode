/**
 * Memory pipeline — Phase 2: consolidate extractions into MEMORY.md, memory_summary.md, and skills.
 * Reads memory_extractions, optionally calls LLM to consolidate, writes to configurable output dir.
 */
import type { Pipeline } from "../types"
import { registerPipeline } from "../registry"
import { memoryExtractions, agentLearnings } from "../schema"
import { desc, gte } from "drizzle-orm"
import { mkdirSync, writeFileSync } from "fs"
import path from "path"

export interface MemoryConsolidationConfig {
  /** Directory to write MEMORY.md and memory_summary.md (required). */
  memory_output_dir: string
  /** Directory to write skills (default: memory_output_dir + "/skills"). Add to OpenCode config skills.paths to load. */
  skills_output_dir?: string
  /** Max extractions to include in consolidation (default 100). */
  max_extractions?: number
}

const CONSOLIDATION_SYSTEM = `You are a memory consolidation agent. You will receive a merged list of "raw memory" extractions from past coding sessions. Your task:

1. Produce MEMORY.md: A structured handbook with task groups and learnings. Use this format:
   - "# Task Group: <name>" and "scope: <short scope>"
   - "## Task N: <description>" with "### rollout_summary_files", "### keywords", "### learnings"
   - Be concise; use bullets; no invented facts.

2. Produce memory_summary.md: Two sections:
   - "## User Profile" (short, actionable snapshot)
   - "## General Tips" (bullet list of cross-session tips)
   - "## What's in Memory" (index of topics with keywords and short descriptions)

3. Optionally produce 0 or more skills. For each reusable procedure, output a skill block:
   ---skill: <skill-name>
   description: <one line>
   ---
   <SKILL.md body: when to use, steps, verification, pitfalls>

Output exactly and only in this order, with these delimiters (no other text):
---MEMORY.md---
<content>
---memory_summary.md---
<content>
---skill: <name>---
<optional skill 1>
---skill: <name>---
<optional skill 2>
---end---`

function buildConsolidationPrompt(
  extractions: { sessionId: string; rawMemory: string; sessionSummary: string }[],
  learnings: { category: string; key: string; title: string; body: string; confidence: number; usedCount: number; helpedCount: number }[],
): string {
  const parts = extractions.map(
    (e, i) =>
      `## Session ${i + 1} (id: ${e.sessionId})\nSummary: ${e.sessionSummary}\n\nRaw memory:\n${e.rawMemory}`
  )

  const learningsSection = learnings.length > 0
    ? `\n\n## Agent Learnings (from dev cycles — incorporate into MEMORY.md)\n${learnings
        .map((l) => {
          const eff = l.usedCount > 0 ? ` | effectiveness: ${Math.round((l.helpedCount / l.usedCount) * 100)}%` : ""
          return `- [${l.category}] **${l.title}** (conf=${l.confidence.toFixed(2)}${eff})\n  ${l.body.slice(0, 300)}`
        })
        .join("\n")}`
    : ""

  return `Consolidate these extractions into MEMORY.md, memory_summary.md, and optional skills.\n\n${parts.join("\n\n---\n\n")}${learningsSection}`
}

function parseConsolidationOutput(text: string): {
  memoryMd: string
  memorySummaryMd: string
  skills: { name: string; body: string }[]
} {
  const memoryMdMatch = text.match(/---MEMORY\.md---\s*([\s\S]*?)(?=---memory_summary\.md---|---skill:|---end---)/)
  const memorySummaryMatch = text.match(/---memory_summary\.md---\s*([\s\S]*?)(?=---skill:|---end---)/)
  const memoryMd = memoryMdMatch?.[1]?.trim() ?? "# Memory\n\nNo consolidated memory yet.\n"
  const memorySummaryMd = memorySummaryMatch?.[1]?.trim() ?? "# Memory Summary\n\nNo summary yet.\n"

  const skillBlocks = text.matchAll(/---skill:\s*([^\n-]+)---\s*([\s\S]*?)(?=---skill:|---end---)/g)
  const skills: { name: string; body: string }[] = []
  for (const m of skillBlocks) {
    const name = m[1].trim().replace(/[^a-z0-9-]/gi, "-").toLowerCase().replace(/-+/g, "-").slice(0, 64) || "skill"
    const body = m[2].trim()
    if (name && body) skills.push({ name, body })
  }
  return { memoryMd, memorySummaryMd, skills }
}

const memoryConsolidation: Pipeline = {
  strategy: "memory_consolidation",
  displayName: "Memory Consolidation (Phase 2)",
  async execute(ctx) {
    const config = ctx.config as unknown as MemoryConsolidationConfig
    const db = ctx.db
    const outputDir = config?.memory_output_dir
    if (!outputDir || !db) {
      return {
        contentType: "memory",
        platform: "local",
        title: "Memory consolidation skipped (no output_dir or db)",
        status: "draft",
      }
    }

    const maxExtractions = config?.max_extractions ?? 100
    const rows = await db
      .select({
        sessionId: memoryExtractions.sessionId,
        rawMemory: memoryExtractions.rawMemory,
        sessionSummary: memoryExtractions.sessionSummary,
      })
      .from(memoryExtractions)
      .orderBy(desc(memoryExtractions.sourceUpdatedAt))
      .limit(maxExtractions)

    // Fetch high-signal learnings from agent_learnings to enrich the consolidation
    const since90d = Math.floor(Date.now() / 1000) - 90 * 86400
    const topLearnings = await db
      .select({
        category: agentLearnings.category,
        key: agentLearnings.key,
        title: agentLearnings.title,
        body: agentLearnings.body,
        confidence: agentLearnings.confidence,
        usedCount: agentLearnings.usedCount,
        helpedCount: agentLearnings.helpedCount,
      })
      .from(agentLearnings)
      .where(gte(agentLearnings.updatedAt, since90d))
      .orderBy(desc(agentLearnings.confidence))
      .limit(40)

    if (rows.length === 0 && topLearnings.length === 0) {
      mkdirSync(outputDir, { recursive: true })
      writeFileSync(path.join(outputDir, "MEMORY.md"), "# Memory\n\nNo extractions yet. Run memory_extract first.\n", "utf-8")
      writeFileSync(
        path.join(outputDir, "memory_summary.md"),
        "# Memory Summary\n\nNo extractions yet.\n",
        "utf-8"
      )
      return {
        contentType: "memory",
        platform: "local",
        title: "Memory consolidation: no extractions",
        status: "draft",
      }
    }

    let memoryMd: string
    let memorySummaryMd: string
    let skills: { name: string; body: string }[] = []

    const memLlm = ctx.llmRouter
      ? (opts: import("../types").MemoryLlmOptions) => ctx.llmRouter!.call("memory", opts)
      : ctx.memoryLlm
    if (memLlm) {
      const prompt = buildConsolidationPrompt(rows, topLearnings)
      try {
        const out = await memLlm({
          prompt,
          system: CONSOLIDATION_SYSTEM,
          maxTokens: 8000,
        })
        const parsed = parseConsolidationOutput(out)
        memoryMd = parsed.memoryMd
        memorySummaryMd = parsed.memorySummaryMd
        skills = parsed.skills
      } catch (err) {
        memoryMd = `# Memory\n\nConsolidation failed: ${err instanceof Error ? err.message : String(err)}\n\nRaw extractions: ${rows.length} sessions.\n`
        memorySummaryMd = "# Memory Summary\n\nConsolidation failed.\n"
      }
    } else {
      memoryMd = "# Memory\n\n"
      for (const r of rows) {
        memoryMd += `## Session ${r.sessionId}\n\n${r.sessionSummary}\n\n${r.rawMemory.slice(0, 2000)}\n\n---\n\n`
      }
      memorySummaryMd = "# Memory Summary\n\nGeneral tips: run with memoryLlm for full consolidation.\n"
    }

    mkdirSync(outputDir, { recursive: true })
    writeFileSync(path.join(outputDir, "MEMORY.md"), memoryMd, "utf-8")
    writeFileSync(path.join(outputDir, "memory_summary.md"), memorySummaryMd, "utf-8")

    const skillsDir = config.skills_output_dir ?? path.join(outputDir, "skills")
    for (const sk of skills) {
      const skillDir = path.join(skillsDir, sk.name)
      mkdirSync(skillDir, { recursive: true })
      const frontmatter = `---
name: ${sk.name}
description: ${(sk.body.slice(0, 200).split("\n")[0] || sk.name).replace(/---/g, "")}
---

`
      writeFileSync(path.join(skillDir, "SKILL.md"), frontmatter + sk.body, "utf-8")
    }

    return {
      contentType: "memory",
      platform: "local",
      title: `Memory consolidation: ${rows.length} extractions, ${skills.length} skills`,
      status: "draft",
      extra: { extractions: rows.length, skills: skills.length },
    }
  },
}

registerPipeline(memoryConsolidation)
