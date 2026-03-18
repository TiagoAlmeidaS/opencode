import { eq } from "drizzle-orm"
import { repoIssueJobs } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"

interface Input {
  repo_issue_job_id: string
}

const SYS = `You write technical Markdown documentation. No JSON.`

export const generateDocsActivity: Activity = {
  type: "generate-docs",
  displayName: "Generate Docs",
  description: "LLM → Markdown (Overview, API, Usage, Tests)",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as Input
    if (!input.repo_issue_job_id) throw new Error("repo_issue_job_id é obrigatório")
    if (!ctx.memoryLlm) throw new Error("memoryLlm indisponível")

    const [row] = await ctx.db
      .select()
      .from(repoIssueJobs)
      .where(eq(repoIssueJobs.id, input.repo_issue_job_id))
      .limit(1)
    if (!row?.specJson) throw new Error("spec ausente")

    const prompt = `Com base na spec e título abaixo, gere documentação Markdown com seções:
## Overview
## API / Interface
## Usage Examples
## Test Coverage

Spec:
${row.specJson.slice(0, 5000)}

Título: ${row.issueTitle}
Repo: ${row.repoFullName}`

    const md = await ctx.memoryLlm({ system: SYS, prompt, maxTokens: 3072 })
    const now = Math.floor(Date.now() / 1000)
    await ctx.db
      .update(repoIssueJobs)
      .set({ docsMarkdown: md.trim(), status: "docs", updatedAt: now })
      .where(eq(repoIssueJobs.id, row.id))

    return { summary: "Docs geradas", extra: { len: md.length } }
  },
}
