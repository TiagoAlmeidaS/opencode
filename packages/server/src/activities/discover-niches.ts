import { ulid } from "ulid"
import { desc } from "drizzle-orm"
import { oppNiches, agentLearnings } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"

interface Input {
  max_new?: number
  focus_hint?: string
  enqueue_relations?: boolean
}

const SYS = `You suggest NEW market niches for an autonomous AI coding agent to earn revenue (bounties, OSS, freelance, grants, APIs, SaaS).
Return ONLY valid JSON array, no markdown. Each item:
{ "name": "kebab-case-unique-slug", "display_name": "Human Title", "description": "1-3 sentences", "ai_agent_fit": 0-100, "trend_score": 0-100, "keywords": ["..."] }
Do not repeat niches already listed. Prefer underserved, high-fit for LLM agents.`

function slugify(raw: string): string {
  const s = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 56)
  return s || `niche-${Date.now().toString(36)}`
}

type Suggestion = {
  name: string
  display_name: string
  description: string
  ai_agent_fit: number
  trend_score: number
  keywords: string[]
}

export const discoverNichesActivity: Activity = {
  type: "discover-niches",
  displayName: "Discover Niches",
  description: "LLM propõe novos nichos; insere em opp_niches com dedup; opcionalmente enfileira analyze-niche-relations",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const input = ctx.input as unknown as Input
    if (!ctx.memoryLlm) throw new Error("memoryLlm indisponível para discover-niches")

    const maxNew = Math.min(12, Math.max(1, input.max_new ?? 5))
    const hint = (input.focus_hint ?? "").trim()
    const doRelations = input.enqueue_relations !== false

    const existing = await ctx.db
      .select({ name: oppNiches.name, displayName: oppNiches.displayName })
      .from(oppNiches)
    const existingNames = new Set(existing.map((n) => n.name.toLowerCase()))
    const catalog = existing
      .slice(0, 80)
      .map((n) => `${n.name}: ${n.displayName}`)
      .join("\n")

    const learnings = await ctx.db
      .select({ title: agentLearnings.title, body: agentLearnings.body })
      .from(agentLearnings)
      .orderBy(desc(agentLearnings.updatedAt))
      .limit(12)

    const learnBlock =
      learnings.length > 0
        ? `\nRecent agent learnings (signals):\n${learnings.map((l) => `- ${l.title}: ${(l.body ?? "").slice(0, 120)}`).join("\n")}`
        : ""

    const prompt = `Existing niches (do NOT duplicate or trivially rename):\n${catalog}\n${learnBlock}\n${hint ? `\nOperator focus: ${hint}\n` : ""}\nPropose exactly ${maxNew} NEW niches as JSON array only.`

    const raw = await ctx.memoryLlm({ system: SYS, prompt, maxTokens: 2500 })
    const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
    let list: Suggestion[]
    try {
      const parsed = JSON.parse(clean)
      list = Array.isArray(parsed) ? parsed : (parsed as { niches?: Suggestion[] }).niches ?? []
    } catch {
      throw new Error(`discover-niches: JSON inválido — ${raw.slice(0, 180)}`)
    }

    const now = Math.floor(Date.now() / 1000)
    let inserted = 0
    const createdNames: string[] = []
    const seen = new Set<string>()

    for (const item of list.slice(0, maxNew + 4)) {
      const rawName = String(item.name ?? "").trim() || String(item.display_name ?? "").trim()
      if (!rawName) continue
      const name = slugify(rawName)
      if (!name || seen.has(name) || existingNames.has(name)) continue
      seen.add(name)
      existingNames.add(name)

      const displayName = String(item.display_name ?? name).trim().slice(0, 120) || name
      const description = String(item.description ?? "").trim().slice(0, 500) || null
      const fit = Math.min(100, Math.max(0, Number(item.ai_agent_fit) || 70))
      const trend = Math.min(100, Math.max(0, Number(item.trend_score) || 60))
      const kw = Array.isArray(item.keywords) ? item.keywords.map(String).slice(0, 12) : []

      const id = ulid()
      try {
        await ctx.db.insert(oppNiches).values({
          id,
          name,
          displayName,
          description,
          aiAgentFit: fit,
          trendScore: trend,
          keywords: kw.length ? JSON.stringify(kw) : null,
          opportunityCount: 0,
          createdAt: now,
          updatedAt: now,
        })
        inserted++
        createdNames.push(name)
      } catch {
        /* unique name race */
      }
    }

    if (doRelations && inserted > 0) {
      for (const nm of createdNames) {
        await ctx.enqueue(
          "analyze-niche-relations",
          { niche_name: nm },
          {
            priority: 7,
            relatedOpportunityId: `niche-discover:${nm}`,
          },
        )
      }
    }

    return {
      summary: `Discover niches: ${inserted} novo(s) inserido(s)${doRelations && inserted ? "; relações enfileiradas" : ""}`,
      extra: { inserted, names: createdNames },
    }
  },
}
