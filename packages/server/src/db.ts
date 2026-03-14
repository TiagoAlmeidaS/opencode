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
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_queue_status_priority ON daemon_queue(status, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_queue_depends ON daemon_queue(depends_on);
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
