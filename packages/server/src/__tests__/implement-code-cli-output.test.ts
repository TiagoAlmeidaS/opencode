/**
 * Unit tests for implement-code activity: cli_output is persisted before throwing
 * when the OpenCode CLI fails on all MAX_TRIES attempts.
 *
 * Bug fixed: when spawnOpenCode threw on the last retry, cli_output was never
 * saved because the DB update was placed AFTER the loop (after the throw).
 * Fix: the DB update is now inside the catch block on the final attempt.
 */
import { mock, describe, test, expect, beforeEach, afterEach } from "bun:test"
import { eq } from "drizzle-orm"
import { ulid } from "ulid"

// ── Module mocks (hoisted by Bun before static imports) ──────────────────────

// Mutable containers to avoid TDZ issues with Bun's mock.module hoisting
const _git = {
  runGit: async (_args: string[], _cwd: string): Promise<string> => "",
  workDirForJob: (id: string) => `/tmp/oc-test-${id}`,
}

mock.module("../activities/dev-cycle-shared", () => ({
  workDirForJob: (id: string) => _git.workDirForJob(id),
  runGit: (args: string[], cwd: string) => _git.runGit(args, cwd),
  parseRepoFullName: (full: string) => {
    const parts = full.split("/")
    return parts.length >= 2 ? { owner: parts[0], repo: parts[1] } : null
  },
}))

mock.module("@octokit/rest", () => ({
  Octokit: class {
    users = {
      getAuthenticated: async () => ({ data: { login: "test-bot" } }),
    }
    repos = {
      createFork: async () => ({ data: { full_name: "test-bot/test-repo" } }),
    }
  },
}))

mock.module("../github-utils", () => ({
  checkExistingPR: async () => ({ exists: false }),
}))

mock.module("fs/promises", () => ({
  mkdir: async () => {},
  rm: async () => {},
  cp: async () => {},
}))

// ── Imports ──────────────────────────────────────────────────────────────────

import { getDb, closeDb } from "../db"
import { repoIssueJobs } from "../schema"
import { implementCodeActivity } from "../activities/implement-code"

// ── Helpers ──────────────────────────────────────────────────────────────────

async function insertJob(
  db: ReturnType<typeof getDb>,
  requirePassingTests: 0 | 1,
): Promise<string> {
  const id = ulid()
  const now = Math.floor(Date.now() / 1000)
  await db.insert(repoIssueJobs).values({
    id,
    repoFullName: "test-owner/test-repo",
    issueNumber: null,
    issueTitle: "Implement feature X",
    issueBody: "Please add feature X",
    status: "pending",
    baseBranch: "main",
    useFork: 0,
    requirePassingTests,
    retry_count: 0,
    prDraft: 1,
    createdAt: now,
    updatedAt: now,
  })
  return id
}

function makeCtx(
  db: ReturnType<typeof getDb>,
  jobId: string,
  spawnOpenCode: (task: string, cwd: string) => Promise<{ output: string; sessionId: string | null }>,
) {
  return {
    queueItemId: "queue-test-item",
    input: { repo_issue_job_id: jobId },
    db,
    spawnOpenCode,
    enqueue: async () => "enqueue-test-id",
    updateProgress: async (_step: string) => {},
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("implement-code: cli_output captured on max retries", () => {
  let db: ReturnType<typeof getDb>

  beforeEach(() => {
    process.env.GITHUB_TOKEN = "test-token"
    db = getDb(":memory:")
  })

  afterEach(() => {
    closeDb()
  })

  test("requirePassingTests=1, CLI always fails: error thrown and cli_output saved to DB", async () => {
    const jobId = await insertJob(db, 1)
    const errMsg = "Runtime not available: npm not found in PATH"

    const spawnMock = mock(async (_task: string, _cwd: string) => {
      throw new Error(errMsg)
    })

    const ctx = makeCtx(db, jobId, spawnMock)

    await expect(implementCodeActivity.execute(ctx as never)).rejects.toThrow(
      "CLI falhou após 3 tentativas",
    )

    // CLI output must be persisted even though the activity threw
    const [job] = await db.select().from(repoIssueJobs).where(eq(repoIssueJobs.id, jobId))
    expect(job.cli_output).toBe(errMsg)

    // Status must NOT have advanced to "implementing"
    expect(job.status).not.toBe("implementing")

    // CLI was called exactly MAX_TRIES (3) times
    expect(spawnMock).toHaveBeenCalledTimes(3)
  })

  test("requirePassingTests=0, CLI always fails: no error thrown, status becomes implementing", async () => {
    const jobId = await insertJob(db, 0)

    const spawnMock = mock(async (_task: string, _cwd: string) => {
      throw new Error("CLI failed every time")
    })

    const ctx = makeCtx(db, jobId, spawnMock)

    // Should resolve (not reject) when requirePassingTests=0
    await expect(implementCodeActivity.execute(ctx as never)).resolves.toBeDefined()

    const [job] = await db.select().from(repoIssueJobs).where(eq(repoIssueJobs.id, jobId))
    expect(job.status).toBe("implementing")

    // CLI was still called MAX_TRIES times before giving up
    expect(spawnMock).toHaveBeenCalledTimes(3)
  })

  test("CLI fails on first two attempts then succeeds: status is implementing, cli_output has success content", async () => {
    const jobId = await insertJob(db, 1)
    let callCount = 0

    const spawnMock = mock(async (_task: string, _cwd: string) => {
      callCount++
      if (callCount < 3) throw new Error(`Attempt ${callCount} failed`)
      return { output: "All tests passed (12 passed, 0 failed)", sessionId: "sess-abc" }
    })

    const ctx = makeCtx(db, jobId, spawnMock)

    await implementCodeActivity.execute(ctx as never)

    const [job] = await db.select().from(repoIssueJobs).where(eq(repoIssueJobs.id, jobId))
    expect(job.status).toBe("implementing")
    expect(job.cli_output).toBe("All tests passed (12 passed, 0 failed)")
    expect(job.session_id).toBe("sess-abc")
    expect(callCount).toBe(3)
  })

  test("CLI succeeds on first attempt: branch name set and status is implementing", async () => {
    const jobId = await insertJob(db, 1)

    const spawnMock = mock(async () => ({
      output: "Spec written, tests passed",
      sessionId: "sess-xyz",
    }))

    const ctx = makeCtx(db, jobId, spawnMock)

    await implementCodeActivity.execute(ctx as never)

    const [job] = await db.select().from(repoIssueJobs).where(eq(repoIssueJobs.id, jobId))
    expect(job.status).toBe("implementing")
    expect(job.branchName).toMatch(/^agent\/opp-/)
    expect(job.cli_output).toBe("Spec written, tests passed")
    expect(spawnMock).toHaveBeenCalledTimes(1)
  })
})
