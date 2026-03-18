import { eq, and, lt } from "drizzle-orm"
import { Octokit } from "@octokit/rest"
import { agentLearnings } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"

interface CreateSkillGapIssueInput {
  skill_name: string
  opportunity_id: string
  opportunity_title?: string
}

export const createSkillGapIssueActivity: Activity = {
  type: "create-skill-gap-issue",
  displayName: "Create Skill Gap Issue",
  description: "Cria GitHub Issue para rastrear skill gaps detectados pelo agente",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as CreateSkillGapIssueInput
    if (!input.skill_name || !input.opportunity_id) throw new Error("skill_name e opportunity_id são obrigatórios")

    const skillGapRepo = process.env.OPENCODE_SKILL_GAP_REPO
    if (!skillGapRepo) {
      return { summary: `OPENCODE_SKILL_GAP_REPO não configurado — issue não criada para skill "${input.skill_name}"` }
    }

    const parts = skillGapRepo.split("/")
    if (parts.length !== 2) throw new Error(`OPENCODE_SKILL_GAP_REPO deve ter formato "owner/repo", recebido: "${skillGapRepo}"`)
    const [owner, repo] = parts

    const token = process.env.GITHUB_TOKEN
    if (!token) throw new Error("GITHUB_TOKEN não configurado")

    const octokit = new Octokit({ auth: token })
    const skillLower = input.skill_name.toLowerCase()

    // Dedup: verifica se já existe issue aberta com esse skill
    const { data: search } = await octokit.search.issuesAndPullRequests({
      q: `repo:${owner}/${repo} label:skill-gap is:issue "${input.skill_name}" in:title`,
      per_page: 1,
    })
    if (search.total_count > 0) {
      return {
        summary: `Issue para skill gap "${input.skill_name}" já existe: ${search.items[0].html_url}`,
        extra: { skipped: true, existing_url: search.items[0].html_url },
      }
    }

    // Busca learning entry para enriquecer o body
    const learnings = await ctx.db
      .select()
      .from(agentLearnings)
      .where(and(eq(agentLearnings.category, "skill"), lt(agentLearnings.confidence, 0.4)))

    const matched = learnings.find((l) => {
      const tags: string[] = l.tags ? (JSON.parse(l.tags) as string[]) : []
      return l.title.toLowerCase().includes(skillLower) || tags.some((t) => t.toLowerCase() === skillLower)
    })

    // Cria label skill-gap se não existir
    try {
      await octokit.issues.createLabel({ owner, repo, name: "skill-gap", color: "e4e669", description: "Skill gaps detectados pelo agente autônomo" })
    } catch (err) {
      if ((err as { status?: number }).status !== 422) console.warn(`[create-skill-gap-issue] createLabel:`, err)
    }

    // Monta body
    const learningSection = matched
      ? `## Dados do Agent Learning\n\n- **Insight**: ${matched.body}\n- **Confiança**: ${(matched.confidence * 100).toFixed(0)}%\n- **Sinais negativos**: ${matched.negativeCount} | **Positivos**: ${matched.positiveCount}`
      : `## Dados do Agent Learning\n\nNenhum registro de learning encontrado ainda. Primeiro gap detectado.`

    const body = `## Skill Gap Detectado: \`${input.skill_name}\`

O agente autônomo (OpenCode) detectou que não tem capacidade suficiente em **${input.skill_name}** ao avaliar oportunidades.

## Oportunidade que Disparou o Alerta

> ${input.opportunity_title ?? input.opportunity_id}

${learningSection}

## Ações Recomendadas

- [ ] Adicionar exemplos de treinamento ou specs para \`${input.skill_name}\`
- [ ] Revisar rejeições anteriores relacionadas a essa skill
- [ ] Considerar adicionar constraint em \`projectSpecs\` para este domínio

---
*Gerado automaticamente pelo daemon OpenCode — activity classify-niche*`

    const { data: issue } = await octokit.issues.create({
      owner,
      repo,
      title: `[skill-gap] ${input.skill_name} — capacidade insuficiente do agente`,
      body,
      labels: ["skill-gap"],
    })

    return {
      summary: `Issue criada para skill gap "${input.skill_name}": ${issue.html_url}`,
      extra: { issue_number: issue.number, issue_url: issue.html_url, skill: input.skill_name },
    }
  },
}
