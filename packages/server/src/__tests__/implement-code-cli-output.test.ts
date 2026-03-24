/**
 * Unit tests for implement-code activity:
 *
 * 1. cli_output is persisted before throwing when the OpenCode CLI fails on all MAX_TRIES.
 *    Bug fixed: when spawnOpenCode threw on the last retry, cli_output was never
 *    saved because the DB update was placed AFTER the loop (after the throw).
 *    Fix: the DB update is now inside the catch block on the final attempt.
 *
 * 2. detectStuckLoop: detects when the agent is stuck in an edit loop (≥4 "edit failed"
 *    without a test-pass signal) and marks the job as "failed".
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
import { implementCodeActivity, detectStuckLoop, detectEmptyIssueBody } from "../activities/implement-code"

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
    issueBody: "## Summary\nPlease add feature X to the application.\nThe feature should integrate with module Y and expose /api/x.\nAdd unit tests covering the happy path and error cases.\nEnsure backward compatibility with existing endpoints.",
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

// ── detectEmptyIssueBody unit tests ──────────────────────────────────────────

describe("detectEmptyIssueBody", () => {
  test("returns true for null/undefined body", () => {
    expect(detectEmptyIssueBody(null)).toBe(true)
    expect(detectEmptyIssueBody(undefined)).toBe(true)
    expect(detectEmptyIssueBody("")).toBe(true)
    expect(detectEmptyIssueBody("   ")).toBe(true)
  })

  test("returns true for body shorter than 80 chars", () => {
    expect(detectEmptyIssueBody("Fix the bug")).toBe(true)
    expect(detectEmptyIssueBody("Please add feature X")).toBe(true)
  })

  test("returns true for template-only body", () => {
    const template = "## Description\nCritério funcional 1\nCritério funcional 2\nCritério funcional 3\nCritério funcional 4"
    expect(detectEmptyIssueBody(template)).toBe(true)
  })

  test("returns true when body has fewer than 3 substantive lines", () => {
    const body = "## Summary\nDo the thing.\nAlso do this other thing that is long enough."
    expect(detectEmptyIssueBody(body)).toBe(true)
  })

  test("returns false for substantive body", () => {
    const body = "## Summary\nImplement OAuth login via GitHub.\nUsers should be able to sign in with their GitHub account.\nStore the access token securely in the session.\nRedirect to dashboard after successful login."
    expect(detectEmptyIssueBody(body)).toBe(false)
  })

  test("strips HTML comments before evaluation", () => {
    const body = "<!-- template comment -->\n".repeat(10) + "Short"
    expect(detectEmptyIssueBody(body)).toBe(true)
  })
})

// ── detectStuckLoop unit tests ────────────────────────────────────────────────

describe("detectStuckLoop", () => {
  test("returns stuck=false when fewer than 4 edit failures", () => {
    const output = [
      "✗ edit failed",
      "✗ edit failed",
      "✗ edit failed",
    ].join("\n")
    const result = detectStuckLoop(output)
    expect(result.stuck).toBe(false)
    expect(result.reason).toBeNull()
  })

  test("returns stuck=true when 4+ edit failures with no success signal", () => {
    const output = [
      "✗ edit failed",
      "Error: Found multiple matches for oldString",
      "✗ edit failed",
      "Error: Found multiple matches for oldString",
      "✗ edit failed",
      "Error: Could not find oldString in the file",
      "✗ edit failed",
    ].join("\n")
    const result = detectStuckLoop(output)
    expect(result.stuck).toBe(true)
    expect(result.reason).toContain("4 edit failures")
    expect(result.reason).toContain("multiple matches")
  })

  test("returns stuck=false when 4+ edit failures but tests passed", () => {
    const output = [
      "✗ edit failed",
      "✗ edit failed",
      "✗ edit failed",
      "✗ edit failed",
      "All tests passed (52 passed, 0 failed)",
    ].join("\n")
    const result = detectStuckLoop(output)
    expect(result.stuck).toBe(false)
  })

  test("returns stuck=false on clean output", () => {
    const result = detectStuckLoop("All tests passed (10 passed, 0 failed)")
    expect(result.stuck).toBe(false)
  })

  test("is case-insensitive for edit failed pattern", () => {
    const output = Array(5).fill("Edit Failed").join("\n")
    const result = detectStuckLoop(output)
    expect(result.stuck).toBe(true)
  })

  test("returns stuck=true when 4+ bash tool failures with undefined command", () => {
    const bashError = "Error: The bash tool was called with invalid arguments: [{ expected: \"string\", path: [\"command\"], message: \"Invalid input: expected string, received undefined\" }]"
    const output = Array(5).fill(`✗ bash failed\n${bashError}`).join("\n")
    const result = detectStuckLoop(output)
    expect(result.stuck).toBe(true)
    expect(result.reason).toContain("bash failure loop")
    expect(result.reason).toContain("5")
  })

  test("returns stuck=false when fewer than 4 bash tool failures", () => {
    const bashError = "Error: The bash tool was called with invalid arguments: [{ path: [\"command\"], message: \"Invalid input: expected string, received undefined\" }]"
    const output = Array(3).fill(`✗ bash failed\n${bashError}`).join("\n")
    const result = detectStuckLoop(output)
    expect(result.stuck).toBe(false)
  })

  test("returns stuck=false when bash failures present but tests passed", () => {
    const bashError = "Error: The bash tool was called with invalid arguments: [{ path: [\"command\"], message: \"Invalid input: expected string, received undefined\" }]"
    const output = [
      ...Array(5).fill(`✗ bash failed\n${bashError}`),
      "All tests passed (10 passed, 0 failed)",
    ].join("\n")
    const result = detectStuckLoop(output)
    expect(result.stuck).toBe(false)
  })
})

// ── implement-code activity tests ─────────────────────────────────────────────

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

  test("CLI exits 0 but output shows stuck edit loop: status becomes failed and throws", async () => {
    const jobId = await insertJob(db, 1)

    const stuckOutput = [
      "→ Read apps/web/app/api/tests/apiRoutes.test.ts",
      "✗ edit failed",
      "Error: Found multiple matches for oldString. Provide more surrounding context.",
      "✗ edit failed",
      "Error: Found multiple matches for oldString. Provide more surrounding context.",
      "✗ edit failed",
      "Error: Could not find oldString in the file.",
      "✗ edit failed",
      "Error: Found multiple matches for oldString. Provide more surrounding context.",
      "✗ edit failed",
    ].join("\n")

    const spawnMock = mock(async () => ({ output: stuckOutput, sessionId: "sess-stuck" }))
    const ctx = makeCtx(db, jobId, spawnMock)

    await expect(implementCodeActivity.execute(ctx as never)).rejects.toThrow("stuck in edit loop")

    const [job] = await db.select().from(repoIssueJobs).where(eq(repoIssueJobs.id, jobId))
    expect(job.status).toBe("failed")
    expect(job.cli_output).toContain("[STUCK LOOP DETECTED]")
    expect(job.cli_output).toContain("5 edit failures")
    expect(spawnMock).toHaveBeenCalledTimes(1)
  })

  test("CLI exits 0 with edit failures but tests passed: status stays implementing", async () => {
    const jobId = await insertJob(db, 1)

    // 4 edit failures but the agent eventually got tests passing
    const outputWithRecovery = [
      "✗ edit failed",
      "✗ edit failed",
      "✗ edit failed",
      "✗ edit failed",
      "→ Write apps/web/app/api/tests/apiRoutes.test.ts",
      "All tests passed (52 passed, 0 failed)",
    ].join("\n")

    const spawnMock = mock(async () => ({ output: outputWithRecovery, sessionId: "sess-ok" }))
    const ctx = makeCtx(db, jobId, spawnMock)

    await implementCodeActivity.execute(ctx as never)

    const [job] = await db.select().from(repoIssueJobs).where(eq(repoIssueJobs.id, jobId))
    expect(job.status).toBe("implementing")
  })

  test("CLI exits 0 but output shows bash failure loop: status becomes failed and throws", async () => {
    const jobId = await insertJob(db, 1)

    const bashError = "Error: The bash tool was called with invalid arguments: [{ expected: \"string\", path: [\"command\"], message: \"Invalid input: expected string, received undefined\" }]"
    const bashLoopOutput = [
      "→ Running baseline tests",
      `✗ bash failed\n${bashError}`,
      `✗ bash failed\n${bashError}`,
      `✗ bash failed\n${bashError}`,
      `✗ bash failed\n${bashError}`,
      `✗ bash failed\n${bashError}`,
    ].join("\n")

    const spawnMock = mock(async () => ({ output: bashLoopOutput, sessionId: "sess-bash" }))
    const ctx = makeCtx(db, jobId, spawnMock)

    await expect(implementCodeActivity.execute(ctx as never)).rejects.toThrow("stuck in")

    const [job] = await db.select().from(repoIssueJobs).where(eq(repoIssueJobs.id, jobId))
    expect(job.status).toBe("failed")
    expect(job.cli_output).toContain("[STUCK LOOP DETECTED]")
    expect(job.cli_output).toContain("bash failure loop")
    expect(spawnMock).toHaveBeenCalledTimes(1)
  })
})
