import { eq } from "drizzle-orm"
import { repoIssueJobs } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"

interface Input {
  repo_issue_job_id: string
}

type Scenario = { type: string; description: string; file: string }

const SYS = `You write test file contents only. Output JSON: {"path":"relative/path","content":"full file source"}. No markdown.`

export const generateTddTestsActivity: Activity = {
  type: "generate-tdd-tests",
  displayName: "Generate TDD Tests",
  description: "LLM → arquivos de teste a partir da spec",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as Input
    if (!input.repo_issue_job_id) throw new Error("repo_issue_job_id é obrigatório")
    if (!ctx.memoryLlm) throw new Error("memoryLlm indisponível")

    const [row] = await ctx.db
      .select()
      .from(repoIssueJobs)
      .where(eq(repoIssueJobs.id, input.repo_issue_job_id))
      .limit(1)
    if (!row?.specJson) throw new Error("spec_json ausente — rode generate-spec antes")

    const spec = JSON.parse(row.specJson) as {
      test_scenarios?: Scenario[]
      title?: string
    }
    const scenarios = spec.test_scenarios ?? []
    const now = Math.floor(Date.now() / 1000)
    const files: { path: string; content: string }[] = []

    for (const s of scenarios.slice(0, 12)) {
      const prompt = `Spec: ${row.specJson!.slice(0, 2500)}
Cenário (${s.type}): ${s.description}
Arquivo alvo: ${s.file}

Gere testes que FALHAM até a implementação existir (TDD red). Use asserts claros.
JSON único: {"path":"${s.file}","content":"..."} `
      const raw = await ctx.memoryLlm({ system: SYS, prompt, maxTokens: 4096 })
      const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
      try {
        const one = JSON.parse(clean) as { path: string; content: string }
        if (one.path && one.content) files.push({ path: one.path, content: one.content })
      } catch {
        files.push({
          path: s.file,
          content: `// TODO: ${s.description}\nimport { describe, it, expect } from "vitest"\n\ndescribe("${spec.title ?? "feature"}", () => {\n  it("pending", () => { expect(true).toBe(false) })\n})\n`,
        })
      }
    }

    if (files.length === 0) {
      files.push({
        path: "src/__tests__/agent-generated.test.ts",
        content: `import { describe, it, expect } from "vitest"\ndescribe("agent", () => { it("fails until implemented", () => expect(1).toBe(2)) })\n`,
      })
    }

    await ctx.db
      .update(repoIssueJobs)
      .set({
        testFiles: JSON.stringify(files),
        status: "tests",
        updatedAt: now,
      })
      .where(eq(repoIssueJobs.id, row.id))

    return { summary: `${files.length} arquivo(s) de teste`, extra: { count: files.length } }
  },
}
