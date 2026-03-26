/**
 * Pipeline: pr_monitor
 * Monitors open PRs created by the agent:
 *  1. Updates ci_status for pending/unchecked PRs; undrafts PR when CI passes
 *  2. Detects human commits on the PR branch
 *  3. Sends Telegram reminder when a PR has been open > stale_days without human activity
 */
import { and, inArray, isNull, isNotNull, eq } from "drizzle-orm"
import { Octokit } from "@octokit/rest"
import type { Pipeline, PipelineContext, ContentOutput } from "../types"
import { registerPipeline } from "../registry"
import { repoIssueJobs } from "../schema"
import { checkCIStatus } from "../github-utils"

interface Config {
  stale_days?: number
  batch_size?: number
  agent_bot_login?: string
}

const DEFAULT_STALE_DAYS = 7
const DEFAULT_BATCH = 20

function parsePrUrl(url: string): { owner: string; repo: string; number: number } | null {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
  if (!m) return null
  return { owner: m[1], repo: m[2], number: parseInt(m[3], 10) }
}

async function detectHumanCommits(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  agentLogin: string,
): Promise<{ humanModified: boolean; lastHumanAt: number | null }> {
  const { data: commits } = await octokit.pulls.listCommits({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 50,
  })

  let humanModified = false
  let lastHumanAt: number | null = null

  for (const commit of commits) {
    const login = commit.author?.login ?? ""
    const name = commit.commit.author?.name ?? ""
    const isAgent =
      login === agentLogin ||
      login === "opencode-agent" ||
      name === "OpenCode Agent" ||
      name === agentLogin
    if (!isAgent) {
      humanModified = true
      const date = commit.commit.author?.date
      if (date) {
        const ts = Math.floor(new Date(date).getTime() / 1000)
        if (lastHumanAt === null || ts > lastHumanAt) lastHumanAt = ts
      }
    }
  }

  return { humanModified, lastHumanAt }
}

async function sendTelegramStaleReminder(
  job: typeof repoIssueJobs.$inferSelect,
  staleDays: number,
): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!botToken || !chatId) return

  const msg = [
    `<b>PR aguardando há ${staleDays}+ dias</b>`,
    ``,
    `<b>${job.issueTitle}</b>`,
    ``,
    `<a href="${job.prUrl}">Abrir PR no GitHub</a>`,
    ``,
    `Este PR está aberto sem atividade humana há mais de ${staleDays} dias.`,
    `Aprove, feche ou comente para resolução.`,
  ].join("\n")

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: "HTML" }),
  }).catch(() => {})
}

async function sendTelegramCIPass(job: typeof repoIssueJobs.$inferSelect): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!botToken || !chatId) return

  const msg = [
    `<b>CI passou ✅ — PR pronto para review</b>`,
    ``,
    `<b>${job.issueTitle}</b>`,
    ``,
    `<a href="${job.prUrl}">Abrir PR no GitHub</a>`,
    ``,
    `O PR estava aguardando CI e agora está pronto para merge.`,
  ].join("\n")

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: "HTML" }),
  }).catch(() => {})
}

const prMonitorPipeline: Pipeline = {
  strategy: "pr-monitor",
  displayName: "PR Monitor",

  async execute(ctx: PipelineContext): Promise<ContentOutput | void> {
    const db = ctx.db
    if (!db) return

    const cfg = ctx.config as unknown as Config
    const staleDays = cfg.stale_days ?? DEFAULT_STALE_DAYS
    const batchSize = cfg.batch_size ?? DEFAULT_BATCH
    const agentLogin = cfg.agent_bot_login ?? process.env.GITHUB_BOT_LOGIN ?? "opencode-agent"

    const token = process.env.GITHUB_TOKEN
    if (!token) {
      return { extra: { skipped: true, reason: "GITHUB_TOKEN not set" } }
    }

    const now = Math.floor(Date.now() / 1000)
    const staleThreshold = now - staleDays * 86400

    // Fetch open PRs not yet resolved
    const jobs = await db
      .select()
      .from(repoIssueJobs)
      .where(
        and(
          inArray(repoIssueJobs.status, ["pr-open", "completed", "ci-failing"]),
          isNotNull(repoIssueJobs.prUrl),
          isNull(repoIssueJobs.pr_outcome),
        ),
      )
      .limit(batchSize)

    if (jobs.length === 0) {
      return { extra: { jobs_processed: 0 } }
    }

    const octokit = new Octokit({ auth: token })
    let ciUpdated = 0
    let humanDetected = 0
    let staleReminders = 0
    let undrafted = 0

    for (const job of jobs) {
      const parsed = parsePrUrl(job.prUrl!)
      if (!parsed) continue

      try {
        // 1. CI status check — only for unchecked or still-pending jobs
        if (!job.ci_status || job.ci_status === "pending") {
          const branch =
            job.branchName ??
            (job.issueNumber ? `agent/issue-${job.issueNumber}` : null)

          if (branch) {
            const { conclusion, failingChecks } = await checkCIStatus(
              octokit,
              parsed.owner,
              parsed.repo,
              branch,
            )

            const ciUpdates: Partial<typeof repoIssueJobs.$inferInsert> = {
              ci_status: conclusion,
              ci_checked_at: now,
              updatedAt: now,
            }

            // CI just passed → undraft PR and notify
            if (conclusion === "passing" && job.prDraft === 1 && job.prNumber) {
              try {
                await octokit.pulls.update({
                  owner: parsed.owner,
                  repo: parsed.repo,
                  pull_number: job.prNumber,
                  draft: false,
                })
                ciUpdates.prDraft = 0
                undrafted++
              } catch { /* non-fatal */ }

              // Notify only if CI was previously pending (not just skipped)
              if (job.ci_status === "pending") {
                await sendTelegramCIPass(job)
              }
            }

            await db.update(repoIssueJobs).set(ciUpdates).where(eq(repoIssueJobs.id, job.id))
            ciUpdated++

            if (conclusion === "failing") {
              console.warn(
                `[pr-monitor] CI failing for job ${job.id}: ${failingChecks.join(", ")}`,
              )
            }
          }
        }

        // 2. Human modification check
        if (job.prNumber && !job.pr_human_modified) {
          const { humanModified, lastHumanAt } = await detectHumanCommits(
            octokit,
            parsed.owner,
            parsed.repo,
            job.prNumber,
            agentLogin,
          )

          if (humanModified) {
            await db
              .update(repoIssueJobs)
              .set({
                pr_human_modified: 1,
                pr_last_human_activity_at: lastHumanAt,
                updatedAt: now,
              })
              .where(eq(repoIssueJobs.id, job.id))
            humanDetected++
          }
        }

        // 3. Staleness check — only when no human has touched the PR yet
        if (!job.pr_human_modified && job.createdAt < staleThreshold) {
          await sendTelegramStaleReminder(job, staleDays)
          staleReminders++
        }
      } catch (err) {
        console.warn(`[pr-monitor] erro ao processar job ${job.id}:`, err)
      }
    }

    return {
      extra: {
        jobs_processed: jobs.length,
        ci_updated: ciUpdated,
        undrafted,
        human_commits_detected: humanDetected,
        stale_reminders_sent: staleReminders,
      },
    }
  },
}

registerPipeline(prMonitorPipeline)
