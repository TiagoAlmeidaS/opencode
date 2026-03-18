import { eq } from "drizzle-orm"
import { repoIssueJobs } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"

interface Input {
  repo_issue_job_id: string
}

async function sendTelegram(botToken: string, chatId: string, text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    }),
  })
  if (!res.ok) {
    const b = await res.text()
    throw new Error(`Telegram: ${res.status} ${b.slice(0, 200)}`)
  }
}

export const notifyPrApprovalActivity: Activity = {
  type: "notify-pr-approval",
  displayName: "Notify PR Approval",
  description: "Telegram: PR aguardando aprovação (ciclo automatizado encerrado; merge é humano)",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as Input
    if (!input.repo_issue_job_id) throw new Error("repo_issue_job_id é obrigatório")

    const token = process.env.TELEGRAM_BOT_TOKEN
    const chat = process.env.TELEGRAM_CHAT_ID
    if (!token || !chat) {
      const now = Math.floor(Date.now() / 1000)
      await ctx.db
        .update(repoIssueJobs)
        .set({ status: "completed", updatedAt: now })
        .where(eq(repoIssueJobs.id, input.repo_issue_job_id))
      return { summary: "Telegram não configurado — job marcado completed", extra: { skipped: true } }
    }

    const [job] = await ctx.db
      .select()
      .from(repoIssueJobs)
      .where(eq(repoIssueJobs.id, input.repo_issue_job_id))
      .limit(1)
    if (!job?.prUrl) throw new Error("pr_url ausente")

    let criteria = ""
    if (job.specJson) {
      try {
        const s = JSON.parse(job.specJson) as { acceptance_criteria?: string[] }
        criteria = (s.acceptance_criteria ?? []).slice(0, 8).map((c) => `• ${c}`).join("\n")
      } catch { /* empty */ }
    }

    const msg = [
      `<b>PR draft — aprovação humana</b>`,
      ``,
      `<b>${job.issueTitle}</b>`,
      ``,
      `<a href="${job.prUrl}">Abrir PR no GitHub</a>`,
      ``,
      criteria ? `<b>Critérios:</b>\n${criteria}` : "",
      ``,
      `Aprovar o PR no GitHub para merge.`,
    ]
      .filter(Boolean)
      .join("\n")

    await sendTelegram(token, chat, msg)

    const now = Math.floor(Date.now() / 1000)
    await ctx.db
      .update(repoIssueJobs)
      .set({ status: "completed", updatedAt: now })
      .where(eq(repoIssueJobs.id, job.id))

    return { summary: "Telegram enviado; status completed (aguardando merge humano)", extra: {} }
  },
}
