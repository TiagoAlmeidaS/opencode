import { eq } from "drizzle-orm"
import type { Activity, ActivityContext } from "../types"
import { repoIssueJobs } from "../schema"

export const analyzeFailureActivity: Activity = {
  type: "analyze-failure",
  displayName: "Analyze Failure",
  description: "Uses LLM to analyze why a dev-cycle step failed and suggest a fix.",

  async execute(ctx: ActivityContext) {
    const input = ctx.input as {
      repo_issue_job_id: string
      failed_step: string
      error_message: string
      cli_output?: string
    }

    const { repo_issue_job_id, failed_step, error_message, cli_output } = input

    const [job] = await ctx.db
      .select()
      .from(repoIssueJobs)
      .where(eq(repoIssueJobs.id, repo_issue_job_id))
      .limit(1)

    if (!job) {
      return { summary: "Job not found", extra: { repo_issue_job_id } }
    }

    let suggestion = ""

    if (ctx.memoryLlm) {
      await ctx.updateProgress?.("Analisando falha com LLM...")
      try {
        suggestion = await ctx.memoryLlm({
          system:
            "You are a software engineering assistant analyzing why an automated PR pipeline failed. Be concise and actionable.",
          prompt: [
            `## Pipeline Failure Analysis`,
            ``,
            `**Repository:** ${job.repoFullName}`,
            `**Issue #${job.issueNumber}:** ${job.issueTitle}`,
            `**Failed step:** ${failed_step}`,
            `**Error:** ${error_message}`,
            cli_output
              ? `\n**CLI output (last 2000 chars):**\n\`\`\`\n${cli_output.slice(-2000)}\n\`\`\``
              : "",
            ``,
            `Provide:`,
            `1. Root cause (1-2 sentences)`,
            `2. Suggested fix or next action`,
            `3. Should this be retried automatically? (yes/no + why)`,
          ].join("\n"),
          maxTokens: 512,
        })
      } catch (err) {
        console.error("[analyze-failure] LLM error:", err)
        suggestion = `LLM analysis failed: ${err instanceof Error ? err.message : String(err)}`
      }
    } else {
      suggestion = `Step '${failed_step}' failed: ${error_message}`
    }

    return {
      summary: `Failure analyzed: ${failed_step}`,
      extra: { suggestion, failed_step, repo_issue_job_id },
    }
  },
}
