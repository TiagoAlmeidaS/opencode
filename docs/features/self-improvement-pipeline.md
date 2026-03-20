# Self-Improvement Pipeline

## Overview

The `self_improvement` pipeline enables the system to autonomously identify its own weaknesses and propose concrete improvements as GitHub issues. A human reviews and approves proposals before they enter the dev cycle, ensuring safety and quality control.

## How It Works

```
┌─────────────────────────┐
│   self_improvement       │  (weekly cron: Mon 06:00)
│   pipeline               │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  1. Collect data         │
│  - Failed repo_issue_jobs│
│  - agent_learnings       │
│  - daemon_queue errors   │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  2. LLM analysis         │
│  - System + structured   │
│    prompt                │
│  - Returns JSON proposals│
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  3. Deduplicate          │
│  - Check GitHub for      │
│    existing open issues  │
│    with same title       │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  4. Create GitHub issues │
│  - Label: self-improvement│
│  - Body: motivation +    │
│    technical proposal    │
│  - Record in             │
│    self_improvement_     │
│    proposals table       │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  5. Human reviews        │
│  - Adds 'approved' label │
│    to accept             │
│  - Or closes issue to    │
│    reject                │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  6. repo_issue_worker    │
│  - Picks up approved     │
│    issues normally       │
│  - Dev cycle runs        │
│    (implement → PR)      │
└─────────────────────────┘
```

## Configuration

The pipeline is registered as a seed pipeline with:

```json
{
  "target_repo": "TiagoAlmeidaS/opencode",
  "since_days": 7,
  "max_proposals": 3,
  "issue_label": "self-improvement",
  "approved_label": "approved"
}
```

| Field | Description | Default |
|-------|-------------|---------|
| `target_repo` | GitHub repo for issue creation (required) | — |
| `since_days` | Look-back window for data collection | `7` |
| `max_proposals` | Max issues per run | `3` |
| `issue_label` | Label applied to auto-generated issues | `self-improvement` |
| `approved_label` | Label required before dev cycle picks up the issue | `approved` |

## Human Approval Gate

Issues created by this pipeline carry only the `self-improvement` label. The `repo_issue_worker` pipeline will **skip** any issue that has `self-improvement` but lacks `approved`.

To approve a proposal:
1. Review the issue on GitHub
2. Add the `approved` label
3. The next `repo_issue_worker` run will pick it up

To reject:
- Close the issue, or simply don't add `approved`

## Proposal Categories

| Category | Description |
|----------|-------------|
| `bug-fix` | Fix recurring failures or errors |
| `optimization` | Improve performance, reduce cost, increase reliability |
| `new-feature` | Add capability that prevents observed issues |
| `new-domain` | Explore a new area based on observed patterns |

## Database Table

`self_improvement_proposals` tracks all proposals:

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | ULID |
| `pipeline_run_id` | TEXT | Which pipeline job created it |
| `issue_number` | INTEGER | GitHub issue number |
| `repo` | TEXT | Target repository |
| `title` | TEXT | Proposal title |
| `category` | TEXT | One of the categories above |
| `status` | TEXT | `proposed` → `approved` → `implementing` → `completed` / `rejected` |
| `created_at` | INTEGER | Unix timestamp |
| `updated_at` | INTEGER | Unix timestamp |

## Relation to Other Pipelines

- **`dev_cycle_learning`**: Produces `agent_learnings` that feed into self-improvement analysis
- **`repo_issue_worker`**: Picks up approved self-improvement issues for implementation
- **`session_cleanup`**: Cleans up CLI sessions after retention period

## Files

- `packages/server/src/pipelines/self_improvement.ts` — Pipeline implementation
- `packages/server/src/github-utils.ts` — GitHub API utilities (issue creation, dedup)
- `packages/server/src/schema.ts` — `selfImprovementProposals` table definition
- `packages/server/src/pipelines/repo_issue_worker.ts` — Gate logic for approved label
- `packages/server/src/seed-pipelines.ts` — Seed entry
