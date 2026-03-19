# Environment variables (OpenCode and migration from Jarvis)

Variables used by OpenCode Server, Telegram/WhatsApp plugins, LLM providers, and daily notifier. When migrating from Jarvis, the same env names you used there can be used as fallbacks where indicated.

## Azure OpenAI

OpenCode supports **Azure OpenAI** via the built-in provider `azure` (`@ai-sdk/azure`). Set:

| Purpose | Env | Config fallback | Notes |
|--------|-----|------------------|--------|
| Resource name | `AZURE_RESOURCE_NAME` | `provider.azure.options.resourceName` | Nome do recurso no Azure (ex.: `meu-recurso-openai`) |
| API key | `AZURE_API_KEY` | Auth (UI) | Chave em Keys and Endpoint no portal Azure |

Model format: `azure/<deployment-name>` (o deployment name é o que você configurou no Azure para o modelo). A lista de modelos disponíveis vem do [models.dev](https://models.dev); use o provider **azure** e o deployment name correspondente.

## Telegram

| Purpose | OpenCode (preferred) | Jarvis (legacy fallback) | Notes |
|--------|-----------------------|---------------------------|--------|
| Bot token | `OPENCODE_TELEGRAM_BOT_TOKEN` | `JARVIS_TELEGRAM_BOT_TOKEN` | From BotFather |
| Chat ID | `OPENCODE_TELEGRAM_CHAT_ID` | `JARVIS_TELEGRAM_CHAT_ID` | Where to send messages |
| Daily notify hour | — | `JARVIS_NOTIFY_HOUR` (0–23) | In OpenCode, set the pipeline `schedule_cron` instead (e.g. `0 8 * * *` for 08:00). No env var. |

Used by:
- **Plugin** `@opencode-ai/telegram` (tool `telegram_send`)
- **Pipeline** `daily_notifier` (OpenCode Server)

If both OpenCode and Jarvis vars are set, OpenCode vars take precedence.

## WhatsApp

| Purpose | OpenCode | Jarvis (legacy) | Notes |
|--------|----------|------------------|--------|
| Access token | `OPENCODE_WHATSAPP_ACCESS_TOKEN` | `WHATSAPP_ACCESS_TOKEN` | Cloud API token |
| Phone number ID | `OPENCODE_WHATSAPP_PHONE_NUMBER_ID` | `WHATSAPP_PHONE_NUMBER_ID` | Sender |
| To number | `OPENCODE_WHATSAPP_TO_NUMBER` | — | Recipient phone (with country code) |
| Verify token | — | `WHATSAPP_VERIFY_TOKEN` | Webhook verification (webhooks not yet in OpenCode plugin) |

Used by: **Plugin** `@opencode-ai/whatsapp` (tool `whatsapp_send`).  
OpenCode plugin currently only supports **sending**; receiving webhooks may be added later. For migration, you can keep using `WHATSAPP_*` if we add fallback in the plugin (optional).

## OpenCode Server (daemon)

| Purpose | Env / config | Notes |
|--------|----------------|-------|
| Enable daemon | `opencode serve --daemon` or `server.daemon: true` in config | No env var |
| DB path | Default: `{dataDir}/opencode-server.db` | Overridable when creating server in code |
| Server auth | `OPENCODE_SERVER_PASSWORD`, `OPENCODE_SERVER_USERNAME` | Same as main OpenCode serve |

## GitHub OAuth (app Flutter — add project)

| Purpose | Env | Notes |
|--------|-----|-------|
| Device flow proxy | `GITHUB_OAUTH_CLIENT_ID` | **OAuth App:** em [Developer settings](https://github.com/settings/developers); ativa device flow na app. Ver [github-oauth-proxy](../api/github-oauth-proxy.md). |
| Sem scope (só GitHub App) | `GITHUB_OAUTH_SKIP_SCOPE=1` | **Não uses** em OAuth App. |
| Scopes (OAuth App) | `GITHUB_OAUTH_SCOPES` | Omitir → `repo read:user`. Custom: espaços entre scopes. |
| Secret (opcional) | `GITHUB_OAUTH_CLIENT_SECRET` | Se definido, o servidor envia-o no poll do token. |

## Example `.env`

Create a `.env` in the project root (or set these in your shell / deployment):

```bash
# Telegram (plugin + daily_notifier pipeline)
OPENCODE_TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
OPENCODE_TELEGRAM_CHAT_ID=-1001234567890

# Optional: migration from Jarvis — same .env works if you use JARVIS_* names
# JARVIS_TELEGRAM_BOT_TOKEN=...
# JARVIS_TELEGRAM_CHAT_ID=...

# WhatsApp (plugin)
OPENCODE_WHATSAPP_ACCESS_TOKEN=...
OPENCODE_WHATSAPP_PHONE_NUMBER_ID=...
OPENCODE_WHATSAPP_TO_NUMBER=5511999999999

# OpenCode serve (optional)
OPENCODE_SERVER_PASSWORD=your-secret
```

Do not commit `.env` with real tokens; use `.env.example` (without secrets) for documentation.
