import { ulid } from "ulid"
import { eq, and } from "drizzle-orm"
import { Octokit } from "@octokit/rest"
import { tmpdir } from "os"
import { rm } from "fs/promises"
import path from "path"
import { oppOpportunities, oppSubmissions } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"

interface SubmitGithubPrInput {
  opportunity_id: string
  force?: boolean    // ignora dedup e tenta novamente
}

/** Extrai owner/repo/issueNumber de uma URL do GitHub */
function parseGithubUrl(url: string): { owner: string; repo: string; issueNumber: number } | null {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/)
  if (!m) return null
  return { owner: m[1], repo: m[2], issueNumber: parseInt(m[3]) }
}

/** Executa comando git no diretório especificado */
async function runGit(args: string[], cwd: string): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
    },
  })
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  await proc.exited
  if (proc.exitCode !== 0) throw new Error(`git ${args[0]}: ${err.trim().slice(0, 300)}`)
  return out.trim()
}

export const submitGithubPrActivity: Activity = {
  type: "submit-github-pr",
  displayName: "Submit GitHub PR",
  description: "Fork + OpenCode implementa + abre PR no GitHub (com dedup)",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as SubmitGithubPrInput
    if (!input.opportunity_id) throw new Error("opportunity_id é obrigatório")

    const githubToken = process.env.GITHUB_TOKEN
    if (!githubToken) throw new Error("GITHUB_TOKEN não configurado")

    const [opp] = await ctx.db
      .select()
      .from(oppOpportunities)
      .where(eq(oppOpportunities.id, input.opportunity_id))
      .limit(1)

    if (!opp) throw new Error(`Oportunidade não encontrada: ${input.opportunity_id}`)
    if (!opp.url) throw new Error("Oportunidade sem URL — impossível identificar repo alvo")

    const parsed = parseGithubUrl(opp.url)
    if (!parsed) throw new Error(`URL não reconhecida como issue GitHub: ${opp.url}`)

    const now = Math.floor(Date.now() / 1000)

    // ── Dedup: verifica se já existe submissão pending/submitted para esta opp ──
    if (!input.force) {
      const [existing] = await ctx.db
        .select({ id: oppSubmissions.id, status: oppSubmissions.status, externalUrl: oppSubmissions.externalUrl })
        .from(oppSubmissions)
        .where(
          and(
            eq(oppSubmissions.opportunityId, opp.id),
            eq(oppSubmissions.platform, "github"),
          ),
        )
        .limit(1)

      if (existing && ["submitted", "accepted", "pending-approval"].includes(existing.status)) {
        return {
          summary: `PR já submetido (status: ${existing.status}) — ${existing.externalUrl ?? ""}`,
          extra: { skipped: true, submission_id: existing.id },
        }
      }
    }

    const octokit = new Octokit({ auth: githubToken })

    // ── Resolve usuário autenticado ──────────────────────────────────────────
    const { data: user } = await octokit.users.getAuthenticated()
    const forkOwner = user.login

    // ── Fork do repo alvo (idempotente) ──────────────────────────────────────
    let forkRepo: string
    try {
      const { data: fork } = await octokit.repos.createFork({
        owner: parsed.owner,
        repo: parsed.repo,
      })
      forkRepo = fork.full_name
      // Aguarda o fork ficar disponível (GitHub demora alguns segundos)
      await new Promise((r) => setTimeout(r, 3000))
    } catch {
      // Fork pode já existir
      forkRepo = `${forkOwner}/${parsed.repo}`
    }

    // ── Clone do fork ────────────────────────────────────────────────────────
    const workDir = path.join(tmpdir(), `opencode-pr-${opp.id}-${Date.now()}`)
    const cloneUrl = `https://x-access-token:${githubToken}@github.com/${forkRepo}.git`
    const branchName = `opencode-fix/issue-${parsed.issueNumber}-${Date.now()}`

    try {
      await runGit(["clone", "--depth=1", cloneUrl, workDir], tmpdir())
      await runGit(["config", "user.email", "opencode-agent@users.noreply.github.com"], workDir)
      await runGit(["config", "user.name", "OpenCode Agent"], workDir)
      await runGit(["checkout", "-b", branchName], workDir)

      // ── Roda OpenCode para implementar ─────────────────────────────────────
      const task = buildImplementationTask(opp, parsed)
      await ctx.spawnOpenCode(task, workDir)

      // ── Verifica se houve mudanças ──────────────────────────────────────────
      const status = await runGit(["status", "--porcelain"], workDir)
      if (!status.trim()) {
        return {
          summary: "OpenCode não gerou mudanças — PR não criado",
          extra: { no_changes: true },
        }
      }

      // ── Commit e push ────────────────────────────────────────────────────────
      await runGit(["add", "-A"], workDir)
      await runGit(["commit", "-m", `fix: resolve issue #${parsed.issueNumber}\n\nAutomated fix by OpenCode agent.\nRef: ${opp.url}`], workDir)
      await runGit(["push", "origin", branchName], workDir)

      // ── Cria PR via Octokit ─────────────────────────────────────────────────
      const reward = opp.rewardMax ?? opp.rewardMin ?? 0
      const { data: pr } = await octokit.pulls.create({
        owner: parsed.owner,
        repo: parsed.repo,
        head: `${forkOwner}:${branchName}`,
        base: "main",
        title: `fix: ${opp.title}`,
        body: buildPrBody(opp, parsed, reward),
        draft: false,
      })

      // ── Registra submissão ──────────────────────────────────────────────────
      const submissionId = ulid()
      await ctx.db.insert(oppSubmissions).values({
        id: submissionId,
        opportunityId: opp.id,
        platform: "github",
        submissionType: "pr",
        externalUrl: pr.html_url,
        status: "submitted",
        repoUrl: `https://github.com/${forkRepo}`,
        prNumber: pr.number,
        submittedAt: now,
        triggeredBy: ctx.queueItemId,
        createdAt: now,
        updatedAt: now,
      })

      // Atualiza status da opp
      await ctx.db
        .update(oppOpportunities)
        .set({ status: "applied", updatedAt: now })
        .where(eq(oppOpportunities.id, opp.id))

      // Enfileira verificação de outcome em 24h
      await ctx.enqueue("verify-submission-outcome", { submission_id: submissionId }, { priority: 8 })

      return {
        summary: `PR aberto: ${pr.html_url}`,
        extra: { pr_url: pr.html_url, pr_number: pr.number, submission_id: submissionId },
      }
    } finally {
      // Limpeza do workspace temporário
      await rm(workDir, { recursive: true, force: true }).catch(() => {})
    }
  },
}

