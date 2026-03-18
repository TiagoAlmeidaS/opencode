import { eq } from "drizzle-orm"
import { oppOpportunities } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"

interface ClassifyWorkspaceInput {
  opportunity_id: string
}

const SYSTEM = `Você é um arquiteto de software especialista em estratégias de desenvolvimento.
Responda APENAS com JSON válido, sem markdown.`

function buildPrompt(opp: { type: string; title: string; description: string | null; url: string | null }): string {
  return `Analise esta oportunidade e determine a melhor estratégia de workspace:

Tipo: ${opp.type}
Título: ${opp.title}
URL: ${opp.url ?? "N/A"}
Descrição: ${(opp.description ?? "").slice(0, 600)}

Estratégias disponíveis:
- "fork-temp": Oportunidade requer PR em repo existente (bug fix, issue específica, contribuição pontual). Workspace temporário, descartado após submissão.
- "dedicated-repo": Oportunidade requer criar algo novo reutilizável (library, tool, CLI, SDK, template, SaaS). Vale criar um repo próprio que pode ser submetido para múltiplas oportunidades similares.
- "extend-repo": Similar a dedicated-repo já existente no mesmo niche — deve reutilizar/estender o existente.

Retorne JSON:
{
  "strategy": "fork-temp" | "dedicated-repo" | "extend-repo",
  "reasoning": "explicação em 1 frase",
  "suggested_repo_name": "nome-kebab-case se dedicated-repo, null caso contrário",
  "reusability_score": 0..10
}`
}

/** Heurística rápida sem LLM */
function heuristicStrategy(opp: { type: string; title: string; url: string | null }): "fork-temp" | "dedicated-repo" {
  const title = opp.title.toLowerCase()
  const url = (opp.url ?? "").toLowerCase()

  // GitHub issue URL → sempre fork-temp
  if (url.includes("github.com") && url.includes("/issues/")) return "fork-temp"

  // Keywords de contribuição pontual
  const tempSignals = ["fix", "bug", "issue", "patch", "typo", "error", "broken", "failing", "crash", "update docs", "improve docs"]
  if (tempSignals.some((k) => title.includes(k))) return "fork-temp"

  // Keywords de produto reutilizável
  const dedicatedSignals = ["build", "create", "develop", "implement", "design", "library", "package", "tool", "cli", "sdk", "framework", "plugin", "extension", "integration", "service", "saas", "dashboard", "api", "bot"]
  if (dedicatedSignals.some((k) => title.includes(k))) return "dedicated-repo"

  // Default: fork-temp é mais seguro
  return "fork-temp"
}

export const classifyWorkspaceStrategyActivity: Activity = {
  type: "classify-workspace-strategy",
  displayName: "Classify Workspace Strategy",
  description: "Determina se a oportunidade usa fork temporário ou repo dedicado reutilizável",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as ClassifyWorkspaceInput
    if (!input.opportunity_id) throw new Error("opportunity_id é obrigatório")

    const [opp] = await ctx.db
      .select()
      .from(oppOpportunities)
      .where(eq(oppOpportunities.id, input.opportunity_id))
      .limit(1)

    if (!opp) throw new Error(`Oportunidade não encontrada: ${input.opportunity_id}`)

    // Já classificada
    if (opp.workspaceStrategy) {
      return {
        summary: `Estratégia já definida: ${opp.workspaceStrategy}`,
        extra: { strategy: opp.workspaceStrategy, skipped: true },
      }
    }

    const now = Math.floor(Date.now() / 1000)
    let strategy: string
    let suggestedRepoName: string | null = null

    if (ctx.memoryLlm) {
      const raw = await ctx.memoryLlm({ system: SYSTEM, prompt: buildPrompt(opp), maxTokens: 256 })
      try {
        const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
        const result = JSON.parse(clean) as { strategy: string; suggested_repo_name: string | null }
        strategy = result.strategy
        suggestedRepoName = result.suggested_repo_name ?? null
      } catch {
        strategy = heuristicStrategy(opp)
      }
    } else {
      strategy = heuristicStrategy(opp)
    }

    await ctx.db
      .update(oppOpportunities)
      .set({ workspaceStrategy: strategy, updatedAt: now })
      .where(eq(oppOpportunities.id, opp.id))

    // Roteia para a próxima etapa conforme a estratégia
    if (strategy === "fork-temp") {
      await ctx.enqueue("submit-github-pr", { opportunity_id: opp.id }, { priority: 5 })
    } else if (strategy === "dedicated-repo") {
      await ctx.enqueue("create-dedicated-repo", {
        opportunity_id: opp.id,
        repo_name: suggestedRepoName,
      }, { priority: 4 })
    } else if (strategy === "extend-repo") {
      await ctx.enqueue("execute-opportunity", { opportunity_id: opp.id }, { priority: 5 })
    }

    return {
      summary: `Estratégia definida: ${strategy}${suggestedRepoName ? ` → repo: ${suggestedRepoName}` : ""}`,
      extra: { strategy, suggested_repo_name: suggestedRepoName },
    }
  },
}
