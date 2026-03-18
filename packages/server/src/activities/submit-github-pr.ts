import { ulid } from "ulid"
import { eq, and } from "drizzle-orm"
import { Octokit } from "@octokit/rest"
import { tmpdir } from "os"
import { rm } from "fs/promises"
import path from "path"
import { oppOpportunities, oppSubmissions } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"
import { getBountyWalletSnippet } from "../financial-config"

interface SubmitGithubPrInput {
  opportunity_id: string
  force?: boolean    // ignora dedup e tenta novamente
}

/** Aceita qualquer URL github.com — extrai owner/repo e, se presente, issueNumber */
function parseGithubUrl(url: string): { owner: string; repo: string; issueNumber: number | null } | null {
  const base = url.match(/github\.com\/([^/]+)\/([^/?#]+)/)
  if (!base) return null
  const repoName = base[2].replace(/\.git$/, "")
  const issueMatch = url.match(/\/issues\/(\d+)/)
  return {
    owner: base[1],
    repo: repoName,
    issueNumber: issueMatch ? parseInt(issueMatch[1]) : null,
  }
}

/** Executa comando git no diretório especificado */
async function runGit(args: string[], cwd: string): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  })
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  await proc.exited
  if (proc.exitCode !== 0) throw new Error(`git ${args[0]}: ${err.trim().slice(0, 300)}`)
  return out.trim()
}

/** Executa um comando arbitrário — retorna sucesso e output combinado */
async function runCommand(cmd: string, cwd: string): Promise<{ success: boolean; output: string }> {
  const parts = cmd.split(/\s+/)
  const proc = Bun.spawn(parts, { cwd, stdout: "pipe", stderr: "pipe" })
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  await proc.exited
  return {
    success: proc.exitCode === 0,
    output: (out + "\n" + err).trim().slice(0, 3000),
  }
}

/** Detecta o comando de teste do projeto pelo tipo de linguagem/ferramentas */
async function detectTestCommand(cwd: string): Promise<string | null> {
  // Node / Bun — package.json scripts
  try {
    const pkg = JSON.parse(await Bun.file(path.join(cwd, "package.json")).text()) as {
      scripts?: Record<string, string>
    }
    if (pkg.scripts?.["test:ci"])  return "npm run test:ci"
    if (pkg.scripts?.["test"] && !pkg.scripts.test.includes("no test")) return "npm test"
  } catch {}

  // Go
  if (await Bun.file(path.join(cwd, "go.mod")).exists()) return "go test ./..."

  // Rust
  if (await Bun.file(path.join(cwd, "Cargo.toml")).exists()) return "cargo test"

  // Python — pytest
  if (
    await Bun.file(path.join(cwd, "pytest.ini")).exists() ||
    await Bun.file(path.join(cwd, "pyproject.toml")).exists() ||
    await Bun.file(path.join(cwd, "setup.py")).exists()
  ) return "python -m pytest --tb=short -q"

  // Ruby — RSpec
  if (await Bun.file(path.join(cwd, "Gemfile")).exists()) return "bundle exec rspec --format progress"

  // Java — Maven
  if (await Bun.file(path.join(cwd, "pom.xml")).exists()) return "mvn test -q"

  // PHP — composer
  if (await Bun.file(path.join(cwd, "composer.json")).exists()) return "composer test"

  return null
}

const MAX_IMPL_RETRIES = 2   // 3 tentativas no total (1 inicial + 2 retries)

