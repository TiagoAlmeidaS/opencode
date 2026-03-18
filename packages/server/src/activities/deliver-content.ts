import { ulid } from "ulid"
import { eq, and, inArray } from "drizzle-orm"
import { oppOpportunities, oppSubmissions } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"

interface DeliverContentInput {
  opportunity_id: string
  output_preview?: string
}

export const deliverContentActivity: Activity = {
  type: "deliver-content",
  displayName: "Deliver Content",
  description: "Registra entrega de conteúdo gerado e envia alerta via Telegram",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as DeliverContentInput
    if (!input.opportunity_id) throw new Error("opportunity_id é obrigatório")

    const [opp] = await ctx.db
      .select()
      .from(oppOpportunities)
      .where(eq(oppOpportunities.id, input.opportunity_id))
      .limit(1)

    if (!opp) throw new Error(`Oportunidade não encontrada: ${input.opportunity_id}`)

    const now = Math.floor(Date.now() / 1000)

    // Dedup: check if submission already exists
    const [existing] = await ctx.db
      .select({ id: oppSubmissions.id, status: oppSubmissions.status })
      .from(oppSubmissions)
      .where(
        and(
          eq(oppSubmissions.opportunityId, opp.id),
          eq(oppSubmissions.platform, "content"),
          inArray(oppSubmissions.status, ["submitted", "accepted"]),
        ),
      )
      .limit(1)

    if (existing) {
      return {
        summary: `Entrega de conteúdo já registrada (status: ${existing.status})`,
        extra: { skipped: true, submission_id: existing.id },
      }
    }

    const outputPreview = input.output_preview ?? ""

    const submissionId = ulid()
    await ctx.db.insert(oppSubmissions).values({
      id: submissionId,
      opportunityId: opp.id,
      platform: "content",
      submissionType: "content-delivery",
      externalUrl: opp.url,
      status: "submitted",
      proposalText: outputPreview,
      submittedAt: now,
      triggeredBy: ctx.queueItemId,
      createdAt: now,
      updatedAt: now,
    })

    // Telegram alert
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    const chatId = process.env.TELEGRAM_CHAT_ID
    if (botToken && chatId) {
      const reward = opp.rewardMax ?? opp.rewardMin ?? 0
      const preview = outputPreview.slice(0, 200)
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: `✍️ <b>Conteúdo entregue!</b>\n\n📌 ${opp.title}\n💰 $${reward} USD\n\nPreview: ${preview}`,
          parse_mode: "HTML",
        }),
      }).catch(() => {})
    }

    return {
      summary: `Entrega de conteúdo registrada para "${opp.title}"`,
      extra: { submission_id: submissionId, opportunity_id: opp.id },
    }
  },
}
