# Documentação OpenCode

Índice da documentação do projeto OpenCode. Toda documentação fica estruturada em pastas por tipo; o padrão de uso está em [PADRAO-DOCUMENTACAO.md](PADRAO-DOCUMENTACAO.md).

## Por tipo

| Pasta | Propósito |
|-------|-----------|
| [**api/**](api/) | Referência de API (endpoints, contratos). |
| [**features/**](features/) | Funcionalidades e capacidades do produto (especificação, status, prioridade). |
| [**planning/**](planning/) | Planejamento, roadmaps, fases, decisões de produto/tecnologia. |
| [**runbooks/**](runbooks/) | Procedimentos operacionais passo a passo. |
| [**fixtures/**](fixtures/) | Dados de exemplo, schemas, configs de referência. |
| [**bugs/**](bugs/) | Registro de bugs conhecidos, workarounds, post-mortems. |
| [**architecture/**](architecture/) | Decisões de arquitetura e visão de sistema. |
| [**issues/**](issues/) | Backlog e issues sugeridas (formato doc, para criar no tracker). |
| [**archive/**](archive/) | Documentação desatualizada ou substituída. |

## Documentos principais

- **OpenCode Server (daemon):** [api/opencode-server.md](api/opencode-server.md) — ativação, endpoints `/server`, config, SDK.
- **Migração Jarvis → OpenCode:** [planning/migration-jarvis-to-opencode-server.md](planning/migration-jarvis-to-opencode-server.md) — checklist e mapeamento de config.
- **Roadmap VPS + Web/Mobile:** [planning/roadmap-vps-opencode-server.md](planning/roadmap-vps-opencode-server.md) — fases: OpenCode Server na VPS, integração Web/Mobile, rotinas autônomas (futuro).
- **Visão VPS e integração:** [architecture/visao-opencode-server-vps-integracao.md](architecture/visao-opencode-server-vps-integracao.md) — diagrama e resumo (Web/Mobile, rotinas autônomas).
- **Deploy OpenCode Server na VPS:** [runbooks/runbook-deploy-opencode-server-vps.md](runbooks/runbook-deploy-opencode-server-vps.md) — procedimento com systemd ou Docker.
- **Plugins Telegram e WhatsApp:** [features/plugins-telegram-whatsapp.md](features/plugins-telegram-whatsapp.md) — configuração e env; variáveis em [features/env-vars.md](features/env-vars.md).
- **Goals e proposals:** [runbooks/runbook-daemon-goals.md](runbooks/runbook-daemon-goals.md) — uso de metas e executor de propostas.
- **Project Discovery:** [features/project-discovery-validator.md](features/project-discovery-validator.md) — validação de ideias de projeto no chat; [runbooks/runbook-project-discovery.md](runbooks/runbook-project-discovery.md) — prática e formato do relatório.

## Padrão de documentação

Onde registrar cada tipo de doc e convenções de nome: [PADRAO-DOCUMENTACAO.md](PADRAO-DOCUMENTACAO.md).
