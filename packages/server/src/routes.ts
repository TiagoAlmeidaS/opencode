import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import z from "zod"
import type { ServerDb } from "./db"
import { daemonPipelines, daemonJobs, daemonGoals, daemonProposals, daemonRevenue, daemonLogs, daemonQueue, oppOpportunities, oppNiches, oppMarketData, oppNicheRelations, oppSubmissions, oppTelegramReports, discoveryReports, projectSpecs, agentLearnings, repoIssueJobs } from "./schema"
import { eq, desc, sql, gte, and, asc, inArray } from "drizzle-orm"
import { ulid } from "ulid"
import { listPipelineStrategies } from "./registry"
import { listActivities } from "./activity"
import { setRagConfig, search } from "./memory/rag"
import { compileSpecToPrompt } from "./spec-compiler"
import { executePendingProposals } from "./executor"

export interface ServerRoutesRagOpts {
  memoryEmbed?: (text: string) => Promise<number[]>
  qdrantUrl?: string
  /** Run a pipeline once by id (used by POST /server/pipelines/:id/run). */
  runPipelineNow?: (pipelineId: string) => Promise<{ jobId: string; ok: boolean; error?: string }>
  /** Run the first enabled pipeline with the given strategy (e.g. project_discovery). */
  runPipelineByStrategy?: (strategy: string) => Promise<{ jobId: string; ok: boolean; error?: string }>
}

