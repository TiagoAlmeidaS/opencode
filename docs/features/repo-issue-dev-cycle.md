# Repo issue dev cycle (Sprint D)

## Objetivo

Ciclo fechado **Spec → testes TDD → implementação (OpenCode) → docs → PR draft → Telegram**, compartilhado entre:

1. **Repos próprios** — pipeline `repo-issue-worker`: issues abertas com label configurável (`agent` por padrão).
2. **Oportunidades** — após `classify-workspace-strategy` (`fork-temp`, `extend-repo`) ou após `create-dedicated-repo` (`dedicated-repo`).

## Config / env

| Variável | Uso |
|----------|-----|
| `GITHUB_TOKEN` | Issues, clone, fork, PR |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Aviso de PR draft (opcional) |
| LLM no daemon (`memoryLlm`) | `generate-spec`, `generate-tdd-tests`, `generate-docs` |

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

## UI

- **Board → Repos:** jobs agrupados por repo; status até `completed` (notificado — merge ainda é manual no GitHub).
- **Schedules → Repo automations:** cria pipeline com estratégia `repo-issue-worker`.

## Tabela

`repo_issue_jobs` — estado do ciclo por issue ou por oportunidade.