export const submitGithubPrActivity: Activity = {
  type: "submit-github-pr",
  displayName: "Submit GitHub PR",
  description: "Fork + implementa + valida testes + abre PR no GitHub (com dedup e retry loop)",

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
    if (!parsed) throw new Error(`URL não é um repositório GitHub reconhecido: ${opp.url}`)

    const now = Math.floor(Date.now() / 1000)

    // ── Dedup: verifica se já existe submissão ativa para esta opp ────────────
    if (!input.force) {
      const [existing] = await ctx.db
        .select({ id: oppSubmissions.id, status: oppSubmissions.status, externalUrl: oppSubmissions.externalUrl })
        .from(oppSubmissions)
        .where(and(eq(oppSubmissions.opportunityId, opp.id), eq(oppSubmissions.platform, "github")))
        .limit(1)

      if (existing && ["submitted", "accepted", "pending-approval"].includes(existing.status)) {
        return {
          summary: `PR já submetido (status: ${existing.status}) — ${existing.externalUrl ?? ""}`,
          extra: { skipped: true, submission_id: existing.id },
        }
      }
    }

    const octokit = new Octokit({ auth: githubToken })

    // ── Resolve usuário e branch padrão ──────────────────────────────────────
    await ctx.updateProgress?.("Autenticando no GitHub...")
    const { data: user } = await octokit.users.getAuthenticated()
    const forkOwner = user.login

    let defaultBranch = "main"
    try {
      const { data: repoInfo } = await octokit.repos.get({ owner: parsed.owner, repo: parsed.repo })
      defaultBranch = repoInfo.default_branch
    } catch {}

    // ── Fork do repo alvo (idempotente) ──────────────────────────────────────
    await ctx.updateProgress?.(`Fork: criando ${parsed.owner}/${parsed.repo}...`)
    let forkRepo: string
    try {
      const { data: fork } = await octokit.repos.createFork({ owner: parsed.owner, repo: parsed.repo })
      forkRepo = fork.full_name
      await new Promise((r) => setTimeout(r, 3000))
    } catch {
      forkRepo = `${forkOwner}/${parsed.repo}`
    }

    const workDir = path.join(tmpdir(), `opencode-pr-${opp.id}-${Date.now()}`)
    const branchName = parsed.issueNumber
      ? `opencode-fix/issue-${parsed.issueNumber}-${Date.now()}`
      : `opencode-impl/${opp.id.slice(-8)}-${Date.now()}`
    const cloneUrl = `https://x-access-token:${githubToken}@github.com/${forkRepo}.git`

    let isDraft = false
    let testsPassed = false
    let testOutput = ""

    try {
      await ctx.updateProgress?.(`Clone: baixando ${forkRepo}...`)
      await runGit(["clone", "--depth=1", cloneUrl, workDir], tmpdir())
      await runGit(["config", "user.email", "opencode-agent@users.noreply.github.com"], workDir)
      await runGit(["config", "user.name", "OpenCode Agent"], workDir)
      await runGit(["checkout", "-b", branchName], workDir)

      // Detecta comando de teste uma vez antes do loop
      const testCommand = await detectTestCommand(workDir)

      // ── Loop de implementação + validação ─────────────────────────────────
      let validationError: string | null = null
      const totalAttempts = MAX_IMPL_RETRIES + 1

      for (let attempt = 1; attempt <= totalAttempts; attempt++) {
        await ctx.updateProgress?.(`Implementando (tentativa ${attempt}/${totalAttempts}): OpenCode trabalhando...`)
        const task = buildImplementationTask(opp, parsed, validationError)
        await ctx.spawnOpenCode(task, workDir)

        // Na primeira tentativa: verifica se houve mudanças
        if (attempt === 1) {
          const status = await runGit(["status", "--porcelain"], workDir)
          if (!status.trim()) {
            return { summary: "OpenCode não gerou mudanças — PR não criado", extra: { no_changes: true } }
          }
        }

        // Sem testes detectados: aceita a implementação como está
        if (!testCommand) {
          testsPassed = true
          break
        }

        await ctx.updateProgress?.(`Testes (${attempt}/${totalAttempts}): rodando ${testCommand}...`)
        const result = await runCommand(testCommand, workDir)
        if (result.success) {
          testsPassed = true
          testOutput = result.output
          await ctx.updateProgress?.(`Testes (${attempt}/${totalAttempts}): PASSOU`)
          break
        }

        testOutput = result.output

        if (attempt <= MAX_IMPL_RETRIES) {
          await ctx.updateProgress?.(`Testes (${attempt}/${totalAttempts}): FALHOU — retry...`)
          validationError = result.output
        } else {
          await ctx.updateProgress?.(`Testes (${attempt}/${totalAttempts}): FALHOU — abrindo como DRAFT`)
          isDraft = true
        }
      }

      // ── Commit e push ────────────────────────────────────────────────────
      await ctx.updateProgress?.("Commit: preparando mudanças...")
      await runGit(["add", "-A"], workDir)
      const commitMsg = parsed.issueNumber
        ? `fix: resolve issue #${parsed.issueNumber}\n\nAutomated fix by OpenCode agent.\nRef: ${opp.url}`
        : `feat: ${opp.title.slice(0, 60)}\n\nAutomated implementation by OpenCode agent.\nRef: ${opp.url}`
      await runGit(["commit", "-m", commitMsg], workDir)
      await ctx.updateProgress?.(`Push: enviando branch ${branchName}...`)
      await runGit(["push", "origin", branchName], workDir)

      // ── Cria PR ──────────────────────────────────────────────────────────
      await ctx.updateProgress?.(`PR: abrindo pull request${isDraft ? " (DRAFT)" : ""}...`)
      const reward = opp.rewardMax ?? opp.rewardMin ?? 0
      const { data: pr } = await octokit.pulls.create({
        owner: parsed.owner,
        repo: parsed.repo,
        head: `${forkOwner}:${branchName}`,
        base: defaultBranch,
        title: isDraft ? `[NEEDS REVIEW] ${opp.title}` : `fix: ${opp.title}`,
        body: buildPrBody(opp, parsed, reward, getBountyWalletSnippet(), isDraft ? testOutput : null),
        draft: isDraft,
      })

      // ── Registra submissão ───────────────────────────────────────────────
      const submissionId = ulid()
      await ctx.db.insert(oppSubmissions).values({
        id: submissionId,
        opportunityId: opp.id,
        platform: "github",
        submissionType: "pr",
        externalUrl: pr.html_url,
        status: isDraft ? "draft" : "submitted",
        repoUrl: `https://github.com/${forkRepo}`,
        prNumber: pr.number,
        submittedAt: now,
        triggeredBy: ctx.queueItemId,
        createdAt: now,
        updatedAt: now,
      })

      await ctx.db
        .update(oppOpportunities)
        .set({ status: "applied", updatedAt: now })
        .where(eq(oppOpportunities.id, opp.id))

      await ctx.enqueue("verify-submission-outcome", { submission_id: submissionId }, { priority: 9 })

      const attemptsUsed = isDraft ? MAX_IMPL_RETRIES + 1 : 1
      return {
        summary: isDraft
          ? `PR DRAFT aberto após ${attemptsUsed} tentativas (testes ainda falhando): ${pr.html_url}`
          : `PR aberto (${testsPassed && testOutput ? "testes OK" : "sem suite de testes"}): ${pr.html_url}`,
        extra: {
          pr_url: pr.html_url,
          pr_number: pr.number,
          is_draft: isDraft,
          tests_passed: testsPassed,
          test_command: (await detectTestCommand(workDir).catch(() => null)) ?? "none",
        },
      }
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => {})
    }
  },
}

