import { Database as BunDatabase } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import path from "path"
import * as schema from "./schema"

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS daemon_pipelines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  strategy TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  schedule_cron TEXT NOT NULL DEFAULT '0 3 * * *',
  enabled INTEGER NOT NULL DEFAULT 1,
  max_retries INTEGER NOT NULL DEFAULT 3,
  retry_delay_sec INTEGER NOT NULL DEFAULT 300,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS daemon_jobs (
  id TEXT PRIMARY KEY,
  pipeline_id TEXT NOT NULL REFERENCES daemon_pipelines(id),
  status TEXT NOT NULL DEFAULT 'pending',
  attempt INTEGER NOT NULL DEFAULT 1,
  started_at INTEGER,
  completed_at INTEGER,
  input_json TEXT,
  output_json TEXT,
  error_message TEXT,
  error_stack TEXT,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS daemon_content (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES daemon_jobs(id),
  pipeline_id TEXT NOT NULL REFERENCES daemon_pipelines(id),
  content_type TEXT NOT NULL,
  platform TEXT NOT NULL,
  title TEXT,
  slug TEXT,
  url TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  word_count INTEGER,
  llm_model TEXT,
  llm_tokens_used INTEGER,
  llm_cost_usd REAL,
  content_hash TEXT,
  created_at INTEGER NOT NULL,
  published_at INTEGER
);
CREATE TABLE IF NOT EXISTS daemon_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT,
  pipeline_id TEXT NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  context_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS daemon_proposals (
  id TEXT PRIMARY KEY,
  pipeline_id TEXT REFERENCES daemon_pipelines(id),
  action_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  confidence REAL NOT NULL,
  risk_level TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  proposed_config TEXT,
  metrics_snapshot TEXT,
  auto_approvable INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  executed_at INTEGER,
  expires_at INTEGER
);
CREATE TABLE IF NOT EXISTS daemon_revenue (
  id TEXT PRIMARY KEY,
  content_id TEXT REFERENCES daemon_content(id),
  pipeline_id TEXT NOT NULL REFERENCES daemon_pipelines(id),
  source TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  period_start INTEGER NOT NULL,
  period_end INTEGER NOT NULL,
  external_id TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS daemon_goals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  metric_type TEXT NOT NULL,
  target_value REAL NOT NULL,
  target_unit TEXT NOT NULL DEFAULT 'USD',
  period TEXT NOT NULL DEFAULT 'monthly',
  pipeline_id TEXT REFERENCES daemon_pipelines(id),
  current_value REAL NOT NULL DEFAULT 0,
  last_measured INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  priority INTEGER NOT NULL DEFAULT 1,
  deadline INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_pipeline_status ON daemon_jobs(pipeline_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON daemon_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_job ON daemon_logs(job_id, created_at);
CREATE INDEX IF NOT EXISTS idx_logs_pipeline ON daemon_logs(pipeline_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON daemon_proposals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_goals_status ON daemon_goals(status);
CREATE TABLE IF NOT EXISTS memory_extractions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  raw_memory TEXT NOT NULL,
  session_summary TEXT NOT NULL,
  source_updated_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memory_extractions_session ON memory_extractions(session_id);
CREATE INDEX IF NOT EXISTS idx_memory_extractions_source_updated ON memory_extractions(source_updated_at DESC);
CREATE TABLE IF NOT EXISTS discovery_reports (
  id TEXT PRIMARY KEY,
  idea_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  report_md TEXT,
  report_json TEXT,
  session_id TEXT,
  job_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_discovery_reports_status ON discovery_reports(status);
CREATE INDEX IF NOT EXISTS idx_discovery_reports_created ON discovery_reports(created_at DESC);
CREATE TABLE IF NOT EXISTS daemon_queue (
  id TEXT PRIMARY KEY,
  activity_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 5,
  depends_on TEXT,
  locked_by TEXT,
  locked_at INTEGER,
  input_json TEXT NOT NULL DEFAULT '{}',
  output_json TEXT,
  error_message TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  duration_ms INTEGER,
  triggered_by TEXT,
  related_opportunity_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_queue_status_priority ON daemon_queue(status, priority, created_at);
  CREATE INDEX IF NOT EXISTS idx_queue_depends ON daemon_queue(depends_on);

CREATE TABLE IF NOT EXISTS opp_market_data (
  id           TEXT PRIMARY KEY,
  asset_type   TEXT NOT NULL,
  symbol       TEXT NOT NULL,
  price        REAL,
  change_24h   REAL,
  volume_24h   REAL,
  market_cap   REAL,
  source       TEXT NOT NULL,
  raw_json     TEXT,
  collected_at INTEGER NOT NULL,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_market_data_symbol ON opp_market_data(symbol, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_data_type ON opp_market_data(asset_type, collected_at DESC);
CREATE TABLE IF NOT EXISTS opp_niches (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL UNIQUE,
  display_name      TEXT NOT NULL,
  description       TEXT,
  parent_niche_id   TEXT REFERENCES opp_niches(id),
  avg_reward_usd    REAL,
  opportunity_count INTEGER NOT NULL DEFAULT 0,
  trend_score       REAL,
  ai_agent_fit      REAL,
  keywords          TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_niches_fit ON opp_niches(ai_agent_fit DESC);
CREATE TABLE IF NOT EXISTS opp_niche_relations (
  id            TEXT PRIMARY KEY,
  from_niche_id TEXT NOT NULL REFERENCES opp_niches(id),
  to_niche_id   TEXT NOT NULL REFERENCES opp_niches(id),
  relation_type TEXT NOT NULL,
  weight        REAL NOT NULL,
  reasoning     TEXT,
  created_at    INTEGER NOT NULL,
  UNIQUE(from_niche_id, to_niche_id, relation_type)
);
CREATE TABLE IF NOT EXISTS opp_opportunities (
  id              TEXT PRIMARY KEY,
  type            TEXT NOT NULL,
  niche_id        TEXT REFERENCES opp_niches(id),
  source_platform TEXT NOT NULL,
  external_id     TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  url             TEXT,
  reward_min      REAL,
  reward_max      REAL,
  reward_currency TEXT NOT NULL DEFAULT 'USD',
  reward_type     TEXT,
  skills_required TEXT,
  difficulty      TEXT,
  deadline        INTEGER,
  status          TEXT NOT NULL DEFAULT 'new',
  score           REAL,
  score_reason    TEXT,
  llm_analysis    TEXT,
  first_seen_at   INTEGER NOT NULL,
  last_seen_at    INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  UNIQUE(source_platform, external_id)
);
CREATE INDEX IF NOT EXISTS idx_opp_status_score ON opp_opportunities(status, score DESC);
CREATE INDEX IF NOT EXISTS idx_opp_niche ON opp_opportunities(niche_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_opp_deadline ON opp_opportunities(deadline ASC);
CREATE TABLE IF NOT EXISTS opp_analyses (
  id             TEXT PRIMARY KEY,
  analysis_type  TEXT NOT NULL,
  scope          TEXT NOT NULL,
  scope_id       TEXT,
  prompt_hash    TEXT,
  llm_model      TEXT,
  llm_tokens     INTEGER,
  llm_cost_usd   REAL,
  input_summary  TEXT,
  output         TEXT,
  structured     TEXT,
  quality_score  REAL,
  created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analyses_type ON opp_analyses(analysis_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_scope ON opp_analyses(scope, scope_id);
CREATE TABLE IF NOT EXISTS opp_telegram_reports (
  id              TEXT PRIMARY KEY,
  report_type     TEXT NOT NULL,
  chat_id         TEXT NOT NULL,
  content_hash    TEXT NOT NULL,
  message_id      TEXT,
  opportunity_ids TEXT,
  sent_at         INTEGER,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_telegram_reports ON opp_telegram_reports(report_type, created_at DESC);
CREATE TABLE IF NOT EXISTS opp_submissions (
  id                  TEXT PRIMARY KEY,
  opportunity_id      TEXT NOT NULL REFERENCES opp_opportunities(id),
  platform            TEXT NOT NULL,
  submission_type     TEXT NOT NULL,
  external_url        TEXT,
  status              TEXT NOT NULL DEFAULT 'draft',
  proposal_text       TEXT,
  repo_url            TEXT,
  pr_number           INTEGER,
  approved_at         INTEGER,
  submitted_at        INTEGER,
  outcome_checked_at  INTEGER,
  reward_usd          REAL,
  error_message       TEXT,
  triggered_by        TEXT,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_submissions_opp    ON opp_submissions(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON opp_submissions(status, created_at DESC);
CREATE TABLE IF NOT EXISTS project_specs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  ontology_json TEXT,
  contracts TEXT,
  constraints_json TEXT,
  architecture TEXT,
  context TEXT,
  linked_project_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_project_specs_created ON project_specs(created_at DESC);
CREATE TABLE IF NOT EXISTS agent_learnings (
  id              TEXT PRIMARY KEY,
  category        TEXT NOT NULL,
  key             TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  confidence      REAL NOT NULL DEFAULT 0.5,
  source          TEXT,
  related_niche_id TEXT REFERENCES opp_niches(id),
  positive_count  INTEGER NOT NULL DEFAULT 0,
  negative_count  INTEGER NOT NULL DEFAULT 0,
  tags            TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_learnings_category ON agent_learnings(category, confidence DESC);
CREATE INDEX IF NOT EXISTS idx_learnings_key ON agent_learnings(key);
CREATE TABLE IF NOT EXISTS repo_issue_jobs (
  id TEXT PRIMARY KEY,
  pipeline_id TEXT REFERENCES daemon_pipelines(id),
  opportunity_id TEXT REFERENCES opp_opportunities(id),
  repo_full_name TEXT NOT NULL,
  issue_number INTEGER,
  issue_title TEXT NOT NULL,
  issue_body TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  spec_json TEXT,
  test_files TEXT,
  docs_markdown TEXT,
  branch_name TEXT,
  fork_repo_full_name TEXT,
  upstream_owner TEXT,
  upstream_repo TEXT,
  local_work_path TEXT,
  pr_url TEXT,
  pr_number INTEGER,
  pr_draft INTEGER NOT NULL DEFAULT 1,
  base_branch TEXT NOT NULL DEFAULT 'main',
  use_fork INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_repo_issue_jobs_status ON repo_issue_jobs(status);
CREATE INDEX IF NOT EXISTS idx_repo_issue_jobs_pipeline ON repo_issue_jobs(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_repo_issue_jobs_repo ON repo_issue_jobs(repo_full_name);
`

let state: { sqlite: BunDatabase | undefined; dbPath: string | null } = {
  sqlite: undefined,
  dbPath: null,
}

export type ServerDb = ReturnType<typeof getDb>

export function getDb(dbPath: string) {
  if (state.sqlite && state.dbPath === dbPath) {
    return drizzle({ client: state.sqlite, schema })
  }
  state.dbPath = dbPath
  const sqlite = new BunDatabase(dbPath, { create: true })
  state.sqlite = sqlite
  sqlite.run("PRAGMA journal_mode = WAL")
  sqlite.run("PRAGMA busy_timeout = 5000")
  sqlite.run("PRAGMA foreign_keys = ON")
  for (const stmt of MIGRATION_SQL.split(";").filter(Boolean)) {
    const s = stmt.trim()
    if (s) sqlite.run(s)
  }
  // ALTER TABLE migrations — idempotent (ignoram erro se coluna já existe)
  const alterMigrations = [
    `CREATE TABLE IF NOT EXISTS repo_issue_jobs (
  id TEXT PRIMARY KEY,
  pipeline_id TEXT REFERENCES daemon_pipelines(id),
  opportunity_id TEXT REFERENCES opp_opportunities(id),
  repo_full_name TEXT NOT NULL,
  issue_number INTEGER,
  issue_title TEXT NOT NULL,
  issue_body TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  spec_json TEXT,
  test_files TEXT,
  docs_markdown TEXT,
  branch_name TEXT,
  fork_repo_full_name TEXT,
  upstream_owner TEXT,
  upstream_repo TEXT,
  local_work_path TEXT,
  pr_url TEXT,
  pr_number INTEGER,
  pr_draft INTEGER NOT NULL DEFAULT 1,
  base_branch TEXT NOT NULL DEFAULT 'main',
  use_fork INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`,
    "CREATE INDEX IF NOT EXISTS idx_repo_issue_jobs_status ON repo_issue_jobs(status)",
    "CREATE INDEX IF NOT EXISTS idx_repo_issue_jobs_pipeline ON repo_issue_jobs(pipeline_id)",
    "CREATE INDEX IF NOT EXISTS idx_repo_issue_jobs_repo ON repo_issue_jobs(repo_full_name)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_repo_issue_jobs_opp ON repo_issue_jobs(opportunity_id) WHERE opportunity_id IS NOT NULL",
    "ALTER TABLE opp_opportunities ADD COLUMN workspace_strategy TEXT",
    "ALTER TABLE opp_opportunities ADD COLUMN workspace_repo_url TEXT",
    "ALTER TABLE opp_telegram_reports ADD COLUMN digest TEXT",
    "ALTER TABLE opp_telegram_reports ADD COLUMN opp_count INTEGER",
    "ALTER TABLE opp_telegram_reports ADD COLUMN market_count INTEGER",
    "ALTER TABLE opp_telegram_reports ADD COLUMN queue_item_id TEXT",
    "ALTER TABLE daemon_queue ADD COLUMN related_opportunity_id TEXT",
    "CREATE INDEX IF NOT EXISTS idx_queue_opp_id ON daemon_queue(related_opportunity_id, activity_type, status)",
    "ALTER TABLE daemon_pipelines ADD COLUMN max_runs_per_day INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE repo_issue_jobs ADD COLUMN require_passing_tests INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE repo_issue_jobs ADD COLUMN session_id TEXT",
    "ALTER TABLE repo_issue_jobs ADD COLUMN cli_output TEXT",
    "ALTER TABLE repo_issue_jobs ADD COLUMN learning_extracted_at INTEGER",
    "ALTER TABLE repo_issue_jobs ADD COLUMN pr_outcome TEXT",
    "ALTER TABLE repo_issue_jobs ADD COLUMN pr_outcome_at INTEGER",
    "ALTER TABLE repo_issue_jobs ADD COLUMN pr_review_comments TEXT",
    `CREATE TABLE IF NOT EXISTS self_improvement_proposals (
  id TEXT PRIMARY KEY,
  pipeline_run_id TEXT,
  issue_number INTEGER,
  repo TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`,
    "CREATE INDEX IF NOT EXISTS idx_si_proposals_status ON self_improvement_proposals(status)",
    "CREATE INDEX IF NOT EXISTS idx_si_proposals_repo ON self_improvement_proposals(repo)",
    "ALTER TABLE repo_issue_jobs ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0",
  ]
  for (const stmt of alterMigrations) {
    try {
      sqlite.run(stmt)
    } catch {
      /* column already exists */
    }
  }
  return drizzle({ client: sqlite, schema })
}

export function closeDb() {
  if (state.sqlite) {
    state.sqlite.close()
    state.sqlite = undefined
    state.dbPath = null
  }
}

export function getDefaultDbPath(dataDir: string): string {
  return path.join(dataDir, "opencode-server.db")
}
