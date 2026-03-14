# Runbook: OpenCode Server — Goals and proposal executor

## Goals

- **List:** `GET /server/goals`
- **Create:** `POST /server/goals` with body: `name`, `metric_type`, `target_value`, optional `description`, `target_unit`, `period`, `pipeline_id`
- **Metric types:** `revenue`, `content_count`, `pageviews`, `clicks`, `ctr`, `subscribers`, `cost_limit`, `custom`
- **Period:** `daily`, `weekly`, `monthly`, `quarterly`, `yearly`

The **metrics_collector** pipeline updates `current_value` and `last_measured` for active goals (e.g. revenue from `daemon_revenue`).

## Proposals

- **List:** `GET /server/proposals`
- **Get one:** `GET /server/proposals/:id`
- **Approve:** `POST /server/proposals/:id/approve` — sets status to `approved`; the scheduler's proposal executor will set it to `executed` on the next tick.
- **Reject:** `POST /server/proposals/:id/reject`

The **strategy_analyzer** pipeline creates proposals. The scheduler runs **execute_pending** each tick and marks approved proposals as executed (minimal implementation; full executor can apply actions like create_pipeline, scale_up, etc.).
