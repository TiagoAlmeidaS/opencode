# Pipeline: limite de execuções por dia (`max_runs_per_day`)

## Objetivo

Limitar quantas vezes uma **pipeline** pode **disparar por dia** (dia civil **UTC**), independentemente do cron ser agressivo. Útil para `repo-issue-worker` e outras estratégias custosas.

## Comportamento

- Campo **`max_runs_per_day`** na tabela `daemon_pipelines` (API: snake_case no JSON de criação/atualização).
- **`0`** = sem limite (comportamento anterior).
- Cada disparo cria um registro em **`daemon_jobs`**; o limite conta **criações** no intervalo `[00:00 UTC, 24:00 UTC)` do dia atual.
- **Scheduler (cron)** e **`POST /server/pipelines/:id/run`** (Run manual / app Flutter) **ambos** respeitam o limite.
- Ao atingir o limite: o scheduler **não** enfileira nova run; o Run manual retorna **HTTP 400** com mensagem explicativa.

## API

- **POST** `/server/pipelines` — opcional: `max_runs_per_day` (0–500).
- **PATCH** `/server/pipelines/:id` — opcional: `max_runs_per_day`.
- Detalhes em [opencode-server API](../api/opencode-server.md).

## App Flutter

No **Server** dashboard: criar automação **Repo issue worker** com campo **Max/day UTC**; em cada pipeline, botão **Daily cap** para ajustar o limite.

## Implementação

- [`packages/server/src/pipeline-daily-limit.ts`](../../packages/server/src/pipeline-daily-limit.ts) — contagem por dia UTC.
- Scheduler: [`packages/server/src/scheduler.ts`](../../packages/server/src/scheduler.ts).
- Run imediato: [`packages/server/src/index.ts`](../../packages/server/src/index.ts) (`runPipelineNow`, `runPipelineByStrategy`).
