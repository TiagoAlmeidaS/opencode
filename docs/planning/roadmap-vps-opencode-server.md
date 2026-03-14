# Roadmap: OpenCode Server na VPS e integração Web/Mobile

Visão em fases para rodar o OpenCode Server em uma VPS e integrar módulos Web/Mobile, com evolução futura para rotinas autônomas de aprendizado (Jarvis).

## Fase 1 – OpenCode Server na VPS

Subir uma instância de `opencode serve --daemon` na VPS para que rode 24/7, com scheduler, pipelines, goals e API em `/server`.

- **Stack:** Bun (ou Node), variáveis de ambiente configuradas (LLM, Telegram, etc.).
- **Deploy:** systemd ou Docker; ver procedimento passo a passo em [runbooks/runbook-deploy-opencode-server-vps.md](../runbooks/runbook-deploy-opencode-server-vps.md).
- **Referência de API:** [api/opencode-server.md](../api/opencode-server.md).

## Fase 2 – Integração Web e Mobile

Módulos Web e Mobile consomem a mesma base URL do serve (ex.: `https://vps.example.com`), com a autenticação já existente (ex.: `OPENCODE_SERVER_PASSWORD` / Basic Auth).

- **Endpoints:** `/server` (status, pipelines, jobs, goals, proposals, dashboard, logs) e demais endpoints da API OpenCode conforme necessário.
- **Uso:** apps Web e Mobile usam o SDK ou `fetch` contra a base URL; mesma autenticação para toda a API.
- **Detalhes:** [api/opencode-server.md](../api/opencode-server.md) (prefixo `/server`, SDK).

## Fase 3 – Rotinas autônomas (futuro)

Pipelines e goals no OpenCode Server servem de base para “aprendizado profundo” e automação do ecossistema Jarvis (observe → orient → decide → act → learn).

- **No OpenCode:** scheduler, pipelines (`seo_blog`, `metrics_collector`, `strategy_analyzer`), proposal executor, goals — já documentados em [runbooks/runbook-daemon-goals.md](../runbooks/runbook-daemon-goals.md) e [planning/migration-jarvis-to-opencode-server.md](migration-jarvis-to-opencode-server.md).
- **Visão de autonomia Jarvis:** roadmap e issues de crescimento/auto-aprendizado no repositório Jarvis (autonomy-roadmap, autonomy-growth-self-learning). O “cérebro” passa a ser o OpenCode Server na VPS.

## Referências

- [api/opencode-server.md](../api/opencode-server.md) — ativação, endpoints `/server`, config, SDK.
- [runbooks/runbook-deploy-opencode-server-vps.md](../runbooks/runbook-deploy-opencode-server-vps.md) — deploy na VPS.
- [planning/migration-jarvis-to-opencode-server.md](migration-jarvis-to-opencode-server.md) — migração Jarvis → OpenCode Server.
