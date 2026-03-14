/**
 * OpenCode Telegram plugin: tool to send a message via Telegram Bot API.
 * Env: OPENCODE_TELEGRAM_BOT_TOKEN, OPENCODE_TELEGRAM_CHAT_ID (or legacy JARVIS_TELEGRAM_BOT_TOKEN, JARVIS_TELEGRAM_CHAT_ID).
 * Add to opencode.json: "plugin": ["@opencode-ai/telegram"]
 */
import { type Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin/tool"

const TELEGRAM_API = "https://api.telegram.org/bot"

function getTelegramToken(): string | undefined {
  return process.env.OPENCODE_TELEGRAM_BOT_TOKEN ?? process.env.JARVIS_TELEGRAM_BOT_TOKEN
}
function getTelegramChatId(): string | undefined {
  return process.env.OPENCODE_TELEGRAM_CHAT_ID ?? process.env.JARVIS_TELEGRAM_CHAT_ID
}

export default (async function telegramPlugin(_input) {
  return {
    tool: {
      telegram_send: tool({
        description: "Send a message to the configured Telegram chat via the bot",
        args: {
          text: tool.schema.string().describe("Message text to send"),
          chat_id: tool.schema.string().optional().describe("Override chat ID (default: OPENCODE_TELEGRAM_CHAT_ID or JARVIS_TELEGRAM_CHAT_ID)"),
        },
        async execute(args, _context) {
          const token = getTelegramToken()
          const chatId = args.chat_id ?? getTelegramChatId()
          if (!token || !chatId) return "Telegram not configured: set OPENCODE_TELEGRAM_BOT_TOKEN and OPENCODE_TELEGRAM_CHAT_ID (or JARVIS_* for migration)"
          const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: args.text }),
          })
          if (!res.ok) return `Telegram API error: ${res.status} ${await res.text()}`
          return "Sent."
        },
      }),
    },
  }
}) as Plugin
