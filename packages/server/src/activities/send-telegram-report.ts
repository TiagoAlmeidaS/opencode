import { ulid } from "ulid"
import { eq } from "drizzle-orm"
import { oppTelegramReports } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"
import { createHash } from "crypto"

interface SendTelegramReportInput {
  digest: string          // texto do relatório já gerado
  report_type?: "daily" | "weekly" | "alert"
  chat_id?: string        // override do chat_id (padrão: env TELEGRAM_CHAT_ID)
}

async function sendTelegramMessage(botToken: string, chatId: string, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Telegram API error ${res.status}: ${body.slice(0, 200)}`)
  }
}

export const sendTelegramReportActivity: Activity = {
  type: "send-telegram-report",
  displayName: "Send Telegram Report",
  description: "Envia digest de mercado/oportunidades para canal Telegram",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as SendTelegramReportInput
    if (!input.digest) throw new Error("digest é obrigatório")

    const botToken = process.env.TELEGRAM_BOT_TOKEN
    const chatId = input.chat_id ?? process.env.TELEGRAM_CHAT_ID

    if (!botToken || !chatId) {
      return {
        summary: "TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não configurados — relatório não enviado",
        extra: { skipped: true },
      }
    }

    const reportType = input.report_type ?? "daily"
    const contentHash = createHash("sha256").update(input.digest).digest("hex").slice(0, 32)
    const now = Math.floor(Date.now() / 1000)

    // Dedup: não envia se já enviamos este hash
    const [existing] = await ctx.db
      .select({ id: oppTelegramReports.id })
      .from(oppTelegramReports)
      .where(eq(oppTelegramReports.contentHash, contentHash))
      .limit(1)

    if (existing) {
      return {
        summary: "Relatório já enviado anteriormente (dedup por hash)",
        extra: { skipped: true, content_hash: contentHash },
      }
    }

    await sendTelegramMessage(botToken, chatId, input.digest)

    await ctx.db.insert(oppTelegramReports).values({
      id: ulid(),
      reportType,
      chatId,
      contentHash,
      sentAt: now,
      createdAt: now,
    })

    return {
      summary: `Relatório ${reportType} enviado para chat ${chatId}`,
      extra: { content_hash: contentHash, report_type: reportType },
    }
  },
}
