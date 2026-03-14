# Padrão de documentação OpenCode

Este documento define onde e como registrar cada tipo de documentação no projeto OpenCode, de forma a separar responsabilidades e manter consistência.

## Estrutura por pasta

| Pasta | Responsabilidade | Quando usar | Exemplo de conteúdo |
|-------|------------------|-------------|---------------------|
| **features/** | Funcionalidades e capacidades do produto (especificação, status, prioridade). | Nova feature, plugin, integração; doc que descreve *o que* o sistema faz. | Plugins Telegram/WhatsApp, Server daemon, pipelines, daily notifier. |
| **planning/** | Planejamento, roadmaps, fases, decisões de produto/tecnologia. | Migrações, ADRs, fases de projeto, checklist de entregas. | Migration Jarvis→OpenCode, roadmap de deprecação, decisões de stack. |
| **runbooks/** | Procedimentos operacionais passo a passo. | "Como fazer X" em produção, troubleshooting guiado, execução de rotinas. | Goals e proposal executor, deploy, rollback, health check. |
| **fixtures/** | Dados de exemplo, schemas, configs de referência. | JSON de pipeline, exemplos de `opencode.json`, payloads de API, seeds. | `pipeline-example.json`, `opencode.example.json`, schemas. |
| **bugs/** | Registro de bugs conhecidos, workarounds, post-mortems. | Bug documentado com repro, impacto, workaround e link para issue/fix. | Bugs críticos com contorno, incidentes com lições aprendidas. |
| **architecture/** | Decisões de arquitetura e visão de sistema. | Diagramas, ADRs, visão de componentes, integração entre pacotes. | Diagrama Server/CLI/plugins, decisão SQLite vs outro DB. |
| **issues/** | Backlog e issues sugeridas (formato doc, para criar no tracker). | Conjuntos de issues para triagem; padrão de corpo (objetivo, critério de aceite). | Conjuntos de issues por tema, template de issue. |
| **api/** | Referência de API (endpoints, contratos). | Documentação estável de APIs expostas (Server, plugins, webhooks). | opencode-server (endpoints `/server`), OpenAPI/snippets. |
| **archive/** | Documentação desatualizada ou substituída. | Docs que não devem ser usados no dia a dia mas ficam versionados. | Versões antigas de runbooks ou specs substituídas. |

## Convenções de nomenclatura

- **features:** `nome-da-funcionalidade.md` ou `nome-plugin.md`
- **planning:** `nome-migracao.md`, `roadmap-*.md`, `adr-*.md`
- **runbooks:** `runbook-*.md` ou `RUNBOOK-*.md`
- **fixtures:** nomes descritivos, ex.: `pipeline-daily-notifier.json`, `opencode.server.example.json`
- **bugs:** `bug-XXX-descricao-curta.md` ou `incident-YYYY-MM-DD.md`
- **architecture:** `adr-*.md`, `visao-*.md`, `diagrama-*.md`
- **api:** `nome-api.md` ou por recurso (ex.: `opencode-server.md`)

## Template mínimo por tipo

### Runbook

- **Pré-requisitos:** o que precisa estar configurado ou disponível.
- **Passos:** ordem clara dos comandos ou ações.
- **Rollback:** como reverter se algo falhar (quando aplicável).
- **Referências:** links para api, features ou outros runbooks.

### Bug / incidente

- **Resumo:** uma linha.
- **Impacto:** quem é afetado e como.
- **Reprodução / contexto:** passos ou cenário.
- **Workaround:** contorno até o fix (se houver).
- **Fix / issue:** link para PR ou issue.

### Feature

- **Objetivo:** o que a funcionalidade entrega.
- **Config / env:** como ativar e configurar.
- **Uso:** exemplos (API, CLI, pipeline).
- **Referências:** api, runbooks ou planning relacionados.

## Onde criar novo documento

1. Identifique o tipo (feature, runbook, planejamento, bug, etc.).
2. Use a pasta correspondente da tabela acima.
3. Siga a convenção de nome da seção "Convenções de nomenclatura".
4. Atualize o README da pasta (lista de documentos) se existir.
5. Quando relevante, linke no [docs/README.md](README.md) em "Documentos principais".
