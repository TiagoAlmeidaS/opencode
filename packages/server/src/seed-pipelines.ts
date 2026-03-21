/**
 * Seeds default pipelines on first run.
 * Only creates pipelines that don't already exist (by strategy).
 * Disable via SEED_DEFAULT_PIPELINES=false.
 */
import { ulid } from "ulid"
import { eq } from "drizzle-orm"
import type { ServerDb } from "./db"
import { daemonPipelines } from "./schema"

const DEFAULTS: Array<{
  strategy: string
  name: string
  scheduleCron: string
  configJson?: Record<string, unknown>
}> = [
  // Coleta de dados — precisa rodar ANTES do relatório ter conteúdo
  {
    strategy: "opportunity-collector",
    name: "Coletor de Oportunidades",
    scheduleCron: "0 */4 * * *", // a cada 4h
    configJson: { sources: ["github-bounties", "freelance-jobs", "content-jobs", "immunefi-bounties", "hackerone-programs"], limit_per_source: 30 },
  },
  {
    strategy: "market-data-collector",
    name: "Coletor de Mercado",
    scheduleCron: "0 * * * *", // a cada hora
    configJson: {},
  },
  {
    strategy: "opportunity-analyst",
    name: "Analista de Oportunidades",
    scheduleCron: "30 */2 * * *", // a cada 2h (offset 30min)
    configJson: { batch_size: 20 },
  },
  // Relatórios — consomem os dados coletados
  {
    strategy: "daily-opportunity-report",
    name: "Relatório Diário",
    scheduleCron: "0 8 * * *",
    configJson: { top_n: 10, period_hours: 24 },
  },
  {
    strategy: "weekly-opportunity-report",
    name: "Relatório Semanal",
    scheduleCron: "0 9 * * 1",
    configJson: { top_n: 20 },
  },
  // Dev cycle learning + session cleanup
  {
    strategy: "dev_cycle_learning",
    name: "Dev Cycle Learning",
    scheduleCron: "0 * * * *", // hourly — catch all completed/failed jobs
    configJson: { since_days: 7, max_jobs: 20 },
  },
  {
    strategy: "session_cleanup",
    name: "Session Cleanup (7d retention)",
    scheduleCron: "0 4 * * *", // daily 04:00 (after memory_extract + learning)
    configJson: { retention_days: 7 },
  },
  // Memory pipeline chain (weekly, Sunday)
  {
    strategy: "memory_extract",
    name: "Memory Extract (Phase 1)",
    scheduleCron: "0 2 * * *", // daily 02:00
    configJson: {},
  },
  {
    strategy: "memory_consolidation",
    name: "Memory Consolidation (Phase 2)",
    scheduleCron: "0 3 * * 0", // Sunday 03:00
    configJson: {},
  },
  {
    strategy: "memory_rag_index",
    name: "Memory RAG Index (Phase 3)",
    scheduleCron: "0 4 * * 0", // Sunday 04:00 (after consolidation)
    configJson: {},
  },
  // Strategy analyzer (weekly, Monday)
  {
    strategy: "strategy_analyzer",
    name: "Strategy Analyzer",
    scheduleCron: "0 6 * * 1", // Monday 06:00 (after memory pipelines)
    configJson: {
      analysis_window_days: 30,
      min_confidence_for_auto_approve: 0.85,
      max_auto_approve_risk: "low",
    },
  },
  {
    strategy: "self_improvement",
    name: "Self-Improvement Pipeline",
    scheduleCron: "0 7 * * 1", // Monday 07:00 (after strategy_analyzer)
    configJson: {
      target_repo: "TiagoAlmeidaS/opencode",
      since_days: 7,
      max_proposals: 3,
      issue_label: "self-improvement",
      approved_label: "approved",
    },
  },
]

export async function seedDefaultPipelines(db: ServerDb) {
  if (process.env.SEED_DEFAULT_PIPELINES === "false") return
  const now = Math.floor(Date.now() / 1000)
  for (const def of DEFAULTS) {
    const [existing] = await db
      .select({ id: daemonPipelines.id })
      .from(daemonPipelines)
      .where(eq(daemonPipelines.strategy, def.strategy))
      .limit(1)
    if (existing) continue

    await db.insert(daemonPipelines).values({
      id: ulid(),
      name: def.name,
      strategy: def.strategy,
      configJson: JSON.stringify(def.configJson ?? {}),
      scheduleCron: def.scheduleCron,
      enabled: 1,
      maxRetries: 3,
      retryDelaySec: 300,
      maxRunsPerDay: 0,
      createdAt: now,
      updatedAt: now,
    })
  }
}
