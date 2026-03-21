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
  /** 0 = sem limite; >0 = máximo de jobs criados por dia UTC (cron + Run manual). */
  maxRunsPerDay: integer("max_runs_per_day").notNull().default(0),
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
  relatedOpportunityId: text("related_opportunity_id"),
  createdAt: integer("created_at").notNull(),
})

// ─── Opportunity System ───────────────────────────────────────────────────────

export const oppMarketData = sqliteTable("opp_market_data", {
  id: text("id").primaryKey(),
  assetType: text("asset_type").notNull(),      // 'crypto'|'stock'|'forex'|'trend'
  symbol: text("symbol").notNull(),
  price: real("price"),
  change24h: real("change_24h"),
  volume24h: real("volume_24h"),
  marketCap: real("market_cap"),
  source: text("source").notNull(),             // 'coingecko'|'yahoo'|'google-trends'
  rawJson: text("raw_json"),
  collectedAt: integer("collected_at").notNull(),
  createdAt: integer("created_at").notNull(),
})

export const oppNiches = sqliteTable("opp_niches", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  parentNicheId: text("parent_niche_id"),
  avgRewardUsd: real("avg_reward_usd"),
  opportunityCount: integer("opportunity_count").notNull().default(0),
  trendScore: real("trend_score"),              // 0..100
  aiAgentFit: real("ai_agent_fit"),             // 0..100
  keywords: text("keywords"),                   // JSON array
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
})

export const oppNicheRelations = sqliteTable("opp_niche_relations", {
  id: text("id").primaryKey(),
  fromNicheId: text("from_niche_id").notNull().references(() => oppNiches.id),
  toNicheId: text("to_niche_id").notNull().references(() => oppNiches.id),
  relationType: text("relation_type").notNull(), // 'value-chain'|'complement'|'prerequisite'|'competes'
  weight: real("weight").notNull(),              // 0..1
  reasoning: text("reasoning"),
  createdAt: integer("created_at").notNull(),
})

export const oppOpportunities = sqliteTable("opp_opportunities", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),                 // 'bug-bounty'|'freelance'|'oss-bounty'|'content'|'grant'
  nicheId: text("niche_id").references(() => oppNiches.id),
  sourcePlatform: text("source_platform").notNull(),
  externalId: text("external_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  url: text("url"),
  rewardMin: real("reward_min"),
  rewardMax: real("reward_max"),
  rewardCurrency: text("reward_currency").notNull().default("USD"),
  rewardType: text("reward_type"),              // 'fixed'|'range'|'tip'|'equity'|'token'
  skillsRequired: text("skills_required"),      // JSON array
  difficulty: text("difficulty"),               // 'easy'|'medium'|'hard'|'expert'
  deadline: integer("deadline"),
  status: text("status").notNull().default("new"), // 'new'|'scored'|'shortlisted'|'applied'|'won'|'expired'|'ignored'
  score: real("score"),                         // 0..100
  scoreReason: text("score_reason"),
  llmAnalysis: text("llm_analysis"),            // JSON análise completa
  workspaceStrategy: text("workspace_strategy"), // 'fork-temp'|'dedicated-repo'|'extend-repo'
  workspaceRepoUrl: text("workspace_repo_url"),  // URL do repo dedicado se criado
  firstSeenAt: integer("first_seen_at").notNull(),
  lastSeenAt: integer("last_seen_at").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
})

export const oppAnalyses = sqliteTable("opp_analyses", {
  id: text("id").primaryKey(),
  analysisType: text("analysis_type").notNull(), // 'opportunity-score'|'niche-map'|'market-digest'|'value-chain'
  scope: text("scope").notNull(),               // 'opportunity'|'niche'|'market'|'portfolio'
  scopeId: text("scope_id"),
  promptHash: text("prompt_hash"),
  llmModel: text("llm_model"),
  llmTokens: integer("llm_tokens"),
  llmCostUsd: real("llm_cost_usd"),
  inputSummary: text("input_summary"),
  output: text("output"),
  structured: text("structured"),               // JSON parseado
  qualityScore: real("quality_score"),
  createdAt: integer("created_at").notNull(),
})

export const oppTelegramReports = sqliteTable("opp_telegram_reports", {
  id: text("id").primaryKey(),
  reportType: text("report_type").notNull(),    // 'daily'|'weekly'|'alert'|'digest'
  chatId: text("chat_id").notNull(),
  messageId: text("message_id"),
  contentHash: text("content_hash").notNull(),
  opportunityIds: text("opportunity_ids"),       // JSON array
  sentAt: integer("sent_at"),
  createdAt: integer("created_at").notNull(),
  // Ciclo de atividade — o que foi analisado
  digest: text("digest"),                       // texto do relatório enviado
  oppCount: integer("opp_count"),               // qtd oportunidades analisadas
  marketCount: integer("market_count"),          // qtd ativos de mercado
  queueItemId: text("queue_item_id"),           // link para daemon_queue (duração, triggered_by)
})

