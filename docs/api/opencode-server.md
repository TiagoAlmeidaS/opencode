# OpenCode Server (daemon)

OpenCode Server is an optional layer that extends `opencode serve` with a **scheduler** and **pipelines**: background jobs run on a cron schedule, with a SQLite-backed API for pipelines, jobs, goals, proposals, and metrics.

## Enabling

- **CLI:** `opencode serve --daemon`
- **Config:** In `opencode.json` (or global config), set `server.daemon: true`. The config schema includes `server.daemon`; other `server` options (port, hostname, mdns, cors) apply to the same serve command.

When enabled, the same process that serves the OpenCode API also runs the scheduler and exposes the Server API under the `/server` prefix.

## API prefix

All Server endpoints are under **`/server`**. Base URL example: `http://localhost:4096/server`.

The same host also serves the main OpenCode API (e.g. `GET /project`, `POST /project/add-by-url`). For adding projects by repository URL and `GITHUB_TOKEN`, see [runbook-app-backend-requirements](../runbooks/runbook-app-backend-requirements.md#adicionar-repositório-por-url).

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/server/status` | Summary: pipelines (total, enabled), jobs (running), proposals (pending), revenue (30d), goals (active). Em `metrics`: `jobs_completed_last_12h` (12 buckets horários), `load_index`, `jobs_last_hour`, `jobs_per_hour_avg_12h`, `chart_highlight_slot` — consumo no app em [flutter-kinetic-design-system](../architecture/flutter-kinetic-design-system.md). |
| GET | `/server/pipelines` | List pipelines (optional query `?enabled=true`) |
| GET | `/server/pipelines/strategies` | List registered pipeline strategy names |
| POST | `/server/pipelines` | Create pipeline (body: `name`, `strategy`, `config_json?`, `schedule_cron?`, `max_runs_per_day?`) |
| GET | `/server/pipelines/:id` | Get pipeline by id |
| PATCH | `/server/pipelines/:id` | Atualizar `name`, `schedule_cron`, `max_runs_per_day`, `config_json` (campos opcionais) |
| POST | `/server/pipelines/:id/enable` | Enable pipeline |
| POST | `/server/pipelines/:id/disable` | Disable pipeline |
| GET | `/server/jobs` | List jobs (optional `?pipeline_id=`, `?status=`) |
| GET | `/server/jobs/:id` | Get job by id |
| GET | `/server/goals` | List goals |
| POST | `/server/goals` | Create goal (body: `name`, `metric_type`, `target_value`, etc.) |
| GET | `/server/proposals` | List proposals |
| GET | `/server/dashboard` | Dashboard metrics (optional `?days=30`) |
| GET | `/server/logs` | List daemon logs (optional `?pipeline_id=`, `?limit=100`) |
| GET | `/server/reports` | List relatórios Telegram enviados (ciclo de atividade). Query: `?limit=50`, `?report_type=daily|weekly`. Retorna digest, opp_count, market_count, durationMs. |
| GET | `/server/reports/:id` | Detalhe de um relatório (digest completo, metadados, duração). |
| GET | `/server/memory/retrieve` | RAG retrieval: `?q=...&limit=5` — returns `{ chunks: { text, source, score }[] }`. Requires Qdrant and memoryEmbed. Usado também pelo CLI quando `server.memory.url` (ou env) está definido. |
| GET | `/server/learnings` | Lista learnings: `?category=&limit=`. Ordenado por confiança. |
| POST | `/server/learnings` | Cria ou atualiza por `key` (upsert). Body: `key`, `category`, `title`, `body`, opcional `confidence`, `tags[]`, `source`. |
| GET | `/server/discovery` | List discovery reports (optional `?status=`, `?limit=`, `?offset=`) |
| POST | `/server/discovery` | Enqueue a discovery idea (body: `idea_text`, `session_id?`, `trigger_pipeline?`). Creates a row with status `pending`. If `trigger_pipeline: true`, runs the first enabled pipeline with strategy `project_discovery` (when the daemon provides run callbacks). |
| GET | `/server/discovery/:id` | Get a discovery report by id (idea, status, report_md, report_json, etc.). |
| POST | `/server/pipelines/:id/run` | Run the given pipeline once. Returns `202` + `{ jobId, ok }`. **`max_runs_per_day`**: se > 0, conta jobs criados no **dia UTC**; ao atingir o limite, retorna **`400`** com mensagem (cron e Run manual contam). `0` = sem limite. |
| GET | `/server/repo-issue-jobs` | Lista jobs do ciclo fechado (issues label / opportunities). Query: `?status=`, `?repo=`, `?limit=50`. |
| GET | `/server/repo-issue-jobs/:id` | Detalhe (spec, testFiles, docs, prUrl, etc.). |

## Config

- **Database:** SQLite file at `{dataDir}/opencode-server.db` by default. `dataDir` is the OpenCode data directory (e.g. XDG data).
- **Tick interval:** Scheduler checks cron every 60 seconds. No config override in this version.
- **`max_runs_per_day`:** Coluna em `daemon_pipelines` (default `0`). Limite de **execuções por dia civil UTC** (cada disparo cria um registro em `daemon_jobs`). O scheduler **não** inicia run se o limite foi atingido; `POST .../run` também respeita o limite.

## Pipeline strategies

Built-in strategies are registered by the `@opencode-ai/server` package. The default placeholder is **`noop`**. Other built-ins include:

- **`seo_blog`**, **`metrics_collector`**, **`strategy_analyzer`**, **`daily_notifier`** — daemon/SEO/metrics.
- **`memory_extract`** — Phase 1 of the memory pipeline: reads OpenCode sessions from `opencode.db`, extracts raw memory and session summary, stores in `memory_extractions`.
- **`memory_consolidation`** — Phase 2: consolidates extractions into `MEMORY.md`, `memory_summary.md`, and optional skills on disk. See [Memory pipeline runbook](../runbooks/runbook-memory-pipeline.md) and [architecture](../architecture/memory-pipeline.md).
- **`memory_rag_index`** — Indexes MEMORY.md, memory_summary.md, and skills into Qdrant for retrieval. Requires `OPENCODE_QDRANT_URL` and `memoryEmbed`. See [Memory RAG](../features/memory-rag.md).
- **`project_discovery`** — Processes pending rows in `discovery_reports`: calls the configured LLM with the discovery prompt and idea text, writes `report_md` and sets status to `done` or `failed`. Config: `max_per_run` (default 10). Requires `memoryLlm` to be injected by the host. See [Project Discovery Validator](../features/project-discovery-validator.md).
- **`repo-issue-worker`** — Busca issues abertas com label no repo configurado; enfileira ciclo spec→PR por issue. Ver [Repo issue dev cycle](../features/repo-issue-dev-cycle.md).
- **`niche-explorer`** — Enfileira `discover-niches` (LLM sugere novos registros em `opp_niches`, opcionalmente `analyze-niche-relations`). Ver [Niche explorer](../features/niche-explorer-pipeline.md).

## Cron format

Pipeline `schedule_cron` uses a 5-field format: `minute hour day_of_month month day_of_week` (e.g. `0 3 * * *` = daily at 03:00). The scheduler evaluates every minute and starts a job when the cron matches and there is no running or pending job for that pipeline.

## Package layout

- **`packages/server`:** Scheduler, Drizzle schema (SQLite), pipeline registry, job runner, and Hono routes. Exports `createOpenCodeServer`, `ServerRoutes`, `getDb`, `getDefaultDbPath`, and pipeline registration.

## SDK and scripts

The OpenCode SDK (`@opencode-ai/sdk`) uses a base URL for the running server. When the server is started with `--daemon`, the same base URL serves both the main API and the Server API. From scripts or a dashboard you can call:

- `fetch(\`${baseUrl}/server/status\`)` — daemon summary
- `fetch(\`${baseUrl}/server/pipelines\`)` — list pipelines
- `fetch(\`${baseUrl}/server/jobs\`)` — list jobs
- etc.

Use the same authentication as the rest of the API (e.g. `OPENCODE_SERVER_PASSWORD` basic auth). The OpenAPI spec can be extended later to include `/server` routes for generated clients.
