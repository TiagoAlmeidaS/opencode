/**
 * Activity: execute-opportunity
 * Usa o OpenCode CLI (subprocess) para tentar executar/implementar uma oportunidade.
 * Suporta loop de validação: executa comando de validação após implementação e retenta até 3x em caso de falha.
 */
import { eq } from "drizzle-orm"
import { oppOpportunities, projectSpecs } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"
import { compileSpecToPrompt } from "../spec-compiler"

interface ExecuteOpportunityInput {
  opportunity_id: string
  cwd?: string                    // diretório de trabalho (default: process.cwd())
  dry_run?: boolean                // se true, apenas loga sem executar
  spec_id?: string                 // optional spec for domain context
  validation_command?: string      // ex: "npm run lint", "docker compose config" — roda após implementação
  max_retries?: number             // tentativas de implementação+validação (default: 3)
}

async function runValidation(cmd: string, cwd: string): Promise<{ ok: boolean; stderr: string; stdout: string }> {
  const shell = process.platform === "win32" ? "cmd.exe" : "sh"
  const flag = process.platform === "win32" ? "/c" : "-c"
  const proc = Bun.spawn([shell, flag, cmd], { cwd, stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  await proc.exited
  return { ok: proc.exitCode === 0, stdout, stderr }
}

export const executeOpportunityActivity: Activity = {
  type: "execute-opportunity",
  displayName: "Execute Opportunity",
  description: "Executa uma oportunidade via OpenCode CLI como subprocess",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as ExecuteOpportunityInput
    if (!input.opportunity_id) throw new Error("opportunity_id é obrigatório")

    const [opp] = await ctx.db
      .select()
      .from(oppOpportunities)
      .where(eq(oppOpportunities.id, input.opportunity_id))
      .limit(1)

    if (!opp) throw new Error(`Oportunidade não encontrada: ${input.opportunity_id}`)

    if (opp.status === "applied" || opp.status === "won") {
      return {
        summary: `Oportunidade já executada (status: ${opp.status}) — skipped`,
        extra: { skipped: true, status: opp.status },
      }
    }

    const now = Math.floor(Date.now() / 1000)
    const cwd = input.cwd ?? process.cwd()

    if (input.dry_run) {
      return {
        summary: `[dry-run] Oportunidade "${opp.title}" marcada como aplicada`,
        extra: { dry_run: true, opportunity_id: opp.id },
      }
    }

    let specContext = ""
    if (input.spec_id) {
      const [spec] = await ctx.db.select().from(projectSpecs).where(eq(projectSpecs.id, input.spec_id)).limit(1)
      if (spec) specContext = compileSpecToPrompt(spec) + "\n\n---\n\n"
    }

    const maxRetries = Math.max(1, input.max_retries ?? 3)
    const validationCmd = input.validation_command?.trim()
    let lastOutput = ""
    let validationError = ""

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const baseTask = specContext + buildTask(opp)
      const task =
        validationError
          ? `${baseTask}\n\n---\n\nVALIDATION FAILED (attempt ${attempt}/${maxRetries}). Fix the following errors:\n\n${validationError}`
          : baseTask

      try {
        lastOutput = await ctx.spawnOpenCode(task, cwd)
      } catch (err) {
        if (attempt === maxRetries) {
          await ctx.db
            .update(oppOpportunities)
            .set({ status: "shortlisted", updatedAt: Math.floor(Date.now() / 1000) })
            .where(eq(oppOpportunities.id, opp.id))
          throw err
        }
        validationError = err instanceof Error ? err.message : String(err)
        continue
      }

      if (!validationCmd) break

      const val = await runValidation(validationCmd, cwd)
      if (val.ok) break

      validationError = [val.stderr, val.stdout].filter(Boolean).join("\n").trim().slice(0, 2000)
      if (attempt === maxRetries) {
        await ctx.db
          .update(oppOpportunities)
          .set({ status: "shortlisted", updatedAt: Math.floor(Date.now() / 1000) })
          .where(eq(oppOpportunities.id, opp.id))
        throw new Error(`Validation failed after ${maxRetries} attempts:\n${validationError}`)
      }
    }

    const finishedAt = Math.floor(Date.now() / 1000)
    await ctx.db
      .update(oppOpportunities)
      .set({ status: "applied", updatedAt: finishedAt })
      .where(eq(oppOpportunities.id, opp.id))

    if (opp.type === "content") {
      await ctx.enqueue("deliver-content", { opportunity_id: opp.id, output_preview: lastOutput.slice(0, 500) }, { priority: 8 })
    }

    return {
      summary: `Oportunidade "${opp.title}" executada com sucesso`,
      extra: {
        opportunity_id: opp.id,
        output_preview: lastOutput.slice(0, 500),
      },
    }
  },
}

