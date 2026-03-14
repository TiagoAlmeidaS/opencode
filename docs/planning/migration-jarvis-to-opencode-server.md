# Migration runbook: Jarvis CLI to OpenCode Server

This runbook tracks the migration of Jarvis daemon, pipelines, messaging, and Web API into the OpenCode ecosystem under the "OpenCode Server" concept.

## Decision

- **Strategy:** Opção A — full TypeScript/Bun migration inside the OpenCode repo.
- **OpenCode Server:** Optional layer on top of `opencode serve` (flag `--daemon` or config `server.daemon: true`), with API under `/server` and scheduler + pipelines in `packages/server`.

## Checklist

### Fase 1 – Fundação (OpenCode Server)

- [x] Create `packages/server`: scheduler (cron), Drizzle + SQLite schema, pipeline registry, job runner.
- [x] Implement REST routes under `/server`: status, pipelines, jobs, goals, proposals, dashboard, logs.
- [x] Activation via `opencode serve --daemon` and config `server.daemon`.
- [x] Document in [api/opencode-server.md](../api/opencode-server.md).

### Fase 2 – Pipelines built-in

- [x] Port pipelines: `seo_blog`, `metrics_collector`, `strategy_analyzer` (stubs in TS; LLM/integrations to be wired).
- [x] Proposal executor and goals: execute approved proposals (mark executed), update goal current values in metrics_collector.
- [x] Runbooks in [runbooks/runbook-daemon-goals.md](../runbooks/runbook-daemon-goals.md).

### Fase 3 – Mensageria como plugins

- [x] Telegram plugin: tool `telegram_send`; webhook can be added when server supports plugin webhooks.
- [x] WhatsApp plugin: tool `whatsapp_send` (WhatsApp Cloud API).
- [x] Pipeline `daily_notifier` in `packages/server` (sends summary to Telegram when env set).
- [x] Document plugins and env in [features/plugins-telegram-whatsapp.md](../features/plugins-telegram-whatsapp.md).

### Fase 4 – Dashboard e SDK

- [x] Document SDK usage for `/server` (same base URL + auth; see [api/opencode-server.md](../api/opencode-server.md)). OpenAPI spec extension for generated clients can follow.
- [ ] Dashboard UI (Console or separate app) consuming OpenCode API only — optional.
- [ ] Plan deprecation of Jarvis daemon and Web API once migration is stable.

## Config mapping (Jarvis → OpenCode)

| Jarvis | OpenCode |
|--------|----------|
| `config.toml` `[api]` | Same auth as main server (e.g. OPENCODE_SERVER_PASSWORD) |
| `config.toml` `[daemon]` / pipeline config | Pipeline rows in SQLite; optional `opencode.json` `server.daemon` |
| Jarvis Web API base URL | `{opencode_serve_url}/server` |
| Daemon DB path | `{dataDir}/opencode-server.db` |

## References

- Jarvis: [DAEMON_QUICK_START](E:\projects\ia\jarvis_cli\docs\DAEMON_QUICK_START.md), [DAEMON_API](E:\projects\ia\jarvis_cli\docs\DAEMON_API.md), [RUNBOOK-DAEMON-GOOGLE](E:\projects\ia\jarvis_cli\docs\RUNBOOK-DAEMON-GOOGLE.md).
- OpenCode: [api/opencode-server.md](../api/opencode-server.md).