function buildImplementationTask(
  opp: { title: string; description: string | null; url: string | null },
  parsed: { owner: string; repo: string; issueNumber: number },
): string {
  return `You are an autonomous software agent. Implement a fix for this GitHub issue.

ISSUE: ${opp.title}
URL: ${opp.url ?? "N/A"}
REPO: ${parsed.owner}/${parsed.repo}

DESCRIPTION:
${(opp.description ?? "No description provided.").slice(0, 2000)}

INSTRUCTIONS:
1. Read the issue carefully and understand the requirements
2. Find the relevant code files to modify
3. Implement a clean, minimal fix that addresses the issue
4. Ensure your changes don't break existing functionality
5. Add tests if the project has a test suite
6. Keep changes focused — only fix what the issue describes

Do NOT commit or push — just make the code changes.`
}

function buildPrBody(
  opp: { title: string; url: string | null; score: number | null },
  parsed: { issueNumber: number },
  reward: number,
): string {
  return `## Summary

Automated fix for #${parsed.issueNumber}: **${opp.title}**

${reward > 0 ? `💰 Bounty: $${reward} USD\n\n` : ""}

## Changes

This PR was generated by an OpenCode autonomous agent analyzing and implementing a solution for the referenced issue.

## Testing

Please review the changes and run the existing test suite to verify correctness.

---
*Generated by [OpenCode](https://opencode.ai) autonomous agent*
${opp.url ? `\nRef: ${opp.url}` : ""}`
}
