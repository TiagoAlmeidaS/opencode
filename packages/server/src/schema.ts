import {
  sqliteTable,
  text,
  integer,
  real,
} from "drizzle-orm/sqlite-core"

export const daemonPipelines = sqliteTable("daemon_pipelines", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  strategy: text("strategy").notNull(),
  configJson: text("config_json").notNull().default("{}"),
  scheduleCron: text("schedule_cron").notNull().default("0 3 * * *"),
  enabled: integer("enabled").notNull().default(1),
  maxRetries: integer("max_retries").notNull().default(3),
  retryDelaySec: integer("retry_delay_sec").notNull().default(300),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
})

export const daemonJobs = sqliteTable("daemon_jobs", {
  id: text("id").primaryKey(),
  pipelineId: text("pipeline_id").notNull().references(() => daemonPipelines.id),
  status: text("status").notNull().default("pending"),
  attempt: integer("attempt").notNull().default(1),
  startedAt: integer("started_at"),
  completedAt: integer("completed_at"),
  inputJson: text("input_json"),
  outputJson: text("output_json"),
  errorMessage: text("error_message"),
  errorStack: text("error_stack"),
  durationMs: integer("duration_ms"),
  createdAt: integer("created_at").notNull(),
})

export const daemonContent = sqliteTable("daemon_content", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull().references(() => daemonJobs.id),
  pipelineId: text("pipeline_id").notNull().references(() => daemonPipelines.id),
  contentType: text("content_type").notNull(),
  platform: text("platform").notNull(),
  title: text("title"),
  slug: text("slug"),
  url: text("url"),
  status: text("status").notNull().default("draft"),
  wordCount: integer("word_count"),
  llmModel: text("llm_model"),
  llmTokensUsed: integer("llm_tokens_used"),
  llmCostUsd: real("llm_cost_usd"),
  contentHash: text("content_hash"),
  createdAt: integer("created_at").notNull(),
  publishedAt: integer("published_at"),
})

export const daemonLogs = sqliteTable("daemon_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: text("job_id"),
  pipelineId: text("pipeline_id").notNull(),
  level: text("level").notNull(),
  message: text("message").notNull(),
  contextJson: text("context_json"),
  createdAt: integer("created_at").notNull(),
})

export const daemonProposals = sqliteTable("daemon_proposals", {
  id: text("id").primaryKey(),
  pipelineId: text("pipeline_id").references(() => daemonPipelines.id),
  actionType: text("action_type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  reasoning: text("reasoning").notNull(),
  confidence: real("confidence").notNull(),
  riskLevel: text("risk_level").notNull(),
  status: text("status").notNull().default("pending"),
  proposedConfig: text("proposed_config"),
  metricsSnapshot: text("metrics_snapshot"),
  autoApprovable: integer("auto_approvable").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  reviewedAt: integer("reviewed_at"),
  executedAt: integer("executed_at"),
  expiresAt: integer("expires_at"),
})

export const daemonRevenue = sqliteTable("daemon_revenue", {
  id: text("id").primaryKey(),
  contentId: text("content_id").references(() => daemonContent.id),
  pipelineId: text("pipeline_id").notNull().references(() => daemonPipelines.id),
  source: text("source").notNull(),
  amount: real("amount").notNull(),
  currency: text("currency").notNull().default("USD"),
  periodStart: integer("period_start").notNull(),
  periodEnd: integer("period_end").notNull(),
  externalId: text("external_id"),
  metadataJson: text("metadata_json"),
  createdAt: integer("created_at").notNull(),
})

export const daemonGoals = sqliteTable("daemon_goals", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  metricType: text("metric_type").notNull(),
  targetValue: real("target_value").notNull(),
  targetUnit: text("target_unit").notNull().default("USD"),
  period: text("period").notNull().default("monthly"),
  pipelineId: text("pipeline_id").references(() => daemonPipelines.id),
  currentValue: real("current_value").notNull().default(0),
  lastMeasured: integer("last_measured"),
  status: text("status").notNull().default("active"),
  priority: integer("priority").notNull().default(1),
  deadline: integer("deadline"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
})

export const daemonQueue = sqliteTable("daemon_queue", {
  id: text("id").primaryKey(),
  activityType: text("activity_type").notNull(),
  status: text("status").notNull().default("pending"),
  priority: integer("priority").notNull().default(5),
  dependsOn: text("depends_on"),
  lockedBy: text("locked_by"),
  lockedAt: integer("locked_at"),
  inputJson: text("input_json").notNull().default("{}"),
  outputJson: text("output_json"),
  errorMessage: text("error_message"),
  startedAt: integer("started_at"),
  completedAt: integer("completed_at"),
  durationMs: integer("duration_ms"),
  triggeredBy: text("triggered_by"),
  createdAt: integer("created_at").notNull(),
})

/** Stage-1 memory extractions per OpenCode session (for memory pipeline). */
export const memoryExtractions = sqliteTable("memory_extractions", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  rawMemory: text("raw_memory").notNull(),
  sessionSummary: text("session_summary").notNull(),
  sourceUpdatedAt: integer("source_updated_at").notNull(),
  createdAt: integer("created_at").notNull(),
})
