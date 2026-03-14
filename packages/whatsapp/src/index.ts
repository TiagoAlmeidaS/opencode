/**
 * OpenCode WhatsApp plugin: tool to send a message via WhatsApp Cloud API.
 * Configure OPENCODE_WHATSAPP_ACCESS_TOKEN and OPENCODE_WHATSAPP_PHONE_NUMBER_ID.
 * Add to opencode.json: "plugin": ["@opencode-ai/whatsapp"]
 */
import { type Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin/tool"

const WHATSAPP_API = "https://graph.facebook.com/v18.0"

export default (async function whatsappPlugin(_input) {
  return {
    tool: {
      whatsapp_send: tool({
        description: "Send a text message via WhatsApp Cloud API to the configured number",
        args: {
          text: tool.schema.string().describe("Message text to send"),
        },
        async execute(args, _context) {
          const token = process.env.OPENCODE_WHATSAPP_ACCESS_TOKEN
          const phoneId = process.env.OPENCODE_WHATSAPP_PHONE_NUMBER_ID
          const to = process.env.OPENCODE_WHATSAPP_TO_NUMBER
          if (!token || !phoneId || !to) return "WhatsApp not configured: set OPENCODE_WHATSAPP_ACCESS_TOKEN, OPENCODE_WHATSAPP_PHONE_NUMBER_ID, OPENCODE_WHATSAPP_TO_NUMBER"
          const res = await fetch(`${WHATSAPP_API}/${phoneId}/messages`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: to.replace(/\D/g, ""),
              type: "text",
              text: { body: args.text },
            }),
          })
          if (!res.ok) return `WhatsApp API error: ${res.status} ${await res.text()}`
          return "Sent."
        },
      }),
    },
  }
}) as Plugin
