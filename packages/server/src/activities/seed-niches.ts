import { ulid } from "ulid"
import { eq } from "drizzle-orm"
import { oppNiches, oppNicheRelations } from "../schema"
import type { Activity, ActivityContext, ActivityOutput } from "../types"

interface NicheSeed {
  name: string
  displayName: string
  description: string
  aiAgentFit: number
  trendScore: number
  keywords: string[]
}

interface RelationSeed {
  from: string
  to: string
  type: "value-chain" | "complement" | "prerequisite" | "competes"
  weight: number
  reasoning: string
}

const NICHES: NicheSeed[] = [
  {
    name: "ai-tooling",
    displayName: "AI Tooling",
    description: "Ferramentas, plugins e extensões para desenvolvedores de IA — editors, CLIs, SDKs",
    aiAgentFit: 95,
    trendScore: 90,
    keywords: ["ai tools", "llm sdk", "ai plugin", "ai extension", "copilot", "cursor", "opencode"],
  },
  {
    name: "cli-tooling",
    displayName: "CLI & Dev Experience",
    description: "Command-line interfaces, automações de terminal e dev experience",
    aiAgentFit: 92,
    trendScore: 75,
    keywords: ["cli", "terminal", "shell", "devex", "dx", "developer experience", "automation"],
  },
  {
    name: "llm-integration",
    displayName: "LLM Integration",
    description: "SDKs, APIs e wrappers para integrar modelos de linguagem em aplicações",
    aiAgentFit: 90,
    trendScore: 88,
    keywords: ["llm", "openai", "anthropic", "claude", "gpt", "langchain", "llamaindex", "embedding"],
  },
  {
    name: "code-review-automation",
    displayName: "Code Review Automation",
    description: "Automação de revisão de código, análise estática e sugestões de melhoria",
    aiAgentFit: 88,
    trendScore: 72,
    keywords: ["code review", "static analysis", "linting", "pr review", "codemod", "refactor"],
  },
  {
    name: "test-generation",
    displayName: "Test Generation",
    description: "Geração automática de testes unitários, de integração e E2E via IA",
    aiAgentFit: 87,
    trendScore: 70,
    keywords: ["unit test", "test generation", "tdd", "jest", "vitest", "playwright", "coverage"],
  },
  {
    name: "documentation-ai",
    displayName: "Documentation AI",
    description: "Geração e manutenção de documentação técnica via IA — READMEs, docstrings, wikis",
    aiAgentFit: 85,
    trendScore: 68,
    keywords: ["documentation", "docstring", "readme", "jsdoc", "openapi", "swagger", "wiki"],
  },
  {
    name: "api-development",
    displayName: "API Development",
    description: "Desenvolvimento de APIs REST, GraphQL e SDKs — oportunidades de implementação",
    aiAgentFit: 82,
    trendScore: 65,
    keywords: ["rest api", "graphql", "sdk", "api design", "openapi", "grpc", "webhook"],
  },
  {
    name: "devops-automation",
    displayName: "DevOps Automation",
    description: "CI/CD, infra-as-code, monitoramento e automação de pipelines",
    aiAgentFit: 80,
    trendScore: 70,
    keywords: ["ci/cd", "github actions", "terraform", "docker", "kubernetes", "devops", "infrastructure"],
  },
  {
    name: "web3-security",
    displayName: "Web3 & Smart Contract Security",
    description: "Bug bounties de segurança em blockchains, smart contracts e protocolos DeFi",
    aiAgentFit: 75,
    trendScore: 60,
    keywords: ["smart contract", "solidity", "defi", "bug bounty", "audit", "web3", "ethereum", "solana"],
  },
  {
    name: "oss-contributions",
    displayName: "Open Source Contributions",
    description: "Contribuições pagas para projetos open source — bounties, grants, sponsorships",
    aiAgentFit: 78,
    trendScore: 65,
    keywords: ["open source", "bounty", "hacktoberfest", "gitcoin", "issue", "pull request", "grant"],
  },
  {
    name: "ai-content",
    displayName: "AI Content & Education",
    description: "Criação de conteúdo técnico sobre IA — tutoriais, posts, cursos, reviews",
    aiAgentFit: 70,
    trendScore: 80,
    keywords: ["tutorial", "blog post", "course", "newsletter", "youtube", "ai education", "technical writing"],
  },
]

