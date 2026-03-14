import { ulid } from "ulid"
import { eq } from "drizzle-orm"
import { oppOpportunities, oppTelegramReports } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"
import { createHash } from "crypto"

interface SendTelegramAlertInput {
  opportunity_id: string
  chat_id?: string
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

export const sendTelegramAlertActivity: Activity = {
  type: "send-telegram-alert",
  displayName: "Send Telegram Alert",
  description: "Envia alerta imediato no Telegram para oportunidades de alto score (≥90)",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as SendTelegramAlertInput
    if (!input.opportunity_id) throw new Error("opportunity_id é obrigatório")

    const botToken = process.env.TELEGRAM_BOT_TOKEN
    const chatId = input.chat_id ?? process.env.TELEGRAM_CHAT_ID

    if (!botToken || !chatId) {
      return {
        summary: "TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não configurados — alerta não enviado",
        extra: { skipped: true },
      }
    }

    const [opp] = await ctx.db
      .select()
      .from(oppOpportunities)
      .where(eq(oppOpportunities.id, input.opportunity_id))
      .limit(1)

    if (!opp) throw new Error(`Oportunidade não encontrada: ${input.opportunity_id}`)

    const reward = opp.rewardMax ?? opp.rewardMin ?? 0
    const message = [
      `🚨 <b>ALERTA — Oportunidade de Alto Score!</b>`,
      ``,
      `📌 <b>${opp.title}</b>`,
      `🏷️ Tipo: ${opp.type}`,
      `💰 Recompensa: $${reward}`,
      `⭐ Score: ${opp.score ?? "?"}`,
      opp.url ? `🔗 <a href="${opp.url}">Ver oportunidade</a>` : "",
      opp.deadline ? `⏰ Prazo: ${new Date(opp.deadline * 1000).toLocaleDateString("pt-BR")}` : "",
    ]
      .filter(Boolean)
      .join("\n")

    const contentHash = createHash("sha256").update(message).digest("hex").slice(0, 32)
    const now = Math.floor(Date.now() / 1000)

    // Dedup
    const [existing] = await ctx.db
      .select({ id: oppTelegramReports.id })
      .from(oppTelegramReports)
      .where(eq(oppTelegramReports.contentHash, contentHash))
      .limit(1)

    if (existing) {
      return {
        summary: "Alerta já enviado anteriormente (dedup)",
        extra: { skipped: true },
      }
    }

    await sendTelegramMessage(botToken, chatId, message)

    await ctx.db.insert(oppTelegramReports).values({
      id: ulid(),
      reportType: "alert",
      chatId,
      contentHash,
      sentAt: now,
      createdAt: now,
    })

    return {
      summary: `Alerta enviado para opp "${opp.title}" (score ${opp.score})`,
      extra: { opportunity_id: opp.id, score: opp.score },
    }
  },
}