function buildImplementationTask(
  opp: { title: string; description: string | null; url: string | null },
  parsed: { owner: string; repo: string; issueNumber: number | null },
  validationError: string | null = null,
): string {
  const context = parsed.issueNumber
    ? `ISSUE #${parsed.issueNumber}\nURL: ${opp.url ?? "N/A"}\nREPO: ${parsed.owner}/${parsed.repo}`
    : `TASK: ${opp.title}\nREPO: ${parsed.owner}/${parsed.repo}\nURL: ${opp.url ?? "N/A"}`

  const retryContext = validationError
    ? `\n\nPREVIOUS ATTEMPT FAILED TESTS:\n\`\`\`\n${validationError.slice(0, 1500)}\n\`\`\`\n\nFix the implementation so tests pass. Read the error output carefully and address the root cause.`
    : ""

  return `You are an autonomous software agent. Implement a solution for the following:

${context}

DESCRIPTION:
${(opp.description ?? "No description provided.").slice(0, 2000)}

INSTRUCTIONS:
1. Read the task carefully and understand the requirements
2. Find the relevant code files to modify
3. Implement a clean, minimal solution that fully addresses the requirements
4. Write or update tests to cover your changes if the project has a test suite
5. Make sure existing tests continue to pass
6. Keep changes focused — only implement what is required${retryContext}

Do NOT commit or push — just make the code changes.`
}

function buildPrBody(
  opp: { title: string; url: string | null; score: number | null },
  parsed: { issueNumber: number | null },
  reward: number,
  walletSnippet: string,
  failedTestOutput: string | null,
): string {
  const issueRef = parsed.issueNumber ? `Closes #${parsed.issueNumber}\n\n` : ""
  const draftWarning = failedTestOutput
    ? `\n\n> **Note:** This PR was created as a draft because automated tests did not pass after ${MAX_IMPL_RETRIES + 1} implementation attempts. Human review is required before merging.\n\n<details><summary>Test output from last attempt</summary>\n\n\`\`\`\n${failedTestOutput.slice(0, 1500)}\n\`\`\`\n\n</details>\n`
    : ""

  return `## Summary

${issueRef}**${opp.title}**
${reward > 0 ? `\n💰 Bounty: $${reward} USD\n` : ""}${draftWarning}

## Changes

This PR was generated by an OpenCode autonomous agent analyzing and implementing a solution for the referenced task.

## Testing

Please review the changes and run the existing test suite to verify correctness.
${walletSnippet ? `\n\n## Payment\n\n${walletSnippet}` : ""}

---
*Generated by [OpenCode](https://opencode.ai) autonomous agent*
${opp.url ? `\nRef: ${opp.url}` : ""}`
}