export function ServerRoutes(db: ServerDb, ragOpts?: ServerRoutesRagOpts) {
  const app = new Hono()
  if (ragOpts?.memoryEmbed && ragOpts?.qdrantUrl) {
    setRagConfig({
      qdrantUrl: ragOpts.qdrantUrl,
      embed: ragOpts.memoryEmbed,
    })
  }

  app.get("/status", async (c) => {
    const [pipelines] = await db
      .select({
        total: sql<number>`count(*)`,
        enabled: sql<number>`sum(case when ${daemonPipelines.enabled} = 1 then 1 else 0 end)`,
      })
      .from(daemonPipelines)
    const [jobs] = await db
      .select({ running: sql<number>`sum(case when ${daemonJobs.status} = 'running' then 1 else 0 end)` })
      .from(daemonJobs)
    const [proposals] = await db
      .select({
        pending: sql<number>`sum(case when ${daemonProposals.status} = 'pending' then 1 else 0 end)`,
      })
      .from(daemonProposals)
    const [goals] = await db
      .select({
        active: sql<number>`sum(case when ${daemonGoals.status} = 'active' then 1 else 0 end)`,
        atRisk: sql<number>`0`,
      })
      .from(daemonGoals)
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 86400
    const [revenue] = await db
      .select({
        totalUsd30d: sql<number>`coalesce(sum(${daemonRevenue.amount}), 0)`,
      })
      .from(daemonRevenue)
      .where(gte(daemonRevenue.periodStart, thirtyDaysAgo))

    return c.json({
      pipelines: { total: Number(pipelines?.total ?? 0), enabled: Number(pipelines?.enabled ?? 0) },
      jobs: { running: Number(jobs?.running ?? 0) },
      content: { published_last_7d: 0 },
      proposals: { pending: Number(proposals?.pending ?? 0) },
      revenue: { total_usd_30d: Number(revenue?.totalUsd30d ?? 0) },
      goals: { active: Number(goals?.active ?? 0), at_risk: Number(goals?.atRisk ?? 0) },
    })
  })

  app.get("/pipelines", async (c) => {
    const enabledOnly = c.req.query("enabled") === "true"
    const rows = await db
      .select()
      .from(daemonPipelines)
      .orderBy(desc(daemonPipelines.createdAt))
    const list = enabledOnly ? rows.filter((r) => r.enabled === 1) : rows
    return c.json(list)
  })

  app.post("/pipelines", zValidator("json", z.object({
    name: z.string(),
    strategy: z.string(),
    config_json: z.record(z.string(), z.unknown()).optional(),
    schedule_cron: z.string().optional(),
    max_runs_per_day: z.number().int().min(0).max(500).optional(),
  })), async (c) => {
    const body = c.req.valid("json")
    const id = ulid()
    const now = Math.floor(Date.now() / 1000)
    await db.insert(daemonPipelines).values({
      id,
      name: body.name,
      strategy: body.strategy,
      configJson: JSON.stringify(body.config_json ?? {}),
      scheduleCron: body.schedule_cron ?? "0 3 * * *",
      enabled: 1,
      maxRetries: 3,
      retryDelaySec: 300,
      maxRunsPerDay: body.max_runs_per_day ?? 0,
      createdAt: now,
      updatedAt: now,
    })
    const [row] = await db.select().from(daemonPipelines).where(eq(daemonPipelines.id, id))
    return c.json(row, 201)
  })

  app.get("/pipelines/strategies", async (c) => {
    return c.json(listPipelineStrategies())
  })

  app.get("/pipelines/:id", async (c) => {
    const id = c.req.param("id")
    const [row] = await db.select().from(daemonPipelines).where(eq(daemonPipelines.id, id))
    if (!row) return c.json({ error: "Not found" }, 404)
    return c.json(row)
  })

  app.patch("/pipelines/:id", zValidator("json", z.object({
    name: z.string().optional(),
    schedule_cron: z.string().optional(),
    max_runs_per_day: z.number().int().min(0).max(500).optional(),
    config_json: z.record(z.string(), z.unknown()).optional(),
  })), async (c) => {
    const id = c.req.param("id")
    const body = c.req.valid("json")
    const [existing] = await db.select().from(daemonPipelines).where(eq(daemonPipelines.id, id))
    if (!existing) return c.json({ error: "Not found" }, 404)
    const now = Math.floor(Date.now() / 1000)
    const patch: Partial<typeof existing> = { updatedAt: now }
    if (body.name !== undefined) patch.name = body.name
    if (body.schedule_cron !== undefined) patch.scheduleCron = body.schedule_cron
    if (body.max_runs_per_day !== undefined) patch.maxRunsPerDay = body.max_runs_per_day
    if (body.config_json !== undefined) patch.configJson = JSON.stringify(body.config_json)
    await db.update(daemonPipelines).set(patch).where(eq(daemonPipelines.id, id))
    const [row] = await db.select().from(daemonPipelines).where(eq(daemonPipelines.id, id))
    return c.json(row ?? { id })
  })

  app.post("/pipelines/:id/enable", async (c) => {
    const id = c.req.param("id")
    const now = Math.floor(Date.now() / 1000)
    await db.update(daemonPipelines).set({ enabled: 1, updatedAt: now }).where(eq(daemonPipelines.id, id))
    const [row] = await db.select().from(daemonPipelines).where(eq(daemonPipelines.id, id))
    return c.json(row ?? { id })
  })

  app.post("/pipelines/:id/disable", async (c) => {
    const id = c.req.param("id")
    const now = Math.floor(Date.now() / 1000)
    await db.update(daemonPipelines).set({ enabled: 0, updatedAt: now }).where(eq(daemonPipelines.id, id))
    const [row] = await db.select().from(daemonPipelines).where(eq(daemonPipelines.id, id))
    return c.json(row ?? { id })
  })

  app.post("/pipelines/:id/run", async (c) => {
    const id = c.req.param("id")
    const run = ragOpts?.runPipelineNow
    if (!run) return c.json({ error: "Pipeline run not available (daemon context)" }, 503)
    const result = await run(id)
    if (!result.ok) return c.json({ error: result.error ?? "Run failed", jobId: result.jobId }, 400)
    return c.json({ jobId: result.jobId, ok: true }, 202)
  })

  app.get("/jobs", async (c) => {
    const pipelineId = c.req.query("pipeline_id")
    const status = c.req.query("status")
    let q = db.select().from(daemonJobs).orderBy(desc(daemonJobs.createdAt)).limit(100)
    if (pipelineId) {
      const rows = await db.select().from(daemonJobs).where(eq(daemonJobs.pipelineId, pipelineId)).orderBy(desc(daemonJobs.createdAt)).limit(100)
      return c.json(status ? rows.filter((r) => r.status === status) : rows)
    }
    const rows = await q
    return c.json(status ? rows.filter((r) => r.status === status) : rows)
  })

  app.get("/jobs/:id", async (c) => {
    const id = c.req.param("id")
    const [row] = await db.select().from(daemonJobs).where(eq(daemonJobs.id, id))
    if (!row) return c.json({ error: "Not found" }, 404)
    return c.json(row)
  })

  app.get("/goals", async (c) => {
    const rows = await db.select().from(daemonGoals).orderBy(desc(daemonGoals.createdAt))
    return c.json(rows)
  })

  app.post("/goals", zValidator("json", z.object({
    name: z.string(),
    description: z.string().optional(),
    metric_type: z.string(),
    target_value: z.number(),
    target_unit: z.string().optional(),
    period: z.string().optional(),
    pipeline_id: z.string().optional(),
  })), async (c) => {
    const body = c.req.valid("json")
    const id = ulid()
    const now = Math.floor(Date.now() / 1000)
    await db.insert(daemonGoals).values({
      id,
      name: body.name,
      description: body.description ?? null,
      metricType: body.metric_type,
      targetValue: body.target_value,
      targetUnit: body.target_unit ?? "USD",
      period: body.period ?? "monthly",
      pipelineId: body.pipeline_id ?? null,
      currentValue: 0,
      status: "active",
      priority: 1,
      createdAt: now,
      updatedAt: now,
    })
    const [row] = await db.select().from(daemonGoals).where(eq(daemonGoals.id, id))
    return c.json(row!, 201)
  })

  app.get("/proposals", async (c) => {
    const rows = await db.select().from(daemonProposals).orderBy(desc(daemonProposals.createdAt))
    return c.json(rows)
  })

  app.get("/proposals/:id", async (c) => {
    const id = c.req.param("id")
    const [row] = await db.select().from(daemonProposals).where(eq(daemonProposals.id, id))
    if (!row) return c.json({ error: "Not found" }, 404)
    return c.json(row)
  })

  app.post("/proposals/:id/approve", async (c) => {
    const id = c.req.param("id")
    const now = Math.floor(Date.now() / 1000)
    await db.update(daemonProposals).set({ status: "approved", reviewedAt: now }).where(eq(daemonProposals.id, id))
    const [row] = await db.select().from(daemonProposals).where(eq(daemonProposals.id, id))
    // Execute immediately in background (non-blocking)
    executePendingProposals(db).catch((err) => console.error("[executor] error after approve:", err))
    return c.json(row ?? { id })
  })

  app.post("/proposals/:id/reject", async (c) => {
    const id = c.req.param("id")
    const now = Math.floor(Date.now() / 1000)
    await db.update(daemonProposals).set({ status: "rejected", reviewedAt: now }).where(eq(daemonProposals.id, id))
    const [row] = await db.select().from(daemonProposals).where(eq(daemonProposals.id, id))
    return c.json(row ?? { id })
  })

  app.get("/logs", async (c) => {
    const pipelineId = c.req.query("pipeline_id")
    const limit = Math.min(500, Math.max(1, parseInt(c.req.query("limit") ?? "100", 10)))
    const rows = pipelineId
      ? await db
          .select()
          .from(daemonLogs)
          .where(eq(daemonLogs.pipelineId, pipelineId))
          .orderBy(desc(daemonLogs.createdAt))
          .limit(limit)
      : await db.select().from(daemonLogs).orderBy(desc(daemonLogs.createdAt)).limit(limit)
    return c.json(rows)
  })

  app.get("/dashboard", async (c) => {
    const days = Math.min(365, Math.max(1, parseInt(c.req.query("days") ?? "30", 10)))
    const since = Math.floor(Date.now() / 1000) - days * 86400
    const [revenue] = await db
      .select({
        totalUsd: sql<number>`coalesce(sum(${daemonRevenue.amount}), 0)`,
      })
      .from(daemonRevenue)
      .where(gte(daemonRevenue.periodStart, since))
    return c.json({
      health: "HEALTHY",
      metrics: {
        revenue: { total_usd: Number(revenue?.totalUsd ?? 0) },
      },
    })
  })

  // Queue routes
  app.get("/queue", async (c) => {
    const status = c.req.query("status")
    const activityType = c.req.query("activity_type")
    const limit = Math.min(200, Math.max(1, parseInt(c.req.query("limit") ?? "50", 10)))
    const offset = Math.max(0, parseInt(c.req.query("offset") ?? "0", 10))

    let rows = await db.select().from(daemonQueue).orderBy(daemonQueue.priority, desc(daemonQueue.createdAt)).limit(limit).offset(offset)
    if (status) rows = rows.filter((r) => r.status === status)
    if (activityType) rows = rows.filter((r) => r.activityType === activityType)
    return c.json(rows)
  })

  app.post("/queue", zValidator("json", z.object({
    activity_type: z.string(),
    input: z.record(z.string(), z.unknown()).optional(),
    priority: z.number().int().min(1).max(10).optional(),
    depends_on: z.string().optional(),
    triggered_by: z.string().optional(),
  })), async (c) => {
    const body = c.req.valid("json")
    const id = ulid()
    const now = Math.floor(Date.now() / 1000)
    await db.insert(daemonQueue).values({
      id,
      activityType: body.activity_type,
      status: "pending",
      priority: body.priority ?? 5,
      dependsOn: body.depends_on ?? null,
      inputJson: JSON.stringify(body.input ?? {}),
      triggeredBy: body.triggered_by ?? "manual",
      createdAt: now,
    })
    const [row] = await db.select().from(daemonQueue).where(eq(daemonQueue.id, id))
    return c.json(row!, 201)
  })

  app.get("/queue/:id", async (c) => {
    const id = c.req.param("id")
    const [row] = await db.select().from(daemonQueue).where(eq(daemonQueue.id, id))
    if (!row) return c.json({ error: "Not found" }, 404)
    return c.json(row)
  })

  app.delete("/queue/:id", async (c) => {
    const id = c.req.param("id")
    await db.update(daemonQueue).set({ status: "cancelled" }).where(and(eq(daemonQueue.id, id), eq(daemonQueue.status, "pending")))
    const [row] = await db.select().from(daemonQueue).where(eq(daemonQueue.id, id))
    if (!row) return c.json({ error: "Not found" }, 404)
    return c.json(row)
  })

  app.get("/activities/types", async (c) => {
    return c.json(listActivities().map((a) => ({
      type: a.type,
      displayName: a.displayName,
      description: a.description,
    })))
  })

  // ── Reports (ciclo de atividade) ────────────────────────────────────────────
  app.get("/reports", async (c) => {
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") ?? "50", 10)))
    const reportType = c.req.query("report_type")
    const rows = await db
      .select()
      .from(oppTelegramReports)
      .orderBy(desc(oppTelegramReports.createdAt))
      .limit(limit)
    const list = reportType ? rows.filter((r) => r.reportType === reportType) : rows
    // Enriquecer com duração da queue item quando existir
    const enriched = await Promise.all(
      list.map(async (r) => {
        if (!r.queueItemId) return r
        const [q] = await db
          .select({ durationMs: daemonQueue.durationMs, triggeredBy: daemonQueue.triggeredBy })
          .from(daemonQueue)
          .where(eq(daemonQueue.id, r.queueItemId))
          .limit(1)
        return { ...r, durationMs: q?.durationMs ?? null, triggeredBy: q?.triggeredBy ?? null }
      })
    )
    return c.json(enriched)
  })

  app.get("/reports/:id", async (c) => {
    const id = c.req.param("id")
    const [row] = await db.select().from(oppTelegramReports).where(eq(oppTelegramReports.id, id)).limit(1)
    if (!row) return c.json({ error: "Not found" }, 404)
    let durationMs: number | null = null
    let triggeredBy: string | null = null
    if (row.queueItemId) {
      const [q] = await db
        .select({ durationMs: daemonQueue.durationMs, triggeredBy: daemonQueue.triggeredBy })
        .from(daemonQueue)
        .where(eq(daemonQueue.id, row.queueItemId))
        .limit(1)
      durationMs = q?.durationMs ?? null
      triggeredBy = q?.triggeredBy ?? null
    }
    return c.json({ ...row, durationMs, triggeredBy })
  })

  // ── Opportunities ──────────────────────────────────────────────────────────
  app.get("/opportunities", async (c) => {
    const status = c.req.query("status")
    const nicheId = c.req.query("niche_id")
    const type = c.req.query("type")
    const minScore = c.req.query("min_score") ? parseFloat(c.req.query("min_score")!) : undefined
    const limit = Math.min(200, Math.max(1, parseInt(c.req.query("limit") ?? "50", 10)))
    const offset = Math.max(0, parseInt(c.req.query("offset") ?? "0", 10))

    let rows = await db
      .select()
      .from(oppOpportunities)
      .orderBy(desc(oppOpportunities.score), desc(oppOpportunities.createdAt))
      .limit(limit)
      .offset(offset)

    if (status) rows = rows.filter((r) => r.status === status)
    if (nicheId) rows = rows.filter((r) => r.nicheId === nicheId)
    if (type) rows = rows.filter((r) => r.type === type)
    if (minScore !== undefined) rows = rows.filter((r) => (r.score ?? 0) >= minScore!)

    return c.json(rows)
  })

  app.get("/opportunities/stats", async (c) => {
    const [total] = await db.select({ count: sql<number>`count(*)` }).from(oppOpportunities)
    const byStatus = await db
      .select({ status: oppOpportunities.status, count: sql<number>`count(*)` })
      .from(oppOpportunities)
      .groupBy(oppOpportunities.status)
    const [avgScore] = await db.select({ avg: sql<number>`avg(${oppOpportunities.score})` }).from(oppOpportunities)
    return c.json({
      total: Number(total?.count ?? 0),
      by_status: Object.fromEntries(byStatus.map((r) => [r.status, Number(r.count)])),
      avg_score: Number(avgScore?.avg ?? 0).toFixed(1),
    })
  })

  app.get("/opportunities/:id", async (c) => {
    const id = c.req.param("id")
    const [row] = await db.select().from(oppOpportunities).where(eq(oppOpportunities.id, id))
    if (!row) return c.json({ error: "Not found" }, 404)
    return c.json(row)
  })

  app.get("/repo-issue-jobs", async (c) => {
    const status = c.req.query("status")
    const repo = c.req.query("repo")?.trim().toLowerCase()
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") ?? "50", 10)))
    const rows = await db
      .select()
      .from(repoIssueJobs)
      .orderBy(desc(repoIssueJobs.updatedAt))
      .limit(limit * 2)
    let list = rows
    if (status) list = list.filter((r) => r.status === status)
    if (repo) list = list.filter((r) => r.repoFullName.toLowerCase().includes(repo))
    return c.json(list.slice(0, limit))
  })

  app.get("/repo-issue-jobs/:id", async (c) => {
    const id = c.req.param("id")
    const [row] = await db.select().from(repoIssueJobs).where(eq(repoIssueJobs.id, id))
    if (!row) return c.json({ error: "Not found" }, 404)
    return c.json(row)
  })

  app.post("/opportunities/:id/shortlist", async (c) => {
    const id = c.req.param("id")
    const now = Math.floor(Date.now() / 1000)
    await db.update(oppOpportunities).set({ status: "shortlisted", updatedAt: now }).where(eq(oppOpportunities.id, id))
    const [row] = await db.select().from(oppOpportunities).where(eq(oppOpportunities.id, id))
    return c.json(row ?? { id })
  })

  app.post("/opportunities/:id/ignore", async (c) => {
    const id = c.req.param("id")
    const now = Math.floor(Date.now() / 1000)
    await db.update(oppOpportunities).set({ status: "ignored", updatedAt: now }).where(eq(oppOpportunities.id, id))
    const [row] = await db.select().from(oppOpportunities).where(eq(oppOpportunities.id, id))
    return c.json(row ?? { id })
  })

  app.post("/opportunities/:id/execute", async (c) => {
    const id = c.req.param("id")
    const body = (await c.req.json().catch(() => ({}))) as {
      cwd?: string
      dry_run?: boolean
      spec_id?: string
      validation_command?: string
      max_retries?: number
    }
    const now = Math.floor(Date.now() / 1000)
    const queueId = ulid()
    const input = {
      opportunity_id: id,
      cwd: body.cwd,
      dry_run: body.dry_run,
      spec_id: body.spec_id,
      validation_command: body.validation_command,
      max_retries: body.max_retries,
    }
    await db.insert(daemonQueue).values({
      id: queueId,
      activityType: "execute-opportunity",
      status: "pending",
      priority: 3,
      inputJson: JSON.stringify(input),
      triggeredBy: "manual",
      createdAt: now,
    })
    return c.json({ queue_id: queueId }, 202)
  })

  // ── Niches ────────────────────────────────────────────────────────────────
  app.get("/niches", async (c) => {
    const rows = await db
      .select()
      .from(oppNiches)
      .orderBy(desc(oppNiches.aiAgentFit), desc(oppNiches.opportunityCount))
    return c.json(rows)
  })

  app.get("/niches/:id", async (c) => {
    const id = c.req.param("id")
    const [row] = await db.select().from(oppNiches).where(eq(oppNiches.id, id))
    if (!row) return c.json({ error: "Not found" }, 404)
    const relations = await db
      .select()
      .from(oppNicheRelations)
      .where(eq(oppNicheRelations.fromNicheId, id))
      .orderBy(desc(oppNicheRelations.weight))
    return c.json({ ...row, relations })
  })

  // ── Market Data ──────────────────────────────────────────────────────────
  app.get("/market-data", async (c) => {
    const assetType = c.req.query("asset_type")
    const hours = Math.min(168, Math.max(1, parseInt(c.req.query("hours") ?? "24", 10)))
    const since = Math.floor(Date.now() / 1000) - hours * 3600
    const limit = Math.min(500, Math.max(1, parseInt(c.req.query("limit") ?? "100", 10)))

    let rows = await db
      .select()
      .from(oppMarketData)
      .where(gte(oppMarketData.collectedAt, since))
      .orderBy(desc(oppMarketData.collectedAt))
      .limit(limit)

    if (assetType) rows = rows.filter((r) => r.assetType === assetType)
    return c.json(rows)
  })

  app.get("/market-data/latest", async (c) => {
    // Um registro mais recente por símbolo
    const rows = await db
      .select()
      .from(oppMarketData)
      .orderBy(desc(oppMarketData.collectedAt))
      .limit(500)

    const seen = new Set<string>()
    const latest = rows.filter((r) => {
      if (seen.has(r.symbol)) return false
      seen.add(r.symbol)
      return true
    })
    return c.json(latest)
  })

  // ── Submissions ───────────────────────────────────────────────────────────
  app.get("/submissions", async (c) => {
    const status = c.req.query("status")
    const platform = c.req.query("platform")
    const opportunityId = c.req.query("opportunity_id")
    const limit = Math.min(200, Math.max(1, parseInt(c.req.query("limit") ?? "50", 10)))
    const offset = Math.max(0, parseInt(c.req.query("offset") ?? "0", 10))

    let rows = await db
      .select()
      .from(oppSubmissions)
      .orderBy(desc(oppSubmissions.createdAt))
      .limit(limit)
      .offset(offset)

    if (status) rows = rows.filter((r) => r.status === status)
    if (platform) rows = rows.filter((r) => r.platform === platform)
    if (opportunityId) rows = rows.filter((r) => r.opportunityId === opportunityId)
    return c.json(rows)
  })

  app.get("/submissions/:id", async (c) => {
    const id = c.req.param("id")
    const [row] = await db.select().from(oppSubmissions).where(eq(oppSubmissions.id, id))
    if (!row) return c.json({ error: "Not found" }, 404)
    return c.json(row)
  })

  app.post("/submissions/:id/approve", async (c) => {
    const id = c.req.param("id")
    const now = Math.floor(Date.now() / 1000)
    const [row] = await db.select().from(oppSubmissions).where(eq(oppSubmissions.id, id))
    if (!row) return c.json({ error: "Not found" }, 404)
    if (row.status !== "pending-approval") return c.json({ error: `Cannot approve submission with status: ${row.status}` }, 400)

    await db.update(oppSubmissions).set({ status: "submitted", approvedAt: now, updatedAt: now }).where(eq(oppSubmissions.id, id))

    // Enfileira a submissão real de acordo com a plataforma
    let activityType = "verify-submission-outcome"
    if (row.platform === "gitcoin") activityType = "submit-gitcoin-proposal"
    const queueId = ulid()
    await db.insert(daemonQueue).values({
      id: queueId,
      activityType,
      status: "pending",
      priority: 3,
      inputJson: JSON.stringify({ submission_id: id }),
      triggeredBy: "manual-approval",
      createdAt: now,
    })

    const [updated] = await db.select().from(oppSubmissions).where(eq(oppSubmissions.id, id))
    return c.json({ submission: updated, queue_id: queueId })
  })

  app.post("/submissions/:id/reject", async (c) => {
    const id = c.req.param("id")
    const now = Math.floor(Date.now() / 1000)
    const [row] = await db.select().from(oppSubmissions).where(eq(oppSubmissions.id, id))
    if (!row) return c.json({ error: "Not found" }, 404)
    if (!["pending-approval", "draft"].includes(row.status)) return c.json({ error: `Cannot reject submission with status: ${row.status}` }, 400)

    await db.update(oppSubmissions).set({ status: "rejected", updatedAt: now }).where(eq(oppSubmissions.id, id))
    const [updated] = await db.select().from(oppSubmissions).where(eq(oppSubmissions.id, id))
    return c.json(updated)
  })

  // Trigger submission activities manually per opportunity
  app.post("/opportunities/:id/submit-pr", async (c) => {
    const id = c.req.param("id")
    const body = await c.req.json().catch(() => ({})) as { force?: boolean }
    const now = Math.floor(Date.now() / 1000)
    const queueId = ulid()
    await db.insert(daemonQueue).values({
      id: queueId,
      activityType: "submit-github-pr",
      status: "pending",
      priority: 3,
      inputJson: JSON.stringify({ opportunity_id: id, force: body.force }),
      triggeredBy: "manual",
      createdAt: now,
    })
    return c.json({ queue_id: queueId }, 202)
  })

  app.post("/opportunities/:id/generate-proposal", async (c) => {
    const id = c.req.param("id")
    const body = await c.req.json().catch(() => ({})) as { platform?: string }
    const platform = body.platform ?? "gitcoin"
    const now = Math.floor(Date.now() / 1000)
    const activityType = platform === "gitcoin" ? "generate-gitcoin-proposal" : "send-freelance-email"
    const queueId = ulid()
    await db.insert(daemonQueue).values({
      id: queueId,
      activityType,
      status: "pending",
      priority: 3,
      inputJson: JSON.stringify({ opportunity_id: id }),
      triggeredBy: "manual",
      createdAt: now,
    })
    return c.json({ queue_id: queueId }, 202)
  })

  app.get("/memory/retrieve", async (c) => {
    const q = c.req.query("q")?.trim()
    const limit = Math.min(20, Math.max(1, parseInt(c.req.query("limit") ?? "5", 10)))
    if (!q) return c.json({ chunks: [] })
    const chunks = await search(q, limit)
    return c.json({ chunks })
  })

  // ── Discovery (project/venture idea validation) ─────────────────────────────
  app.get("/discovery", async (c) => {
    const status = c.req.query("status")
    const limit = Math.min(200, Math.max(1, parseInt(c.req.query("limit") ?? "50", 10)))
    const offset = Math.max(0, parseInt(c.req.query("offset") ?? "0", 10))
    let rows = await db
      .select()
      .from(discoveryReports)
      .orderBy(desc(discoveryReports.created_at))
      .limit(limit)
      .offset(offset)
    if (status) rows = rows.filter((r) => r.status === status)
    return c.json(rows)
  })

  app.post("/discovery", zValidator("json", z.object({
    idea_text: z.string().min(1),
    session_id: z.string().optional(),
    trigger_pipeline: z.boolean().optional(),
    spec_id: z.string().optional(),
  })), async (c) => {
    const body = c.req.valid("json")
    const id = ulid()
    const now = Math.floor(Date.now() / 1000)
    const reportJson = body.spec_id ? JSON.stringify({ spec_id: body.spec_id }) : null
    await db.insert(discoveryReports).values({
      id,
      idea_text: body.idea_text,
      status: "pending",
      session_id: body.session_id ?? null,
      report_json: reportJson,
      created_at: now,
      updated_at: now,
    })
    if (body.trigger_pipeline && ragOpts?.runPipelineByStrategy) {
      await ragOpts.runPipelineByStrategy("project_discovery").catch(() => {})
    }
    const [row] = await db.select().from(discoveryReports).where(eq(discoveryReports.id, id))
    return c.json(row!, 201)
  })

  app.get("/discovery/:id", async (c) => {
    const id = c.req.param("id")
    const [row] = await db.select().from(discoveryReports).where(eq(discoveryReports.id, id))
    if (!row) return c.json({ error: "Not found" }, 404)
    return c.json(row)
  })

  // ── Project Specs ─────────────────────────────────────────────────────────
  app.get("/specs", async (c) => {
    const limit = Math.min(200, Math.max(1, parseInt(c.req.query("limit") ?? "50", 10)))
    const offset = Math.max(0, parseInt(c.req.query("offset") ?? "0", 10))
    const rows = await db
      .select()
      .from(projectSpecs)
      .orderBy(desc(projectSpecs.createdAt))
      .limit(limit)
      .offset(offset)
    return c.json(rows)
  })

  app.post("/specs", zValidator("json", z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    ontologyJson: z.string().optional(),
    contracts: z.string().optional(),
    constraintsJson: z.string().optional(),
    architecture: z.string().optional(),
    context: z.string().optional(),
    linkedProjectId: z.string().optional(),
  })), async (c) => {
    const body = c.req.valid("json")
    const id = ulid()
    const now = Math.floor(Date.now() / 1000)
    await db.insert(projectSpecs).values({
      id,
      name: body.name,
      description: body.description ?? null,
      ontologyJson: body.ontologyJson ?? null,
      contracts: body.contracts ?? null,
      constraintsJson: body.constraintsJson ?? null,
      architecture: body.architecture ?? null,
      context: body.context ?? null,
      linkedProjectId: body.linkedProjectId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    const [row] = await db.select().from(projectSpecs).where(eq(projectSpecs.id, id))
    return c.json(row!, 201)
  })

  app.get("/specs/:id", async (c) => {
    const id = c.req.param("id")
    const [row] = await db.select().from(projectSpecs).where(eq(projectSpecs.id, id))
    if (!row) return c.json({ error: "Not found" }, 404)
    return c.json(row)
  })

  app.patch("/specs/:id", zValidator("json", z.object({
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    ontologyJson: z.string().nullable().optional(),
    contracts: z.string().nullable().optional(),
    constraintsJson: z.string().nullable().optional(),
    architecture: z.string().nullable().optional(),
    context: z.string().nullable().optional(),
    linkedProjectId: z.string().nullable().optional(),
  })), async (c) => {
    const id = c.req.param("id")
    const body = c.req.valid("json")
    const now = Math.floor(Date.now() / 1000)
    const [existing] = await db.select().from(projectSpecs).where(eq(projectSpecs.id, id))
    if (!existing) return c.json({ error: "Not found" }, 404)
    const updates: Record<string, unknown> = { updatedAt: now }
    if (body.name !== undefined) updates.name = body.name
    if (body.description !== undefined) updates.description = body.description
    if (body.ontologyJson !== undefined) updates.ontologyJson = body.ontologyJson
    if (body.contracts !== undefined) updates.contracts = body.contracts
    if (body.constraintsJson !== undefined) updates.constraintsJson = body.constraintsJson
    if (body.architecture !== undefined) updates.architecture = body.architecture
    if (body.context !== undefined) updates.context = body.context
    if (body.linkedProjectId !== undefined) updates.linkedProjectId = body.linkedProjectId
    await db.update(projectSpecs).set(updates).where(eq(projectSpecs.id, id))
    const [row] = await db.select().from(projectSpecs).where(eq(projectSpecs.id, id))
    return c.json(row!)
  })

  app.delete("/specs/:id", async (c) => {
    const id = c.req.param("id")
    const [existing] = await db.select().from(projectSpecs).where(eq(projectSpecs.id, id))
    if (!existing) return c.json({ error: "Not found" }, 404)
    await db.delete(projectSpecs).where(eq(projectSpecs.id, id))
    return c.json({ deleted: true })
  })

  app.get("/specs/:id/prompt", async (c) => {
    const id = c.req.param("id")
    const [spec] = await db.select().from(projectSpecs).where(eq(projectSpecs.id, id))
    if (!spec) return c.json({ error: "Not found" }, 404)
    const prompt = compileSpecToPrompt(spec)
    return c.json({ spec_id: id, prompt })
  })

  // ── Agent Learnings (RAG Brain) ──────────────────────────────────────────
  app.get("/learnings", async (c) => {
    const category = c.req.query("category")?.trim()
    const limit = Math.min(200, Math.max(1, parseInt(c.req.query("limit") ?? "100", 10)))
    const rows = category
      ? await db
          .select()
          .from(agentLearnings)
          .where(eq(agentLearnings.category, category))
          .orderBy(desc(agentLearnings.confidence), desc(agentLearnings.updatedAt))
          .limit(limit)
      : await db
          .select()
          .from(agentLearnings)
          .orderBy(desc(agentLearnings.confidence), desc(agentLearnings.updatedAt))
          .limit(limit)
    return c.json(rows)
  })

  app.post("/learnings", zValidator("json", z.object({
    key: z.string().min(1),
    category: z.string().min(1),
    title: z.string().min(1),
    body: z.string().min(1),
    confidence: z.number().min(0).max(1).optional(),
    tags: z.array(z.string()).optional(),
    source: z.string().optional(),
  })), async (c) => {
    const b = c.req.valid("json")
    const now = Math.floor(Date.now() / 1000)
    const [existing] = await db.select().from(agentLearnings).where(eq(agentLearnings.key, b.key))
    if (existing) {
      await db
        .update(agentLearnings)
        .set({
          category: b.category,
          title: b.title,
          body: b.body,
          confidence: b.confidence ?? existing.confidence,
          tags: b.tags !== undefined ? JSON.stringify(b.tags) : existing.tags,
          source: b.source ?? existing.source ?? "api",
          updatedAt: now,
        })
        .where(eq(agentLearnings.id, existing.id))
      const [row] = await db.select().from(agentLearnings).where(eq(agentLearnings.id, existing.id))
      return c.json(row)
    }
    const id = ulid()
    await db.insert(agentLearnings).values({
      id,
      key: b.key,
      category: b.category,
      title: b.title,
      body: b.body,
      confidence: b.confidence ?? 0.5,
      source: b.source ?? "api",
      tags: b.tags ? JSON.stringify(b.tags) : null,
      createdAt: now,
      updatedAt: now,
      positiveCount: 0,
      negativeCount: 0,
    })
    const [row] = await db.select().from(agentLearnings).where(eq(agentLearnings.id, id))
    return c.json(row, 201)
  })

  app.post("/learnings/extract", async (c) => {
    const body = await c.req.json().catch(() => ({})) as { mode?: string; limit?: number; since_hours?: number }
    const now = Math.floor(Date.now() / 1000)
    const queueId = ulid()
    await db.insert(daemonQueue).values({
      id: queueId,
      activityType: "extract-learnings",
      status: "pending",
      priority: 5,
      inputJson: JSON.stringify({
        mode: body.mode ?? "batch",
        limit: body.limit ?? 20,
        since_hours: body.since_hours ?? 168,
      }),
      triggeredBy: "manual",
      createdAt: now,
    })
    return c.json({ queue_id: queueId, ok: true }, 202)
  })

  app.patch("/learnings/:id", zValidator("json", z.object({
    title: z.string().min(1).optional(),
    body: z.string().min(1).optional(),
    confidence: z.number().min(0).max(1).optional(),
    tags: z.array(z.string()).optional(),
  })), async (c) => {
    const id = c.req.param("id")
    const input = c.req.valid("json")
    const now = Math.floor(Date.now() / 1000)
    const [existing] = await db.select().from(agentLearnings).where(eq(agentLearnings.id, id))
    if (!existing) return c.json({ error: "Not found" }, 404)
    await db.update(agentLearnings).set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
      ...(input.tags !== undefined ? { tags: JSON.stringify(input.tags) } : {}),
      updatedAt: now,
    }).where(eq(agentLearnings.id, id))
    const [updated] = await db.select().from(agentLearnings).where(eq(agentLearnings.id, id))
    return c.json(updated)
  })

  app.delete("/learnings/:id", async (c) => {
    const id = c.req.param("id")
    await db.delete(agentLearnings).where(eq(agentLearnings.id, id))
    return c.json({ ok: true })
  })

  return app
}
