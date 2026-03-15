# Feature: Project Discovery Validator

Camada de Discovery (validação de projetos e empreendimentos) integrada ao painel e ao agent do OpenCode: o usuário envia a ideia no chat; o agent executa uma prática estruturada de análise e devolve um relatório utilizável.

## Objetivo

- Receber a ideia de projeto/empreendimento no chat (Session).
- Executar uma análise estruturada via skill **project-discovery**: funcionalidades, limitações, dados, ROI, riscos, viabilidade, MVP e estrutura de projeto.
- Entregar um relatório em Markdown na mesma thread (streaming), sem alteração obrigatória de código no painel.

## Config

- **Skill:** A skill `project-discovery` deve estar disponível. Por padrão o OpenCode carrega skills de `skill/` e `skills/` no diretório do projeto (e de `.opencode/skill/` em diretórios configurados). Esta skill está em `skill/project-discovery/SKILL.md` no repositório.
- **Agent/LLM:** O mesmo modelo configurado para a Session; nenhuma config adicional é necessária.

## Uso

### No painel (chat)

1. Abra uma Session (chat) no painel OpenCode.
2. Use uma das opções:
   - Digite **`/project-discovery`** seguido da sua ideia (ex.: `/project-discovery Quero um app de gestão de tarefas para pequenas equipas`) e envie.
   - Ou use o atalho **`/discovery`**: no campo de prompt, digite `/discovery`, selecione "Analyze project idea" (ou "Analisar ideia de projeto") e depois escreva a ideia; ao enviar, o comando `project-discovery` é usado com a ideia como argumentos.
3. O agent responde na mesma thread com um relatório em Markdown (resumo, funcionalidades, limitações, dados, ROI, riscos, viabilidade, MVP, estrutura de projeto, relatório final).

### Via API

- **Comando:** `POST /session/:sessionID/command` com corpo:
  - `command`: `"project-discovery"`
  - `arguments`: texto da ideia
  - `agent`, `model`, etc. conforme o contrato da API.

## Saída

O relatório segue o formato descrito no [Runbook: Project Discovery](../runbooks/runbook-project-discovery.md): seções em Markdown (Resumo e escopo, Funcionalidades, Limitações e dependências, Dados, ROI, Riscos, Viabilidade, MVP, Estrutura de projeto, Relatório final).

## Fase 2: pipeline, API e Board

- **Tabela:** `discovery_reports` no OpenCode Server (SQLite): `id`, `idea_text`, `status` (pending/done/failed), `report_md`, `report_json`, `session_id`, `job_id`, `created_at`, `updated_at`.
- **API (Server):**
  - `POST /server/discovery` — body `{ idea_text, session_id? }` — cria registro com status `pending`.
  - `GET /server/discovery` — lista relatórios (query: `status`, `limit`, `offset`).
  - `GET /server/discovery/:id` — retorna um relatório por id.
- **Pipeline:** Estratégia `project_discovery`. Processa itens com status `pending`: usa o LLM injetado (`memoryLlm`) para gerar o relatório em Markdown e grava em `report_md`, atualizando o status para `done` ou `failed`. Config do pipeline: `max_per_run` (default 10). Criar pipeline via `POST /server/pipelines` com `strategy: "project_discovery"` e opcional `schedule_cron`.
- **Board:** No Activity Board do painel, aba **Discovery** lista as ideias e relatórios; botão "New idea" enfileira uma nova ideia (POST /server/discovery); opção "Process now (run pipeline after adding)" envia `trigger_pipeline: true` e dispara o pipeline após criar; botão "Process now" (visível quando existe pipeline `project_discovery` e há itens pendentes) executa o pipeline sob demanda (POST /server/pipelines/:id/run); ao clicar em "View" abre o relatório (report_md) em modal.

## Referências

- [Runbook: Project Discovery](../runbooks/runbook-project-discovery.md)
- [Skill project-discovery](../../skill/project-discovery/README.md)
- [API OpenCode Server](../api/opencode-server.md) (Session e command)