function buildTask(opp: {
  type: string
  title: string
  description: string | null
  url: string | null
  skillsRequired: string | null
  rewardMax: number | null
  rewardMin: number | null
  difficulty: string | null
}): string {
  const skills = opp.skillsRequired
    ? (() => { try { return (JSON.parse(opp.skillsRequired) as string[]).join(", ") } catch { return opp.skillsRequired } })()
    : "not specified"

  const reward = opp.rewardMax ?? opp.rewardMin ?? 0

  if (opp.type === "bug-bounty") {
    return `You are an autonomous security researcher working on a bug bounty program.

OPPORTUNITY:
Type: ${opp.type}
Title: ${opp.title}
URL: ${opp.url ?? "N/A"}
Max Reward: $${reward} USD
Difficulty: ${opp.difficulty ?? "unknown"}
Skills required: ${skills}

DESCRIPTION:
${(opp.description ?? "No description provided.").slice(0, 2000)}

TASK:
Analyze this bug bounty program and produce a security research report. Follow these steps:
1. Review the scope: identify in-scope assets, vulnerability classes, and exclusions
2. Classify vulnerability classes relevant to the target (smart contract: reentrancy, overflow, access control; web: XSS, SQLi, SSRF, CSRF, auth bypass)
3. Outline a methodical testing approach with specific attack vectors
4. Write a proof-of-concept (PoC) template for the most likely vulnerability class
5. Draft a responsible disclosure report following the platform's format:
   - Executive Summary
   - Vulnerability Details (class, severity, CVSS score estimate)
   - Steps to Reproduce
   - Impact Assessment
   - Suggested Remediation
6. Output the complete report ready for submission

Be precise, technical, and follow responsible disclosure ethics. Focus on high-severity, high-reward vulnerabilities.`
  }

  if (opp.type === "grant") {
    return `You are an autonomous agent writing a grant proposal for open source / crypto funding.

OPPORTUNITY:
Type: ${opp.type}
Title: ${opp.title}
URL: ${opp.url ?? "N/A"}
Reward: $${reward} USD
Difficulty: ${opp.difficulty ?? "unknown"}
Skills required: ${skills}

DESCRIPTION:
${(opp.description ?? "No description provided.").slice(0, 2000)}

TASK:
Write a compelling grant proposal. Follow these steps:
1. Research the grant program requirements from the description
2. Draft the proposal with these sections:
   - Executive Summary (2-3 sentences): what you're building and why it matters
   - Problem Statement: specific pain point being solved
   - Proposed Solution: technical approach and key differentiators
   - Milestones & Timeline: 3-5 concrete deliverables with dates
   - Budget Justification: breakdown of how funds will be used
   - Expected Impact: metrics, adoption potential, ecosystem benefit
   - Team / Credentials: relevant experience and past work
3. Review for alignment with grant criteria
4. Output the complete proposal in the expected format (markdown)

Be specific, measurable, and compelling. Quantify impact wherever possible.`
  }

  if (opp.type === "content") {
    return `You are an autonomous agent working on a content/writing opportunity.

OPPORTUNITY:
Type: ${opp.type}
Title: ${opp.title}
URL: ${opp.url ?? "N/A"}
Reward: $${reward} USD
Difficulty: ${opp.difficulty ?? "unknown"}
Skills required: ${skills}

DESCRIPTION:
${(opp.description ?? "No description provided.").slice(0, 2000)}

TASK:
Analyze this opportunity and produce the requested content. Follow these steps:
1. Read and understand the requirements (format, word count, tone, audience)
2. Plan your structure and approach
3. Write the text, script, copy, or article as specified
4. Deliver in the expected format (document, markdown, etc.)
5. Output a summary of what was produced

Be thorough but focused. Prioritize clear, submittable output.`
  }

  return `You are an autonomous agent working on a revenue opportunity.

OPPORTUNITY:
Type: ${opp.type}
Title: ${opp.title}
URL: ${opp.url ?? "N/A"}
Reward: $${reward} USD
Difficulty: ${opp.difficulty ?? "unknown"}
Skills required: ${skills}

DESCRIPTION:
${(opp.description ?? "No description provided.").slice(0, 2000)}

TASK:
Analyze this opportunity and implement a solution or proposal. Follow these steps:
1. Read and understand the requirements
2. Plan your approach
3. Implement the solution (code, PR, proposal, etc.)
4. Verify your work meets the requirements
5. Output a summary of what was done

Be thorough but focused. Prioritize working, submittable output.`
}
