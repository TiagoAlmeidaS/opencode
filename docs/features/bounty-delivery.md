# Bounty delivery flow

> Última atualização: 2026-03-19

## Resumo

Fluxo padronizado para entrega de bounties pelo agente autônomo. Toda bounty com URL GitHub é resolvida via **fork + PR** no upstream — repositórios dedicados avulsos são exceção rara, decidida exclusivamente pelo LLM com alta confiança.

## Problema anterior

O agente criava repositórios separados (`dedicated-repo`) para bounties que pediam "build", "create" ou "implement" — palavras comuns em qualquer bounty. Resultado: repos avulsos na conta do agente sem fork, sem PR no upstream, sem conexão com o projeto original.

Além disso, não havia sinalização prévia na issue antes de começar a trabalhar, causando competição com outros contribuidores e PRs duplicadas.

## Fluxo atual

```
classify-workspace-strategy (LLM + GitHub context)
  │
  ├─ fork-temp ──→ claim-bounty-issue ──→ generate-spec ──→ TDD ──→ impl ──→ PR
  │                   │
  │                   └─ issue já claimada → abort
  │
  ├─ dedicated-repo ──→ create-dedicated-repo ──→ dev cycle
  │   (RARO: só sem repo-alvo)
  │
  └─ extend-repo ──→ dev cycle direto no repo existente
```

### 1. Classificação (`classify-workspace-strategy`)

Antes de decidir a estratégia, a activity busca contexto real do GitHub via Octokit:

- **Repo**: full_name, description, language, topics
- **Issue** (se URL contém `/issues/N`): title, body, labels, assignees, state, comments

O LLM recebe esse contexto enriquecido e decide com uma regra forte: se existe URL GitHub, a resposta deve ser `fork-temp`. O LLM também retorna `should_skip` quando detecta que a issue já tem assignee ou está fechada.

Sem LLM disponível, a heurística de fallback retorna `fork-temp` sempre — `dedicated-repo` requer decisão explícita do LLM.

### 2. Claim (`claim-bounty-issue`)

Novo passo entre classificação e ciclo de desenvolvimento. Antes de começar a implementar:

1. Verifica se a issue está fechada → aborta
2. Verifica se tem assignee de outro usuário → aborta
3. Verifica se o agente já comentou (idempotência) → pula comentário
4. Posta comentário: "Working on this. Will submit a PR shortly."
5. Inicia o ciclo de desenvolvimento (`ensureOppDevCycle`)

### 3. Dev cycle (spec → TDD → impl → docs → PR)

Ciclo existente sem alterações. O PR é aberto via fork no upstream.

## Regras

| Regra | Descrição |
|-------|-----------|
| **Fork-first** | Toda bounty com URL GitHub = fork + PR. Sem exceção na heurística. |
| **Dedicated-repo é raro** | Só via LLM, só quando não há repo-alvo (ex: Gitcoin grant pedindo "crie uma tool nova"). |
| **Claim antes de implementar** | O agente comenta na issue antes de começar. Se já tem assignee, aborta. |
| **Idempotência** | Se o agente já comentou "Working on this", não comenta de novo. |
| **Empate** | Primeira PR que passa CI e atende critérios de aceite. |

## Configuração

| Variável | Uso |
|----------|-----|
| `GITHUB_TOKEN` | Fetch de contexto, claim (comentário), fork, PR |
| `MEMORY_LLM_PROVIDER` | LLM para classificação (Anthropic, OpenAI, OpenRouter, Azure) |

## Arquivos relacionados

- `packages/server/src/activities/classify-workspace-strategy.ts` — classificação LLM + GitHub context
- `packages/server/src/activities/claim-bounty-issue.ts` — claim automático na issue
- `packages/server/src/activities/create-dedicated-repo.ts` — criação de repo dedicado (chamado raramente)
- `packages/server/src/opp-dev-cycle.ts` — orquestra o ciclo de desenvolvimento
- `packages/server/src/repo-job-chain.ts` — chain de activities (spec → TDD → impl → docs → PR)
