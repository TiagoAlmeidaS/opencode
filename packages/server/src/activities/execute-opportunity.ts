/**
 * Activity: execute-opportunity
 * Usa o OpenCode CLI (subprocess) para tentar executar/implementar uma oportunidade.
 * Atualiza o status da oportunidade para 'applied' ao iniciar e 'won'/'ignored' ao final.
 */
import { eq } from "drizzle-orm"
import { oppOpportunities } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"

interface ExecuteOpportunityInput {
  opportunity_id: string
  cwd?: string           // diretório de trabalho (default: process.cwd())
  dry_run?: boolean      // se true, apenas loga sem executar
}

export const executeOpportunityActivity: Activity = {
  type: "execute-opportunity",
  displayName: "Execute Opportunity",
  description: "Executa uma oportunidade via OpenCode CLI como subprocess",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as ExecuteOpportunityInput
    if (!input.opportunity_id) throw new Error("opportunity_id é obrigatório")

    const [opp] = await ctx.db
      .select()
      .from(oppOpportunities)
      .where(eq(oppOpportunities.id, input.opportunity_id))
      .limit(1)

    if (!opp) throw new Error(`Oportunidade não encontrada: ${input.opportunity_id}`)

    const now = Math.floor(Date.now() / 1000)
    const cwd = input.cwd ?? process.cwd()

    // Marca como 'applied' imediatamente
    await ctx.db
      .update(oppOpportunities)
      .set({ status: "applied", updatedAt: now })
      .where(eq(oppOpportunities.id, opp.id))

    if (input.dry_run) {
      return {
        summary: `[dry-run] Oportunidade "${opp.title}" marcada como aplicada`,
        extra: { dry_run: true, opportunity_id: opp.id },
      }
    }

    const task = buildTask(opp)

    try {
      const output = await ctx.spawnOpenCode(task, cwd)

      // Sucesso → marca como 'won'
      await ctx.db
        .update(oppOpportunities)
        .set({ status: "won", updatedAt: Math.floor(Date.now() / 1000) })
        .where(eq(oppOpportunities.id, opp.id))

      return {
        summary: `Oportunidade "${opp.title}" executada com sucesso`,
        extra: {
          opportunity_id: opp.id,
          output_preview: output.slice(0, 500),
        },
      }
    } catch (err) {
      // Falha → volta para 'shortlisted' para re-tentativa
      await ctx.db
        .update(oppOpportunities)
        .set({ status: "shortlisted", updatedAt: Math.floor(Date.now() / 1000) })
        .where(eq(oppOpportunities.id, opp.id))

      throw err
    }
  },
}

function buildTask(opp: {
  type: string
  title: string
  description: string | null
  url: string | null
  skillsRequired: string | null
  rewardMax: number | null
  rewardMin: number | null
  difficulty: string | null
}): string {
  const skills = opp.skillsRequired
    ? (() => { try { return (JSON.parse(opp.skillsRequired) as string[]).join(", ") } catch { return opp.skillsRequired } })()
    : "not specified"

  const reward = opp.rewardMax ?? opp.rewardMin ?? 0

  return `You are an autonomous agent working on a revenue opportunity.

OPPORTUNITY:
Type: ${opp.type}
Title: ${opp.title}
URL: ${opp.url ?? "N/A"}
Reward: $${reward} USD
Difficulty: ${opp.difficulty ?? "unknown"}
Skills required: ${skills}

DESCRIPTION:
${(opp.description ?? "No description provided.").slice(0, 2000)}

TASK:
Analyze this opportunity and implement a solution or proposal. Follow these steps:
1. Read and understand the requirements
2. Plan your approach
3. Implement the solution (code, PR, proposal, etc.)
4. Verify your work meets the requirements
5. Output a summary of what was done

Be thorough but focused. Prioritize working, submittable output.`
}
