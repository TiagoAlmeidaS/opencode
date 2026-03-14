# OpenCode Server (daemon)

OpenCode Server is an optional layer that extends `opencode serve` with a **scheduler** and **pipelines**: background jobs run on a cron schedule, with a SQLite-backed API for pipelines, jobs, goals, proposals, and metrics.

## Enabling

- **CLI:** `opencode serve --daemon`
- **Config:** In `opencode.json` (or global config), set `server.daemon: true`. The config schema includes `server.daemon`; other `server` options (port, hostname, mdns, cors) apply to the same serve command.

When enabled, the same process that serves the OpenCode API also runs the scheduler and exposes the Server API under the `/server` prefix.

## API prefix

All Server endpoints are under **`/server`**. Base URL example: `http://localhost:4096/server`.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/server/status` | Summary: pipelines (total, enabled), jobs (running), proposals (pending), revenue (30d), goals (active) |
| GET | `/server/pipelines` | List pipelines (optional query `?enabled=true`) |
| GET | `/server/pipelines/strategies` | List registered pipeline strategy names |
| POST | `/server/pipelines` | Create pipeline (body: `name`, `strategy`, `config_json?`, `schedule_cron?`) |
| GET | `/server/pipelines/:id` | Get pipeline by id |
| POST | `/server/pipelines/:id/enable` | Enable pipeline |
| POST | `/server/pipelines/:id/disable` | Disable pipeline |
| GET | `/server/jobs` | List jobs (optional `?pipeline_id=`, `?status=`) |
| GET | `/server/jobs/:id` | Get job by id |
| GET | `/server/goals` | List goals |
| POST | `/server/goals` | Create goal (body: `name`, `metric_type`, `target_value`, etc.) |
| GET | `/server/proposals` | List proposals |
| GET | `/server/dashboard` | Dashboard metrics (optional `?days=30`) |
| GET | `/server/logs` | List daemon logs (optional `?pipeline_id=`, `?limit=100`) |

## Config

- **Database:** SQLite file at `{dataDir}/opencode-server.db` by default. `dataDir` is the OpenCode data directory (e.g. XDG data).
- **Tick interval:** Scheduler checks cron every 60 seconds. No config override in this version.

## Pipeline strategies

Built-in strategies are registered by the `@opencode-ai/server` package. The default placeholder is **`noop`**. Additional strategies (e.g. `seo_blog`, `metrics_collector`, `strategy_analyzer`) can be added as built-ins or via plugins.

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
