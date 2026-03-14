import { ulid } from "ulid"
import { eq } from "drizzle-orm"
import { Octokit } from "@octokit/rest"
import { oppSubmissions, oppOpportunities, daemonRevenue } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"

interface VerifySubmissionOutcomeInput {
  submission_id: string
}

export const verifySubmissionOutcomeActivity: Activity = {
  type: "verify-submission-outcome",
  displayName: "Verify Submission Outcome",
  description: "Verifica se PR foi merged / proposta aceita e atualiza status + receita",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as VerifySubmissionOutcomeInput
    if (!input.submission_id) throw new Error("submission_id é obrigatório")

    const [sub] = await ctx.db
      .select()
      .from(oppSubmissions)
      .where(eq(oppSubmissions.id, input.submission_id))
      .limit(1)

    if (!sub) throw new Error(`Submission não encontrada: ${input.submission_id}`)

    // Já resolvida
    if (["accepted", "rejected", "paid"].includes(sub.status)) {
      return {
        summary: `Submission já finalizada com status: ${sub.status}`,
        extra: { skipped: true },
      }
    }

    const now = Math.floor(Date.now() / 1000)

    // Atualiza timestamp de verificação
    await ctx.db
      .update(oppSubmissions)
      .set({ outcomeCheckedAt: now, updatedAt: now })
      .where(eq(oppSubmissions.id, sub.id))

    // ── GitHub PR ────────────────────────────────────────────────────────────
    if (sub.platform === "github" && sub.submissionType === "pr" && sub.prNumber && sub.externalUrl) {
      const githubToken = process.env.GITHUB_TOKEN
      if (!githubToken) return { summary: "GITHUB_TOKEN não configurado — verificação pulada" }

      // Extrai owner/repo da URL do PR
      const m = sub.externalUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
      if (!m) return { summary: "URL do PR não reconhecida" }

      const [, owner, repo] = m
      const octokit = new Octokit({ auth: githubToken })

      const { data: pr } = await octokit.pulls.get({
        owner,
        repo,
        pull_number: sub.prNumber,
      })

      if (pr.merged) {
        await handleAccepted(ctx, sub, now, "PR merged")
        return {
          summary: `✅ PR merged: ${sub.externalUrl}`,
          extra: { outcome: "accepted", pr_merged: true },
        }
      }

      if (pr.state === "closed" && !pr.merged) {
        await ctx.db
          .update(oppSubmissions)
          .set({ status: "rejected", updatedAt: now })
          .where(eq(oppSubmissions.id, sub.id))
        return {
          summary: `❌ PR fechado sem merge: ${sub.externalUrl}`,
          extra: { outcome: "rejected" },
        }
      }

      // PR ainda aberto — re-enfileira verificação em 6h
      await ctx.enqueue("verify-submission-outcome", { submission_id: sub.id }, { priority: 9 })
      return {
        summary: `PR ainda aberto (state: ${pr.state}) — verificação reagendada`,
        extra: { outcome: "pending", pr_state: pr.state },
      }
    }

    // ── Gitcoin / Email — não há verificação automática ──────────────────────
    // Re-enfileira em 24h para verificação manual
    await ctx.enqueue("verify-submission-outcome", { submission_id: sub.id }, { priority: 9 })
    return {
      summary: `Submission ${sub.platform} — verificação manual necessária (reagendada em 24h)`,
      extra: { outcome: "pending" },
    }
  },
}

async function handleAccepted(
  ctx: ActivityContext,
  sub: typeof oppSubmissions.$inferSelect,
  now: number,
  reason: string,
): Promise<void> {
  // Busca oportunidade para obter reward
  const [opp] = await ctx.db
    .select()
    .from(oppOpportunities)
    .where(eq(oppOpportunities.id, sub.opportunityId))
    .limit(1)

  const rewardUsd = opp?.rewardMax ?? opp?.rewardMin ?? 0

  // Atualiza submission
  await ctx.db
    .update(oppSubmissions)
    .set({ status: "accepted", rewardUsd, updatedAt: now })
    .where(eq(oppSubmissions.id, sub.id))

  // Atualiza oportunidade
  await ctx.db
    .update(oppOpportunities)
    .set({ status: "won", updatedAt: now })
    .where(eq(oppOpportunities.id, sub.opportunityId))

  // Registra receita em daemon_revenue (para aparecer no dashboard de receita)
  if (rewardUsd > 0) {
    const [pipeline] = await ctx.db
      .select({ id: (await import("../schema")).daemonPipelines.id })
      .from((await import("../schema")).daemonPipelines)
      .limit(1)

    if (pipeline) {
      await ctx.db.insert(daemonRevenue).values({
        id: ulid(),
        pipelineId: pipeline.id,
        source: sub.platform,
        amount: rewardUsd,
        currency: "USD",
        periodStart: now,
        periodEnd: now,
        externalId: sub.externalUrl ?? sub.id,
        metadataJson: JSON.stringify({
          submission_id: sub.id,
          opportunity_id: sub.opportunityId,
          reason,
        }),
        createdAt: now,
      })
    }
  }

  // Notifica Telegram
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (botToken && chatId) {
    const oppTitle = opp?.title ?? "Oportunidade"
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `🎉 <b>Submissão aceita!</b>\n\n📌 ${oppTitle}\n💰 $${rewardUsd} USD\n🔗 ${sub.externalUrl ?? ""}\n\n${reason}`,
        parse_mode: "HTML",
      }),
    }).catch(() => {})
  }
}
