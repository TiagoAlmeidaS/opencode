import { ulid } from "ulid"
import { eq, and } from "drizzle-orm"
import { oppOpportunities, oppSubmissions } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"

interface GenerateGitcoinProposalInput {
  opportunity_id: string
}

const SYSTEM = `Você é um especialista em propostas técnicas para plataformas de bounty como Gitcoin.
Escreva propostas convincentes em inglês, com foco em ROI, competência técnica e entrega clara.`

function buildProposalPrompt(opp: {
  title: string
  description: string | null
  rewardMax: number | null
  rewardMin: number | null
  difficulty: string | null
  skillsRequired: string | null
}): string {
  const reward = opp.rewardMax ?? opp.rewardMin ?? 0
  const skills = opp.skillsRequired
    ? (() => { try { return (JSON.parse(opp.skillsRequired!) as string[]).join(", ") } catch { return opp.skillsRequired } })()
    : "not specified"

  return `Write a compelling Gitcoin bounty proposal for this opportunity:

OPPORTUNITY: ${opp.title}
REWARD: $${reward} USD
DIFFICULTY: ${opp.difficulty ?? "unknown"}
SKILLS: ${skills}

DESCRIPTION:
${(opp.description ?? "No description").slice(0, 1500)}

Write a professional proposal (300-500 words) with these sections:
1. **Introduction** — Who I am and why I'm the right fit
2. **Technical Approach** — How I'll implement the solution (specific steps)
3. **Timeline** — Realistic delivery schedule with milestones
4. **ROI Analysis** — Value delivered vs. cost, long-term benefits
5. **Deliverables** — Concrete list of what will be delivered

Be specific, confident, and results-oriented. Use the first person.`
}

export const generateGitcoinProposalActivity: Activity = {
  type: "generate-gitcoin-proposal",
  displayName: "Generate Gitcoin Proposal",
  description: "Gera proposta textual com análise de ROI para Gitcoin — fica em pending-approval no painel",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as GenerateGitcoinProposalInput
    if (!input.opportunity_id) throw new Error("opportunity_id é obrigatório")

    const [opp] = await ctx.db
      .select()
      .from(oppOpportunities)
      .where(eq(oppOpportunities.id, input.opportunity_id))
      .limit(1)

    if (!opp) throw new Error(`Oportunidade não encontrada: ${input.opportunity_id}`)

    const now = Math.floor(Date.now() / 1000)

    // Dedup: já existe proposta pending ou submetida?
    const [existing] = await ctx.db
      .select({ id: oppSubmissions.id, status: oppSubmissions.status })
      .from(oppSubmissions)
      .where(
        and(
          eq(oppSubmissions.opportunityId, opp.id),
          eq(oppSubmissions.platform, "gitcoin"),
        ),
      )
      .limit(1)

    if (existing && ["pending-approval", "submitted", "accepted"].includes(existing.status)) {
      return {
        summary: `Proposta Gitcoin já existe (status: ${existing.status})`,
        extra: { skipped: true, submission_id: existing.id },
      }
    }

    // Gera texto da proposta
    let proposalText: string
    if (ctx.memoryLlm) {
      proposalText = await ctx.memoryLlm({
        system: SYSTEM,
        prompt: buildProposalPrompt(opp),
        maxTokens: 800,
      })
    } else {
      const reward = opp.rewardMax ?? opp.rewardMin ?? 0
      proposalText = `# Proposal: ${opp.title}

## Introduction
I am an autonomous AI agent specialized in software development, ready to deliver high-quality solutions for this bounty.

## Technical Approach
I will analyze the requirements, implement a clean solution following best practices, and deliver comprehensive documentation.

## Timeline
- Day 1-2: Requirements analysis and design
- Day 3-5: Implementation
- Day 6-7: Testing and documentation

## ROI Analysis
Estimated value delivery: $${(reward * 3).toFixed(0)} in equivalent consulting value for $${reward} bounty cost.

## Deliverables
- Complete implementation meeting all requirements
- Tests and documentation
- Clean, maintainable code`
    }

    // Salva como pending-approval
    const submissionId = ulid()
    await ctx.db.insert(oppSubmissions).values({
      id: submissionId,
      opportunityId: opp.id,
      platform: "gitcoin",
      submissionType: "gitcoin-bid",
      status: "pending-approval",
      proposalText,
      externalUrl: opp.url,
      triggeredBy: ctx.queueItemId,
      createdAt: now,
      updatedAt: now,
    })

    // Notifica Telegram se configurado
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    const chatId = process.env.TELEGRAM_CHAT_ID
    if (botToken && chatId) {
      const reward = opp.rewardMax ?? opp.rewardMin ?? 0
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: `📋 <b>Proposta Gitcoin aguardando aprovação</b>\n\n📌 ${opp.title}\n💰 $${reward}\n\nAcesse o painel → aba Submissions para aprovar e submeter.`,
          parse_mode: "HTML",
        }),
      }).catch(() => {})
    }

    return {
      summary: `Proposta gerada para "${opp.title}" — aguardando aprovação no painel`,
      extra: { submission_id: submissionId, status: "pending-approval" },
    }
  },
}
