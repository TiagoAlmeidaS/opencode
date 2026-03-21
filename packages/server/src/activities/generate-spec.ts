import { eq } from "drizzle-orm"
import { repoIssueJobs } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"

interface Input {
  repo_issue_job_id: string
}

const SYS = `You write structured implementation specs as JSON only. No markdown fences.`

export const generateSpecActivity: Activity = {
  type: "generate-spec",
  displayName: "Generate Spec",
  description: "LLM → spec JSON (issue or opportunity job)",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as Input
    if (!input.repo_issue_job_id) throw new Error("repo_issue_job_id é obrigatório")
    if (!ctx.memoryLlm) throw new Error("memoryLlm indisponível")

    const [row] = await ctx.db
      .select()
      .from(repoIssueJobs)
      .where(eq(repoIssueJobs.id, input.repo_issue_job_id))
      .limit(1)
    if (!row) throw new Error(`repo_issue_jobs não encontrado: ${input.repo_issue_job_id}`)

    const now = Math.floor(Date.now() / 1000)
    const prompt = `Título: ${row.issueTitle}
Repo: ${row.repoFullName}
${row.issueNumber != null ? `Issue GitHub: #${row.issueNumber}` : "Sem issue (repo direto)"}
Corpo/descrição:
${(row.issueBody ?? "").slice(0, 4000)}

Gere JSON com:
{
  "title": "string",
  "goal": "string",
  "scope": "string",
  "acceptance_criteria": ["string"],
  "technical_approach": "string",
  "files_to_touch": ["path"],
  "test_scenarios": [
    { "type": "unit"|"integration", "description": "string", "file": "path" }
  ]
}`

    const llm = ctx.llmRouter
      ? (opts: import("../types").MemoryLlmOptions) => ctx.llmRouter!.call("spec", opts)
      : ctx.memoryLlm
    if (!llm) throw new Error("Nenhum LLM configurado para generate-spec")
    const raw = await llm({ system: SYS, prompt, maxTokens: 2048 })
    const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
    let spec: string
    try {
      JSON.parse(clean)
      spec = clean
    } catch {
      spec = JSON.stringify({
        title: row.issueTitle,
        goal: row.issueTitle,
        scope: "Implementação conforme descrição",
        acceptance_criteria: ["Comportamento correto coberto por testes"],
        technical_approach: "Seguir convenções do repositório",
        files_to_touch: [],
        test_scenarios: [
          { type: "unit", description: "Core logic", file: "src/__tests__/feature.test.ts" },
        ],
      })
    }

    await ctx.db
      .update(repoIssueJobs)
      .set({ specJson: spec, status: "spec", updatedAt: now })
      .where(eq(repoIssueJobs.id, row.id))

    return { summary: "Spec gerada", extra: { repo_issue_job_id: row.id } }
  },
}
