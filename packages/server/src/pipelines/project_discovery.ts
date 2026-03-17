/**
 * Project Discovery pipeline: process pending discovery_reports with LLM and persist report_md.
 */
import type { Pipeline } from "../types"
import { registerPipeline } from "../registry"
import { discoveryReports, projectSpecs } from "../schema"
import { eq, asc } from "drizzle-orm"
import { compileSpecToPrompt } from "../spec-compiler"

const DISCOVERY_SYSTEM = `You are performing a Project Discovery analysis. Produce a structured Markdown report that validates the project or venture idea.

Output a single Markdown document with these section headers and content. Be concise but complete. If information is missing, state assumptions clearly.

1. ## Resumo e escopo — Paraphrase the idea in 2–4 sentences and state the scope.
2. ## Funcionalidades — List possible features, ordered or prioritized (must / should / could).
3. ## Limitações e dependências — Technical, business, or resource constraints; external dependencies.
4. ## Dados — What data the project needs; possible sources and expected quality.
5. ## ROI (ordem de grandeza) — Cost and revenue assumptions; order of magnitude and uncertainties.
6. ## Riscos — Technical, market, and operational risks; brief mitigation per risk.
7. ## Viabilidade — Conclusion: **viável** / **condicional** / **inviável** with a short reason.
8. ## MVP — Minimal scope to validate the idea (features and success metrics).
9. ## Estrutura de projeto — Suggested stack, implementation phases, effort estimate (days/weeks).
10. ## Relatório final — Executive summary, recommendation (proceed / adjust scope / do not proceed), next steps.

Output Markdown only. Use ## for main sections. No meta-commentary outside the report.`

export interface ProjectDiscoveryConfig {
  max_per_run?: number
}

const projectDiscovery: Pipeline = {
  strategy: "project_discovery",
  displayName: "Project Discovery",
  async execute(ctx) {
    const config = ctx.config as ProjectDiscoveryConfig
    const db = ctx.db
    if (!db) {
      return {
        contentType: "discovery",
        platform: "local",
        title: "Project discovery skipped (no db)",
        status: "draft",
      }
    }

    const maxPerRun = config?.max_per_run ?? 10
    const pending = await db
      .select()
      .from(discoveryReports)
      .where(eq(discoveryReports.status, "pending"))
      .orderBy(asc(discoveryReports.created_at))
      .limit(maxPerRun)

    if (pending.length === 0) {
      return {
        contentType: "discovery",
        platform: "local",
        title: "Project discovery: no pending reports",
        status: "draft",
      }
    }

    if (!ctx.memoryLlm) {
      return {
        contentType: "discovery",
        platform: "local",
        title: "Project discovery skipped (no LLM); pending count: " + pending.length,
        status: "draft",
      }
    }

    const now = Math.floor(Date.now() / 1000)
    let done = 0
    let failed = 0

    for (const row of pending) {
      try {
        let specFragment = ""
        if (row.report_json) {
          try {
            const meta = JSON.parse(row.report_json) as { spec_id?: string }
            if (meta.spec_id) {
              const [spec] = await db.select().from(projectSpecs).where(eq(projectSpecs.id, meta.spec_id))
              if (spec) specFragment = compileSpecToPrompt(spec) + "\n\n---\n\n"
            }
          } catch { /* malformed report_json — skip */ }
        }

        const reportMd = await ctx.memoryLlm({
          prompt: `Analyze the following project/venture idea and produce the structured discovery report.\n\nIdea:\n${row.idea_text}`,
          system: specFragment + DISCOVERY_SYSTEM,
          maxTokens: 4000,
        })
        await db
          .update(discoveryReports)
          .set({
            status: "done",
            report_md: reportMd.trim(),
            updated_at: now,
            job_id: ctx.jobId,
          })
          .where(eq(discoveryReports.id, row.id))
        done++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await db
          .update(discoveryReports)
          .set({
            status: "failed",
            report_md: `[Discovery failed: ${msg}]`,
            updated_at: now,
            job_id: ctx.jobId,
          })
          .where(eq(discoveryReports.id, row.id))
        failed++
      }
    }

    return {
      contentType: "discovery",
      platform: "local",
      title: `Project discovery: ${done} done, ${failed} failed`,
      status: "draft",
      extra: { done, failed, total: pending.length },
    }
  },
}

registerPipeline(projectDiscovery)
