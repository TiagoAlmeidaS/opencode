/**
 * Unit tests for repo-issue-worker: retry limit prevents infinite failure loop.
 *
 * Bug fixed: failed jobs were re-enqueued unconditionally, creating an infinite loop.
 * Fix: jobs with retry_count >= MAX_AUTO_RETRIES (3) are permanently skipped.
 */
import { mock, describe, test, expect, beforeEach, afterEach } from "bun:test"
import { eq } from "drizzle-orm"
import { ulid } from "ulid"

// ── Module mocks (hoisted by Bun before static imports) ──────────────────────

// Mutable container avoids TDZ issues with Bun's mock.module hoisting
const _octokit = {
  issues: [] as {
    number: number
    title: string
    body: string | null
    labels: { name: string }[]
    pull_request?: unknown
  }[],
}

mock.module("@octokit/rest", () => ({
  Octokit: class {
    rest = {
      issues: {
        listForRepo: () => Promise.resolve({ data: _octokit.issues }),
      },
    }
  },
}))

// ── Imports (after mocks are registered) ────────────────────────────────────

import { getDb, closeDb } from "../db"
import { repoIssueJobs, daemonQueue, daemonPipelines } from "../schema"
import "../pipelines/repo_issue_worker" // registers the pipeline via registerPipeline()
import { getPipeline } from "../registry"

// ── Helpers ──────────────────────────────────────────────────────────────────

const REPO = "test-owner/test-repo"
const PIPELINE_ID = "p-test"

/** Seed the daemon_pipelines row required by repo_issue_jobs.pipeline_id FK. */
async function seedPipeline(db: ReturnType<typeof getDb>) {
  const now = Math.floor(Date.now() / 1000)
  await db.insert(daemonPipelines).values({
    id: PIPELINE_ID,
    name: "Test Pipeline",
    strategy: "repo-issue-worker",
    configJson: "{}",
    scheduleCron: "0 3 * * *",
    enabled: 1,
    maxRetries: 3,
    retryDelaySec: 300,
    maxRunsPerDay: 0,
    createdAt: now,
    updatedAt: now,
  })
}

function makeCtx(db: ReturnType<typeof getDb>) {
  return {
    pipelineId: PIPELINE_ID,
    jobId: "j-test",
    db,
    config: { repo_full_name: REPO, label: "agent", max_issues_per_run: 5 },
  }
}

async function insertJob(
  db: ReturnType<typeof getDb>,
  overrides: { status: string; retry_count: number },
) {
  const id = ulid()
  const now = Math.floor(Date.now() / 1000)
  await db.insert(repoIssueJobs).values({
    id,
    repoFullName: REPO,
    issueNumber: 42,
    issueTitle: "Fix the bug",
    status: overrides.status,
    baseBranch: "main",
    useFork: 0,
    requirePassingTests: 1,
    retry_count: overrides.retry_count,
    prDraft: 1,
    createdAt: now,
    updatedAt: now,
  })
  return id
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("repo-issue-worker: retry limit logic", () => {
  let db: ReturnType<typeof getDb>

  beforeEach(async () => {
    process.env.GITHUB_TOKEN = "test-token"
    db = getDb(":memory:")
    await seedPipeline(db)
    _octokit.issues = [
      {
        number: 42,
        title: "Fix the bug",
        body: "Description here",
        labels: [{ name: "agent" }],
      },
    ]
  })

  afterEach(() => {
    closeDb()
  })

  test("failed job with retry_count=0: reset to pending, retry_count→1, chain enqueued", async () => {
    const id = await insertJob(db, { status: "failed", retry_count: 0 })

    await getPipeline("repo-issue-worker")!.execute(makeCtx(db))

    const [job] = await db.select().from(repoIssueJobs).where(eq(repoIssueJobs.id, id))
    expect(job.status).toBe("pending")
    expect(job.retry_count).toBe(1)

    // enqueueDevCycleChain inserts daemon_queue items (implement-code is the first step)
    const queued = await db
      .select()
      .from(daemonQueue)
      .where(eq(daemonQueue.activityType, "implement-code"))
    expect(queued.length).toBe(1)
    expect(queued[0].inputJson).toContain(id)
  })

  test("failed job with retry_count=2: reset to pending, retry_count→3, chain enqueued (last allowed retry)", async () => {
    const id = await insertJob(db, { status: "failed", retry_count: 2 })

    await getPipeline("repo-issue-worker")!.execute(makeCtx(db))

    const [job] = await db.select().from(repoIssueJobs).where(eq(repoIssueJobs.id, id))
    expect(job.status).toBe("pending")
    expect(job.retry_count).toBe(3)

    const queued = await db
      .select()
      .from(daemonQueue)
      .where(eq(daemonQueue.activityType, "implement-code"))
    expect(queued.length).toBe(1)
  })

  test("failed job with retry_count=3 (at limit): stays failed, no chain created", async () => {
    const id = await insertJob(db, { status: "failed", retry_count: 3 })

    await getPipeline("repo-issue-worker")!.execute(makeCtx(db))

    const [job] = await db.select().from(repoIssueJobs).where(eq(repoIssueJobs.id, id))
    expect(job.status).toBe("failed")
    expect(job.retry_count).toBe(3) // unchanged

    const allQueued = await db.select().from(daemonQueue)
    expect(allQueued.length).toBe(0)
  })

  test("failed job with retry_count=5 (over limit): stays failed, no chain created", async () => {
    const id = await insertJob(db, { status: "failed", retry_count: 5 })

    await getPipeline("repo-issue-worker")!.execute(makeCtx(db))

    const [job] = await db.select().from(repoIssueJobs).where(eq(repoIssueJobs.id, id))
    expect(job.status).toBe("failed")
    expect(job.retry_count).toBe(5) // unchanged

    const allQueued = await db.select().from(daemonQueue)
    expect(allQueued.length).toBe(0)
  })

  test("completed job: unchanged, no chain created", async () => {
    const id = await insertJob(db, { status: "completed", retry_count: 0 })

    await getPipeline("repo-issue-worker")!.execute(makeCtx(db))

    const [job] = await db.select().from(repoIssueJobs).where(eq(repoIssueJobs.id, id))
    expect(job.status).toBe("completed")

    const allQueued = await db.select().from(daemonQueue)
    expect(allQueued.length).toBe(0)
  })

  test("new issue (no existing job): job created as pending and chain enqueued", async () => {
    await getPipeline("repo-issue-worker")!.execute(makeCtx(db))

    const [job] = await db
      .select()
      .from(repoIssueJobs)
      .where(eq(repoIssueJobs.repoFullName, REPO))
    expect(job).toBeDefined()
    expect(job.issueNumber).toBe(42)
    expect(job.status).toBe("pending")
    expect(job.retry_count).toBe(0)

    const queued = await db
      .select()
      .from(daemonQueue)
      .where(eq(daemonQueue.activityType, "implement-code"))
    expect(queued.length).toBe(1)
  })
})
