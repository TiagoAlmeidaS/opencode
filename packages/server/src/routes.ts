import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import z from "zod"
import type { ServerDb } from "./db"
import { daemonPipelines, daemonJobs, daemonGoals, daemonProposals, daemonRevenue, daemonLogs } from "./schema"
import { eq, desc, sql, and, gte } from "drizzle-orm"
import { ulid } from "ulid"
import { listPipelineStrategies } from "./registry"

export function ServerRoutes(db: ServerDb) {
  const app = new Hono()

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
    config_json: z.record(z.unknown()).optional(),
    schedule_cron: z.string().optional(),
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

  return app
}
