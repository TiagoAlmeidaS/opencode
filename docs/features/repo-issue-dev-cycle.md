# Repo issue dev cycle

## Objetivo

Ciclo fechado **implementação (OpenCode CLI) → docs → PR draft → Telegram**, compartilhado entre:

1. **Repos próprios** — pipeline `repo-issue-worker`: issues abertas com label configurável (`agent` por padrão).
2. **Oportunidades** — após `classify-workspace-strategy` (`fork-temp`, `extend-repo`) ou após `create-dedicated-repo` (`dedicated-repo`).

## Chain de steps

```
implement-code → generate-docs → open-pr → notify-pr-approval
```

O `implement-code` delega o ciclo completo para a CLI OpenCode:

1. Clone/fork do repo
2. CLI lê o codebase e entende a arquitetura
3. CLI gera spec em `.opencode/spec.json` (persistido no banco para rastreabilidade)
4. CLI escreve testes seguindo padrões do projeto
5. CLI implementa o código
6. CLI instala dependências e roda testes
7. Validação pós-agent: server verifica se testes passam (com fallback graceful se runtime não estiver disponível)

## Config / env

| Variável | Uso |
|----------|-----|
| `GITHUB_TOKEN` | Issues, clone, fork, PR |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Aviso de PR draft (opcional) |
| LLM no daemon (`memoryLlm`) | `generate-docs` (e outras activities do sistema) |
| `OPENCODE_CLI_PATH` | Caminho para a CLI OpenCode no container |

## Pipeline `repo-issue-worker`

Limite diário de **disparos** da pipeline (cron + Run manual): ver [pipeline-max-runs-per-day](pipeline-max-runs-per-day.md) (`max_runs_per_day` na pipeline, não no `config_json`).

`config_json`:

- `repo_full_name` (obrigatório): `owner/repo`
- `label` (default `agent`)
- `base_branch` (default `main`)
- `max_issues_per_run` (default 3)
- `priority_label_prefix` (default `p:`) — `p:high` / `p:medium` / `p:low`

Issues que citam outra issue do mesmo lote (`#N`) são adiadas. Jobs **failed** são re-enfileirados na próxima run. Dedup na fila: `repo-job:{jobId}`.

## Oportunidades

- **fork-temp:** PR no upstream a partir de **fork** (`use_fork=1`).
- **dedicated / extend:** trabalho direto no repo indicado.

Dedup na fila por `opportunity_id` da oportunidade.

## API

- `GET /server/repo-issue-jobs?status=&repo=&limit=50`
- `GET /server/repo-issue-jobs/:id`
- `GET /server/repo-issue-jobs/:id/errors`

## UI

- **Board → Repos:** jobs agrupados por repo; status até `completed` (notificado — merge ainda é manual no GitHub).
- **Schedules → Repo automations:** cria pipeline com estratégia `repo-issue-worker`.

## Session tracking e learning

Apos cada `spawnOpenCode`, o server vincula a sessao CLI ao job:

- `session_id`: referencia a sessao no `opencode.db` (messages, parts, tool calls)
- `cli_output`: stdout+stderr truncado para debug rapido
- `pr_outcome`: merge/rejection capturado pela activity `pr-outcome-check`
- `pr_review_comments`: review comments do PR para alimentar o learning
- `learning_extracted_at`: marca quando o pipeline `dev_cycle_learning` extraiu padroes

O pipeline `dev_cycle_learning` (cron diario) le jobs completed/failed e usa LLM para extrair padroes em `agent_learnings`. Sessoes sao mantidas por 7 dias e depois limpas pelo pipeline `session_cleanup`.

Ver detalhes em [dev-cycle-learning.md](dev-cycle-learning.md).

## Tabela

`repo_issue_jobs` — estado do ciclo por issue ou por oportunidade. Campos relevantes:

- `spec_json`: spec gerada pela CLI (lida de `.opencode/spec.json` apos execucao)
- `test_files`: legado (anteriormente gerado por `generate-tdd-tests`, agora criado pela CLI direto no repo)
- `branch_name`, `pr_url`, `pr_number`: estado do PR
- `require_passing_tests`: 1 = testes devem passar; 0 = abre PR draft mesmo com falha
- `session_id`, `cli_output`: rastreabilidade da sessao CLI
- `pr_outcome`, `pr_outcome_at`, `pr_review_comments`: feedback do PR
- `learning_extracted_at`: controle de extracao de learning

## Referencias

- [Dev Cycle Learning](dev-cycle-learning.md) — loop de aprendizado completo
- [Incidente 2026-03-19](../bugs/incident-2026-03-19-dev-cycle-errors.md) — refatoracao que removeu `generate-spec` e `generate-tdd-tests` da chain