const RELATIONS: RelationSeed[] = [
  {
    from: "ai-tooling",
    to: "llm-integration",
    type: "value-chain",
    weight: 0.9,
    reasoning: "Ferramentas de AI dependem de integração LLM — mercados diretamente conectados",
  },
  {
    from: "cli-tooling",
    to: "ai-tooling",
    type: "complement",
    weight: 0.8,
    reasoning: "CLIs são o principal delivery de AI tooling para desenvolvedores",
  },
  {
    from: "test-generation",
    to: "code-review-automation",
    type: "complement",
    weight: 0.7,
    reasoning: "Geração de testes e review automático se complementam no ciclo de qualidade",
  },
  {
    from: "ai-content",
    to: "ai-tooling",
    type: "value-chain",
    weight: 0.6,
    reasoning: "Conteúdo sobre AI gera tráfego e leads para ferramentas AI",
  },
  {
    from: "devops-automation",
    to: "llm-integration",
    type: "value-chain",
    weight: 0.65,
    reasoning: "DevOps automatizado cada vez mais usa LLMs para análise de logs, alertas e playbooks",
  },
  {
    from: "documentation-ai",
    to: "ai-tooling",
    type: "complement",
    weight: 0.7,
    reasoning: "Docs gerados por IA são um feature central das AI tooling platforms",
  },
  {
    from: "api-development",
    to: "llm-integration",
    type: "prerequisite",
    weight: 0.75,
    reasoning: "Integração LLM requer APIs bem definidas — API dev é pré-requisito",
  },
  {
    from: "oss-contributions",
    to: "ai-tooling",
    type: "value-chain",
    weight: 0.7,
    reasoning: "Contribuições OSS em projetos de AI tooling constroem reputação e abrem contratos",
  },
  {
    from: "web3-security",
    to: "api-development",
    type: "complement",
    weight: 0.5,
    reasoning: "Projetos DeFi precisam de APIs seguras — nichos complementares",
  },
  {
    from: "code-review-automation",
    to: "test-generation",
    type: "complement",
    weight: 0.7,
    reasoning: "Review sugere lacunas de teste; gerador de testes preenche",
  },
]

export const seedNichesActivity: Activity = {
  type: "seed-niches",
  displayName: "Seed Niches",
  description: "Insere os nichos base e suas relações de cadeia de valor se ainda não existem",

  async execute(ctx: ActivityContext): Promise<ActivityOutput> {
    const now = Math.floor(Date.now() / 1000)
    let created = 0
    let relationsCreated = 0

    // Upsert nichos
    const nicheIdByName = new Map<string, string>()

    for (const seed of NICHES) {
      const [existing] = await ctx.db
        .select({ id: oppNiches.id })
        .from(oppNiches)
        .where(eq(oppNiches.name, seed.name))
        .limit(1)

      if (existing) {
        nicheIdByName.set(seed.name, existing.id)
        continue
      }

      const id = ulid()
      await ctx.db.insert(oppNiches).values({
        id,
        name: seed.name,
        displayName: seed.displayName,
        description: seed.description,
        aiAgentFit: seed.aiAgentFit,
        trendScore: seed.trendScore,
        keywords: JSON.stringify(seed.keywords),
        opportunityCount: 0,
        createdAt: now,
        updatedAt: now,
      })
      nicheIdByName.set(seed.name, id)
      created++
    }

    // Inserir relações
    for (const rel of RELATIONS) {
      const fromId = nicheIdByName.get(rel.from)
      const toId = nicheIdByName.get(rel.to)
      if (!fromId || !toId) continue

      try {
        await ctx.db.insert(oppNicheRelations).values({
          id: ulid(),
          fromNicheId: fromId,
          toNicheId: toId,
          relationType: rel.type,
          weight: rel.weight,
          reasoning: rel.reasoning,
          createdAt: now,
        })
        relationsCreated++
      } catch {
        // UNIQUE constraint — relação já existe, ignorar
      }
    }

    return {
      summary: `Seeded ${created} new niches (${NICHES.length - created} already existed), ${relationsCreated} relations created`,
      extra: { totalNiches: NICHES.length, created, relationsCreated },
    }
  },
}
