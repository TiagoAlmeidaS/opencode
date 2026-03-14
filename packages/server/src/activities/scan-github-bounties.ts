import { Octokit } from "@octokit/rest"
import { ulid } from "ulid"
import { eq, and } from "drizzle-orm"
import { oppOpportunities } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"

interface ScanGithubBountiesInput {
  labels?: string[]
  topics?: string[]
  limit?: number
  token?: string
  minRewardUsd?: number
}

// Extrai valor monetário do texto: "$500", "500 USD", "USD 1,000", "bounty: $250"
function extractReward(text: string): { min: number | null; max: number | null } {
  const patterns = [
    /\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*[-–]\s*\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/i, // range $100 - $500
    /(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*USD\s*[-–]\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*USD/i, // range 100 USD - 500 USD
    /\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/i,         // single $500
    /(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*USD/i,        // 500 USD
    /USD\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/i,        // USD 500
    /bounty[:\s]+\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/i, // bounty: 500
  ]

  const parseNum = (s: string) => parseFloat(s.replace(/,/g, ""))

  for (const pat of patterns) {
    const m = text.match(pat)
    if (m) {
      if (m[2]) return { min: parseNum(m[1]), max: parseNum(m[2]) }
      return { min: parseNum(m[1]), max: null }
    }
  }
  return { min: null, max: null }
}

// Extrai skills mencionadas
function extractSkills(text: string): string[] {
  const known = [
    "typescript", "javascript", "python", "rust", "go", "java", "c++", "c#",
    "react", "vue", "svelte", "solidjs", "nextjs", "node", "bun", "deno",
    "docker", "kubernetes", "terraform", "aws", "gcp", "azure",
    "solidity", "ethereum", "web3", "defi",
    "llm", "openai", "anthropic", "langchain", "embedding",
    "graphql", "rest", "grpc", "websocket",
    "postgresql", "sqlite", "redis", "mongodb",
  ]
  const lower = text.toLowerCase()
  return known.filter((s) => lower.includes(s))
}

const BOUNTY_QUERIES = [
  "label:bounty is:open is:issue",
  "label:\"help wanted\" bounty reward is:open is:issue",
  "label:\"good first issue\" bounty is:open is:issue",
  "title:bounty reward is:open is:issue",
]

export const scanGithubBountiesActivity: Activity = {
  type: "scan-github-bounties",
  displayName: "Scan GitHub Bounties",
  description: "Busca issues com bounties no GitHub e registra como oportunidades",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as ScanGithubBountiesInput
    const token = input.token ?? process.env.GITHUB_TOKEN
    const limit = input.limit ?? 30
    const minReward = input.minRewardUsd ?? 0

    const octokit = new Octokit({ auth: token })
    const now = Math.floor(Date.now() / 1000)
    let found = 0
    let created = 0
    let enqueued = 0

    const queries = input.labels
      ? [`label:${input.labels.join(",")} is:open is:issue`]
      : BOUNTY_QUERIES

    for (const q of queries) {
      let page = 1
      while (found < limit) {
        const { data } = await octokit.search.issuesAndPullRequests({
          q,
          sort: "created",
          order: "desc",
          per_page: Math.min(30, limit - found),
          page,
        })

        if (data.items.length === 0) break

        for (const issue of data.items) {
          if (issue.pull_request) continue

          const textToScan = `${issue.title} ${issue.body ?? ""}`
          const reward = extractReward(textToScan)

          if (minReward > 0 && (reward.min ?? 0) < minReward) continue

          found++
          const externalId = String(issue.number) + "@" + (issue.repository_url?.replace("https://api.github.com/repos/", "") ?? "")

          // Verificar se já existe
          const [existing] = await ctx.db
            .select({ id: oppOpportunities.id, lastSeenAt: oppOpportunities.lastSeenAt })
            .from(oppOpportunities)
            .where(
              and(
                eq(oppOpportunities.sourcePlatform, "github"),
                eq(oppOpportunities.externalId, externalId),
              ),
            )
            .limit(1)

          if (existing) {
            // Atualiza last_seen_at
            await ctx.db
              .update(oppOpportunities)
              .set({ lastSeenAt: now, updatedAt: now })
              .where(eq(oppOpportunities.id, existing.id))
            continue
          }

          const skills = extractSkills(textToScan)
          const repoPath = issue.repository_url?.replace("https://api.github.com/repos/", "") ?? ""

          const id = ulid()
          await ctx.db.insert(oppOpportunities).values({
            id,
            type: "oss-bounty",
            sourcePlatform: "github",
            externalId,
            title: issue.title,
            description: (issue.body ?? "").slice(0, 2000),
            url: issue.html_url,
            rewardMin: reward.min,
            rewardMax: reward.max ?? reward.min,
            rewardCurrency: "USD",
            rewardType: reward.max ? "range" : reward.min ? "fixed" : "tip",
            skillsRequired: skills.length ? JSON.stringify(skills) : null,
            status: "new",
            firstSeenAt: now,
            lastSeenAt: now,
            createdAt: now,
            updatedAt: now,
          })
          created++

          // Enfileirar scoring
          await ctx.enqueue("score-opportunity", { opportunity_id: id }, { priority: 6 })
          enqueued++
        }

        if (data.items.length < 30) break
        page++

        // Rate limit: pausa entre páginas
        await new Promise((r) => setTimeout(r, 1500))
      }
    }

    return {
      summary: `GitHub bounties: ${found} encontrados, ${created} novos, ${enqueued} enviados para scoring`,
      extra: { found, created, enqueued },
    }
  },
}
