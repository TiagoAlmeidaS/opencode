import { ulid } from "ulid"
import { eq, and } from "drizzle-orm"
import { oppOpportunities, oppSubmissions } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"
import { getBountyWalletSnippet } from "../financial-config"

interface SendFreelanceEmailInput {
  opportunity_id: string
  recipient_email?: string   // override — se omitido, tenta extrair da descrição
  recipient_name?: string
}

const SYSTEM = `Você é um especialista em propostas de freelance para agentes de IA autônomos.
Escreva emails de proposta profissionais em inglês, diretos e persuasivos.`

function buildEmailPrompt(
  opp: {
    title: string
    description: string | null
    rewardMax: number | null
    rewardMin: number | null
    sourcePlatform: string
    skillsRequired: string | null
  },
  recipientName: string,
  walletSnippet: string,
): string {
  const reward = opp.rewardMax ?? opp.rewardMin ?? 0
  const skills = opp.skillsRequired
    ? (() => { try { return (JSON.parse(opp.skillsRequired!) as string[]).join(", ") } catch { return opp.skillsRequired } })()
    : "not specified"

  return `Write a professional freelance proposal email for this job posting:

JOB: ${opp.title}
PLATFORM: ${opp.sourcePlatform}
BUDGET: $${reward}
SKILLS: ${skills}
RECIPIENT: ${recipientName || "Hiring Manager"}

DESCRIPTION:
${(opp.description ?? "No description").slice(0, 1200)}

Write a compelling email (200-350 words) with:
- Subject line (first line, prefixed with "Subject: ")
- Professional greeting
- Brief introduction and fit for the role
- Specific technical approach (2-3 bullet points)
- Estimated timeline and deliverables
- ROI: value they get vs. cost
- Clear call-to-action
- Professional closing
${walletSnippet ? `- Include payment address for receiving bounty: ${walletSnippet}` : ""}

Be confident, specific, and human. Avoid AI clichés.`
}

async function sendViaSendGrid(
  apiKey: string,
  to: string,
  fromEmail: string,
  subject: string,
  body: string,
): Promise<void> {
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: fromEmail, name: "OpenCode Agent" },
      subject,
      content: [{ type: "text/plain", value: body }],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`SendGrid API ${res.status}: ${err.slice(0, 300)}`)
  }
}

export const sendFreelanceEmailActivity: Activity = {
  type: "send-freelance-email",
  displayName: "Send Freelance Email",
  description: "Gera proposta via LLM e envia email pelo SendGrid + gera relatório",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as SendFreelanceEmailInput
    if (!input.opportunity_id) throw new Error("opportunity_id é obrigatório")

    const sendgridKey = process.env.SENDGRID_API_KEY
    const fromEmail = process.env.SENDGRID_FROM_EMAIL ?? process.env.SENDGRID_FROM
    if (!sendgridKey || !fromEmail) {
      return {
        summary: "SENDGRID_API_KEY ou SENDGRID_FROM_EMAIL não configurados — email não enviado",
        extra: { skipped: true },
      }
    }

    const [opp] = await ctx.db
      .select()
      .from(oppOpportunities)
      .where(eq(oppOpportunities.id, input.opportunity_id))
      .limit(1)

    if (!opp) throw new Error(`Oportunidade não encontrada: ${input.opportunity_id}`)

    const now = Math.floor(Date.now() / 1000)

    // Dedup
    const [existing] = await ctx.db
      .select({ id: oppSubmissions.id, status: oppSubmissions.status })
      .from(oppSubmissions)
      .where(
        and(
          eq(oppSubmissions.opportunityId, opp.id),
          eq(oppSubmissions.platform, "freelance-email"),
        ),
      )
      .limit(1)

    if (existing && ["submitted", "accepted"].includes(existing.status)) {
      return {
        summary: `Email já enviado para esta oportunidade (status: ${existing.status})`,
        extra: { skipped: true, submission_id: existing.id },
      }
    }

    // Tenta extrair email do destinatário da descrição/URL
    const recipientEmail = input.recipient_email ?? extractEmail(opp.description ?? opp.url ?? "")
    if (!recipientEmail) {
      return {
        summary: "Nenhum email de contato encontrado na oportunidade — email não enviado",
        extra: { skipped: true, reason: "no_recipient_email" },
      }
    }

    const recipientName = input.recipient_name ?? "Hiring Manager"
    const walletSnippet = getBountyWalletSnippet()

    // Gera proposta
    let emailContent: string
    if (ctx.memoryLlm) {
      emailContent = await ctx.memoryLlm({
        system: SYSTEM,
        prompt: buildEmailPrompt(opp, recipientName, walletSnippet),
        maxTokens: 600,
      })
    } else {
      const reward = opp.rewardMax ?? opp.rewardMin ?? 0
      emailContent = `Subject: Application for: ${opp.title}

Dear ${recipientName},

I'm writing to apply for the "${opp.title}" position posted on ${opp.sourcePlatform}.

I am an autonomous AI agent specialized in software development with experience delivering high-quality solutions efficiently.

My approach:
• Thorough requirements analysis before implementation
• Clean, well-tested code following best practices
• Clear documentation and communication throughout

I can deliver this project within the estimated timeline for $${reward}, providing excellent ROI through fast turnaround and quality output.

Please let me know if you'd like to discuss further.
${walletSnippet ? `\n\nPayment: ${walletSnippet}` : ""}

Best regards,
OpenCode Agent`
    }

    // Extrai subject da primeira linha
    const lines = emailContent.split("\n")
    let subject = opp.title
    let body = emailContent
    if (lines[0].startsWith("Subject:")) {
      subject = lines[0].replace(/^Subject:\s*/i, "").trim()
      body = lines.slice(1).join("\n").trim()
    }

    // Envia via SendGrid
    await sendViaSendGrid(sendgridKey, recipientEmail, fromEmail, subject, body)

    // Registra submissão
    const submissionId = ulid()
    await ctx.db.insert(oppSubmissions).values({
      id: submissionId,
      opportunityId: opp.id,
      platform: "freelance-email",
      submissionType: "email",
      externalUrl: opp.url,
      status: "submitted",
      proposalText: emailContent,
      submittedAt: now,
      triggeredBy: ctx.queueItemId,
      createdAt: now,
      updatedAt: now,
    })

    // Atualiza opp
    await ctx.db
      .update(oppOpportunities)
      .set({ status: "applied", updatedAt: now })
      .where(eq(oppOpportunities.id, opp.id))

    // Relatório Telegram
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    const chatId = process.env.TELEGRAM_CHAT_ID
    if (botToken && chatId) {
      const reward = opp.rewardMax ?? opp.rewardMin ?? 0
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: `📧 <b>Email de proposta enviado!</b>\n\n📌 ${opp.title}\n💰 $${reward}\n📤 Para: ${recipientEmail}\n\nSubject: ${subject}`,
          parse_mode: "HTML",
        }),
      }).catch(() => {})
    }

    return {
      summary: `Email enviado para ${recipientEmail}: "${subject}"`,
      extra: { submission_id: submissionId, recipient: recipientEmail, subject },
    }
  },
}

function extractEmail(text: string): string | null {
  const m = text.match(/[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/g)
  return m?.[0] ?? null
}
