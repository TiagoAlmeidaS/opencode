/**
 * Daily notifier pipeline: sends a short summary (e.g. daemon status) to Telegram.
 * Env: OPENCODE_TELEGRAM_BOT_TOKEN, OPENCODE_TELEGRAM_CHAT_ID (or JARVIS_TELEGRAM_* for migration).
 * For hour of day (like JARVIS_NOTIFY_HOUR), set the pipeline schedule_cron to that hour (e.g. 0 8 * * * for 08:00).
 */
import type { Pipeline } from "../types"
import { registerPipeline } from "../registry"

const TELEGRAM_API = "https://api.telegram.org/bot"

function getTelegramToken(): string | undefined {
  return process.env.OPENCODE_TELEGRAM_BOT_TOKEN ?? process.env.JARVIS_TELEGRAM_BOT_TOKEN
}
function getTelegramChatId(): string | undefined {
  return process.env.OPENCODE_TELEGRAM_CHAT_ID ?? process.env.JARVIS_TELEGRAM_CHAT_ID
}

async function sendTelegram(text: string): Promise<boolean> {
  const token = getTelegramToken()
  const chatId = getTelegramChatId()
  if (!token || !chatId) return false
  const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  })
  return res.ok
}

const dailyNotifier: Pipeline = {
  strategy: "daily_notifier",
  displayName: "Daily Notifier (Telegram)",
  async execute(ctx) {
    const lines = [
      "<b>OpenCode Server — Daily summary</b>",
      `Pipeline: ${ctx.pipelineId}`,
      `Job: ${ctx.jobId}`,
      `Time: ${new Date().toISOString()}`,
    ]
    const text = lines.join("\n")
    await sendTelegram(text)
  },
}

registerPipeline(dailyNotifier)
