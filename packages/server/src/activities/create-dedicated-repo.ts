import { eq } from "drizzle-orm"
import { Octokit } from "@octokit/rest"
import { oppOpportunities } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"

interface CreateDedicatedRepoInput {
  opportunity_id: string
  repo_name?: string        // se omitido, gera a partir do título
  description?: string
  private?: boolean         // default: false (público é melhor para portfólio)
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50)
    .replace(/^-|-$/g, "")
}

export const createDedicatedRepoActivity: Activity = {
  type: "create-dedicated-repo",
  displayName: "Create Dedicated Repo",
  description: "Cria repo GitHub dedicado para oportunidades reutilizáveis",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as CreateDedicatedRepoInput
    if (!input.opportunity_id) throw new Error("opportunity_id é obrigatório")

    const githubToken = process.env.GITHUB_TOKEN
    if (!githubToken) throw new Error("GITHUB_TOKEN não configurado")

    const [opp] = await ctx.db
      .select()
      .from(oppOpportunities)
      .where(eq(oppOpportunities.id, input.opportunity_id))
      .limit(1)

    if (!opp) throw new Error(`Oportunidade não encontrada: ${input.opportunity_id}`)

    // Já tem repo
    if (opp.workspaceRepoUrl) {
      return {
        summary: `Repo já existe: ${opp.workspaceRepoUrl}`,
        extra: { repo_url: opp.workspaceRepoUrl, skipped: true },
      }
    }

    const octokit = new Octokit({ auth: githubToken })

    // Resolve owner (usuário autenticado)
    const { data: user } = await octokit.users.getAuthenticated()
    const owner = user.login

    // Nome do repo: sugestão > gerado do título
    const repoName = input.repo_name ?? `opencode-${slugify(opp.title)}`

    // Verifica se já existe
    let repoUrl: string
    try {
      const { data: existing } = await octokit.repos.get({ owner, repo: repoName })
      repoUrl = existing.html_url
    } catch {
      // Cria novo repo
      const reward = opp.rewardMax ?? opp.rewardMin ?? 0
      const description =
        input.description ??
        `Autonomous solution for: ${opp.title}. Reward: $${reward} USD. Built by OpenCode agent.`

      const { data: created } = await octokit.repos.createForAuthenticatedUser({
        name: repoName,
        description: description.slice(0, 255),
        private: input.private ?? false,
        auto_init: true,     // cria com README
        gitignore_template: "Node",
        license_template: "mit",
      })

      repoUrl = created.html_url
    }

    // Atualiza oportunidade com URL do repo
    const now = Math.floor(Date.now() / 1000)
    await ctx.db
      .update(oppOpportunities)
      .set({ workspaceRepoUrl: repoUrl, updatedAt: now })
      .where(eq(oppOpportunities.id, opp.id))

    return {
      summary: `Repo criado: ${repoUrl}`,
      extra: { repo_url: repoUrl, repo_name: repoName, owner },
    }
  },
}