export const oppSubmissions = sqliteTable("opp_submissions", {
  id: text("id").primaryKey(),
  opportunityId: text("opportunity_id").notNull().references(() => oppOpportunities.id),
  platform: text("platform").notNull(),           // 'github'|'gitcoin'|'freelance-email'|'manual'
  submissionType: text("submission_type").notNull(), // 'pr'|'proposal'|'email'|'gitcoin-bid'
  externalUrl: text("external_url"),              // URL do PR, proposta Gitcoin, etc.
  status: text("status").notNull().default("draft"), // 'draft'|'pending-approval'|'submitted'|'accepted'|'rejected'|'paid'
  proposalText: text("proposal_text"),            // texto gerado para aprovar no painel
  repoUrl: text("repo_url"),                      // repo usado (dedicated-repo)
  prNumber: integer("pr_number"),                 // número do PR no GitHub
  approvedAt: integer("approved_at"),
  submittedAt: integer("submitted_at"),
  outcomeCheckedAt: integer("outcome_checked_at"),
  rewardUsd: real("reward_usd"),                  // valor efetivamente recebido
  errorMessage: text("error_message"),
  triggeredBy: text("triggered_by"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
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

/** Discovery reports: project/venture idea analysis (project_discovery pipeline or manual enqueue). */
export const discoveryReports = sqliteTable("discovery_reports", {
  id: text("id").primaryKey(),
  idea_text: text("idea_text").notNull(),
  status: text("status").notNull().default("pending"),
  report_md: text("report_md"),
  report_json: text("report_json"),
  session_id: text("session_id"),
  job_id: text("job_id"),
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at").notNull(),
})

/** Agent learnings: RAG knowledge base built from submission outcomes and execution patterns. */
export const agentLearnings = sqliteTable("agent_learnings", {
  id: text("id").primaryKey(),
  category: text("category").notNull(), // 'skill' | 'niche' | 'platform' | 'pattern' | 'error_pattern' | 'dev-cycle' | 'repo'
  key: text("key").notNull(),           // unique slug identifier
  title: text("title").notNull(),
  body: text("body").notNull(),         // the learning content
  confidence: real("confidence").notNull().default(0.5), // 0.0 - 1.0
  source: text("source"),              // activity or event that generated it
  relatedNicheId: text("related_niche_id").references(() => oppNiches.id),
  positiveCount: integer("positive_count").notNull().default(0),
  negativeCount: integer("negative_count").notNull().default(0),
  tags: text("tags"),                   // JSON string[]
  /** How many times this learning was injected as context for a job. */
  usedCount: integer("used_count").notNull().default(0),
  /** How many jobs that used this learning completed successfully. */
  helpedCount: integer("helped_count").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
})

/** Project specs: structured domain context for AI agents (ontology, contracts, constraints, architecture). */
export const projectSpecs = sqliteTable("project_specs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  ontologyJson: text("ontology_json"),       // JSON: [{term, definition, canonical_name}]
  contracts: text("contracts"),              // TypeScript interfaces (freeform)
  constraintsJson: text("constraints_json"), // JSON: [{rule, reason}]
  architecture: text("architecture"),        // Mermaid diagram code
  context: text("context"),                  // Background business context
  linkedProjectId: text("linked_project_id"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
})

/** Closed dev cycle: labeled GitHub issues or opportunities (spec → TDD → impl → docs → PR). */
export const repoIssueJobs = sqliteTable("repo_issue_jobs", {
  id: text("id").primaryKey(),
  pipelineId: text("pipeline_id").references(() => daemonPipelines.id),
  opportunityId: text("opportunity_id").references(() => oppOpportunities.id),
  repoFullName: text("repo_full_name").notNull(),
  issueNumber: integer("issue_number"),
  issueTitle: text("issue_title").notNull(),
  issueBody: text("issue_body"),
  status: text("status").notNull().default("pending"),
  specJson: text("spec_json"),
  testFiles: text("test_files"),
  docsMarkdown: text("docs_markdown"),
  branchName: text("branch_name"),
  forkRepoFullName: text("fork_repo_full_name"),
  upstreamOwner: text("upstream_owner"),
  upstreamRepo: text("upstream_repo"),
  localWorkPath: text("local_work_path"),
  prUrl: text("pr_url"),
  prNumber: integer("pr_number"),
  prDraft: integer("pr_draft").notNull().default(1),
  baseBranch: text("base_branch").notNull().default("main"),
  useFork: integer("use_fork").notNull().default(0),
  /** 1 = must pass all tests before PR (default); 0 = open draft PR even if tests fail after max retries */
  requirePassingTests: integer("require_passing_tests").notNull().default(1),
  /** CLI session ID from opencode.db (linked after spawnOpenCode). */
  session_id: text("session_id"),
  /** Truncated stdout+stderr from spawnOpenCode (max ~10 KB). */
  cli_output: text("cli_output"),
  /** Timestamp when dev_cycle_learning extracted learnings for this job. */
  learning_extracted_at: integer("learning_extracted_at"),
  /** PR merge outcome: merged | rejected | closed. */
  pr_outcome: text("pr_outcome"),
  /** Timestamp when pr_outcome was recorded. */
  pr_outcome_at: integer("pr_outcome_at"),
  /** Concatenated review comments from the PR (for feeding into learning). */
  pr_review_comments: text("pr_review_comments"),
  /** Number of times the pipeline has auto-retried this job after failure. */
  retry_count: integer("retry_count").notNull().default(0),
  /** JSON array of agentLearning IDs that were injected as context for this job (for helpedCount tracking). */
  used_learning_ids: text("used_learning_ids"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
})

/** Self-improvement proposals: issues auto-generated by the self_improvement pipeline. */
export const selfImprovementProposals = sqliteTable("self_improvement_proposals", {
  id: text("id").primaryKey(),
  pipeline_run_id: text("pipeline_run_id"),
  issue_number: integer("issue_number"),
  repo: text("repo").notNull(),
  title: text("title").notNull(),
  category: text("category").notNull(), // bug-fix | optimization | new-feature | new-domain
  status: text("status").notNull().default("proposed"), // proposed | approved | implementing | completed | rejected
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at").notNull(),
})
