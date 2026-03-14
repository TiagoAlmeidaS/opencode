# Plugins: Telegram and WhatsApp

OpenCode can send messages via Telegram and WhatsApp through optional plugins.

**Full env list and Jarvis → OpenCode mapping:** see [env-vars.md](env-vars.md).

## Telegram

- **Package:** `@opencode-ai/telegram`
- **Config:** Add to `opencode.json`: `"plugin": ["@opencode-ai/telegram"]`
- **Env:** `OPENCODE_TELEGRAM_BOT_TOKEN`, `OPENCODE_TELEGRAM_CHAT_ID` (or legacy `JARVIS_TELEGRAM_BOT_TOKEN`, `JARVIS_TELEGRAM_CHAT_ID` for migration)
- **Tool:** `telegram_send` — sends a text message to the configured chat. Args: `text`, optional `chat_id` override.

## WhatsApp

- **Package:** `@opencode-ai/whatsapp`
- **Config:** Add to `opencode.json`: `"plugin": ["@opencode-ai/whatsapp"]`
- **Env:** `OPENCODE_WHATSAPP_ACCESS_TOKEN`, `OPENCODE_WHATSAPP_PHONE_NUMBER_ID`, `OPENCODE_WHATSAPP_TO_NUMBER`
- **Tool:** `whatsapp_send` — sends a text message via WhatsApp Cloud API. Args: `text`.

## Daily notifier (OpenCode Server)

When OpenCode Server (daemon) is enabled, the **daily_notifier** pipeline can send a daily summary to Telegram. Set the same env vars (`OPENCODE_TELEGRAM_*` or `JARVIS_TELEGRAM_*`) and create a pipeline with strategy `daily_notifier` and a cron such as `0 9 * * *` (09:00 daily). For the same hour as Jarvis's `JARVIS_NOTIFY_HOUR`, use that hour in cron (e.g. `0 8 * * *` for 08:00).
