# Roadmap: Agent Autônomo — Fases de Evolução

> Status: em execução | Branch: homolog | Última atualização: 2026-03-18

---

## Visão

Transformar o OpenCode Server em um agente autônomo de geração de receita que:

1. **Encontra** oportunidades de trabalho (bounties, freelance, grants, conteúdo)
2. **Avalia** com LLM contextualizado pelo histórico de aprendizado
3. **Executa** o trabalho de forma autônoma (fork → implementa → testa → PR)
4. **Aprende** com cada outcome (aceito/rejeitado/pago)
5. **Se auto-dirige** — ajusta estratégia, thresholds e foco sem intervenção humana
6. **Se auto-melhora** — eventualmente propõe e aplica mudanças no próprio código

O objetivo de longo prazo é que o agente substitua a necessidade de engenharia manual para evolução do pipeline — ele mesmo detecta gargalos, propõe correções e as implementa.

---

## Estado Atual (2026-03-18)

### O que está funcionando

```
Nível 1 — Operacional (90% completo)

[opportunity-collector] cron 4h
  ├─ scan-github-bounties
  ├─ scan-gitcoin-bounties
  ├─ scan-freelance-jobs
  ├─ scan-content-jobs
  ├─ scan-immunefi-bounties
  └─ scan-hackerone-programs

[opportunity-analyst] cron 2h
  └─ score-opportunity (LLM + learnings context)
       └─ score >= 60 → classify-niche
            └─ score >= 75 + ai_agent_suitable → classify-workspace-strategy
                 ├─ fork-temp    → submit-github-pr (fork + impl + testes + PR)
                 ├─ dedicated-repo → create-dedicated-repo → execute-opportunity
                 └─ extend-repo  → execute-opportunity

[verify-submission-outcome] polling
  └─ PR merged/rejected/TTL → extract-learnings → Qdrant (se embed disponível)

[Dashboard] Activity Queue, Pipelines, Proposals, Opportunities,
            Niches, Market, Submissions, Discovery, Specs, Brain
```

### Gaps conhecidos no Nível 1

| Gap | Descrição | Impacto |
|-----|-----------|---------|
| PR comment capture | `verify-submission-outcome` só lê merged/closed, não lê comentários do revisor | Não sabe por que foi rejeitado |
| Skill gap detection | `skillsRequired` das oportunidades nunca é comparado com `agentLearnings` de skill | Aceita trabalho além da capacidade atual |
| Win rate no scorer | `positiveCount`/`negativeCount` existem mas ninguém os usa para calibrar score | Score descontextualizado do histórico real |

---

## Os 3 Níveis de Autonomia

### Nível 1 — Autonomia Operacional
> O agente **executa** trabalho de forma autônoma.

Pipeline end-to-end funcional: encontrar → avaliar → classificar → executar → submeter → verificar → aprender. O agente opera sem intervenção em cada ciclo individual.

**Status: QUASE COMPLETO** — gaps residuais acima.

---

### Nível 2 — Autonomia Estratégica
> O agente **decide o que fazer** com base em performance histórica.

O agente analisa seus próprios resultados (win rates, receita, gargalos) e ajusta sua estratégia: em quais nichos focar, quais plataformas priorizar, quais thresholds usar, quando escalar ou recuar.

**Status: INFRAESTRUTURA EXISTE, IMPLEMENTAÇÃO FALTA**

Componentes presentes mas não funcionais:
- `strategy_analyzer` pipeline → **stub**, não faz análise real
- `executor.ts` → **só muda status**, não aplica proposals
- `daemonProposals` → gerados mas nunca executados
- Thresholds (`score >= 60/75/90`, `MAX_IMPL_RETRIES`) → **hardcoded** no código

---

### Nível 3 — Meta-autonomia
> O agente **melhora a si mesmo** — prompts, configs, código.

Em 4 fases progressivas de risco crescente:

| Fase | O que o agente modifica | Risco | Gate |
|------|------------------------|-------|------|
| 3.1 | Seus próprios **prompts** de scoring/classificação | Baixo | Aprovação humana |
| 3.2 | **Configurações e thresholds** via daemonPipelines.configJson | Médio | Aprovação humana |
| 3.3 | Gera novos **scanners/activities** como código | Alto | Revisão + CI |
| 3.4 | Propõe mudanças na **lógica central** do pipeline | Máximo | Revisão obrigatória |

**Status: NÃO EXISTE** — fundação começa no Nível 2.

---

## Arquitetura dos Loops de Autonomia

```
┌─────────────────── LOOP OPERACIONAL (Nível 1) ──────────────────────┐
│                                                                       │
│  Collector → Analyst → Scorer → Classifier → Executor → Submitter   │
│                                    ↑                                  │
│  Verifier → extract-learnings ─────┘ (feedback de outcomes)          │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘

┌─────────────────── LOOP ESTRATÉGICO (Nível 2) ──────────────────────┐
│                                                                       │
│  [strategy_analyzer] (cron semanal)                                   │
│    ├─ lê: daemonRevenue, daemonGoals, oppSubmissions, agentLearnings  │
│    ├─ computa: win_rate por niche/platform, ROI, gargalos             │
│    ├─ LLM: "O que mudar para melhorar performance?"                   │
│    └─ gera: daemonProposals (change_threshold, focus_niche, etc.)     │
│                                                                       │
│  [Human approval] via dashboard aba Proposals                         │
│                                                                       │
│  [executor.ts] aplica proposal aprovada:                              │
│    ├─ change_threshold → update daemonPipelines.configJson            │
│    ├─ focus_niche → update niche priority                             │
│    ├─ create_pipeline → insert daemonPipelines                        │
│    └─ disable_scanner → update pipeline config                        │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘

┌─────────────────── LOOP META (Nível 3) ─────────────────────────────┐
│                                                                       │
│  Fase 3.1: strategy_analyzer propõe novo SCORE_SYSTEM prompt         │
│    → executor salva no configJson do pipeline                         │
│    → score-opportunity lê o prompt do config em vez do hardcoded      │
│                                                                       │
│  Fase 3.2: strategy_analyzer propõe threshold=80 (em vez de 75)      │
│    → executor atualiza configJson                                     │
│    → classify-niche lê threshold do config do pipeline                │
│                                                                       │
│  Fase 3.3: strategy_analyzer detecta "plataforma X com bounties"     │
│    → gera código do scanner como texto                                │
│    → abre PR no próprio repo para revisão humana                      │
│                                                                       │
│  Fase 3.4: strategy_analyzer detecta gargalo na lógica               │
│    → propõe mudança de código específica                              │
│    → abre PR com diff para revisão obrigatória                        │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

---

## Sprint A — Nível 2: Autonomia Estratégica

> **Objetivo:** O agente analisa sua própria performance e propõe ajustes que podem ser aprovados e executados.

### A1 — Implementar `strategy_analyzer` com LLM real

**Arquivo:** `packages/server/src/pipelines/strategy_analyzer.ts`

**O que fazer:**
1. Carregar dados reais: `daemonRevenue` (últimos N dias), `daemonGoals`, `oppSubmissions` por niche/platform, `agentLearnings` de alta confiança
2. Calcular métricas: win rate por niche, win rate por platform, receita por tipo, gargalos (muitas oportunidades classificadas mas poucas executadas, etc.)
3. Chamar LLM com essas métricas + prompt de "analista de estratégia"
4. Parsear resposta em 2-5 `daemonProposals` concretas

**Tipos de proposal que deve gerar:**

| actionType | Descrição | Exemplo |
|------------|-----------|---------|
| `change_threshold` | Alterar threshold de score | `{ field: "auto_execute_min_score", from: 75, to: 70 }` |
| `focus_niche` | Aumentar prioridade de um niche | `{ niche: "web3-security", reason: "win_rate 0.6" }` |
| `deprioritize_niche` | Reduzir foco em niche fraco | `{ niche: "content-blog", reason: "win_rate 0.1" }` |
| `disable_scanner` | Desativar fonte pouco produtiva | `{ scanner: "scan-gitcoin-bounties", reason: "0 aceitos em 30d" }` |
| `increase_batch_size` | Processar mais oportunidades por ciclo | `{ pipeline: "opportunity-analyst", field: "batch_size", from: 20, to: 40 }` |
| `create_pipeline` | Criar pipeline para novo scanner | `{ strategy: "scan-new-platform", config: {...} }` |

**Critério de aceite:**
- Pipeline gera pelo menos 1 proposal com dados reais (não stub)
- Proposal contém `proposedConfig` com JSON estruturado e acionável
- `autoApprovable: true` apenas para proposals de risco `low` com confiança > 0.85

---

### A2 — Implementar `executor.ts` para aplicar proposals

**Arquivo:** `packages/server/src/executor.ts`

**O que fazer:**
Para cada `actionType`, implementar a ação correspondente:

```
change_threshold
  → lê proposedConfig.field + proposedConfig.to
  → faz UPDATE no configJson do daemonPipeline correspondente

focus_niche / deprioritize_niche
  → lê proposedConfig.niche
  → UPDATE opp_niches.ai_agent_fit (aumenta/diminui)

disable_scanner
  → lê proposedConfig.scanner
  → UPDATE daemon_pipelines SET enabled=0 WHERE strategy=scanner

increase_batch_size
  → lê proposedConfig.pipeline + field + to
  → UPDATE daemon_pipelines.config_json com novo valor

create_pipeline
  → lê proposedConfig.strategy + config
  → INSERT daemon_pipelines com configJson fornecido
```

**Critério de aceite:**
- Aprovar uma proposal `change_threshold` via dashboard efetivamente muda o configJson
- Log claro de "proposal X aplicada: campo Y mudou de A para B"
- Erro capturado e reportado se proposal tem formato inválido

---

### A3 — Thresholds configuráveis via pipeline configJson

**Arquivos:** `classify-niche.ts`, `score-opportunity.ts`, `opportunity-analyst.ts`

**O que fazer:**
Mover constantes hardcoded para leitura do `configJson` do pipeline correspondente, com fallback para o valor atual:

```typescript
// Antes (hardcoded):
const autoExecute = aiAgentSuitable && (opp.score ?? 0) >= 75

// Depois (configurable):
const minScore = ctx.pipelineConfig?.auto_execute_min_score ?? 75
const autoExecute = aiAgentSuitable && (opp.score ?? 0) >= minScore
```

**Thresholds a tornar configuráveis:**

| Constante | Pipeline | configJson key | Default |
|-----------|----------|----------------|---------|
| `score >= 60` (classify) | opportunity-analyst | `classify_min_score` | 60 |
| `score >= 75` (auto-execute) | opportunity-analyst | `auto_execute_min_score` | 75 |
| `score >= 90` (Telegram alert) | opportunity-analyst | `alert_min_score` | 90 |
| `batch_size = 20` | opportunity-analyst | `batch_size` | 20 |
| `MAX_IMPL_RETRIES = 2` | opportunity-analyst | `max_impl_retries` | 2 |

**Critério de aceite:**
- Aprovar uma proposal `change_threshold { field: "auto_execute_min_score", to: 70 }` muda o comportamento do pipeline na próxima execução

---

## Sprint B — Nível 1 Residual: Fechar Gaps Operacionais

> **Objetivo:** Completar o loop de aprendizado com dados mais ricos sobre rejeições e skills.

### B1 — Capturar comentários de revisão do GitHub

**Arquivo:** `activities/verify-submission-outcome.ts`

**O que fazer:**
Quando PR for fechado sem merge, antes de enfileirar `extract-learnings`:
1. Chamar `octokit.pulls.listReviewComments` + `octokit.issues.listComments`
2. Salvar comentários relevantes no `outputJson` da submission
3. Passar esses comentários para `extract-learnings` como contexto adicional

**Critério de aceite:**
- Submission rejeitada tem campo `rejection_reasons` preenchido com comentários do PR
- `extract-learnings` usa esses comentários para gerar aprendizados mais específicos (ex: "código rejeitado por falta de testes unitários na camada X")

---

### B2 — Skill gap detection antes de enfileirar execução

**Arquivo:** `activities/classify-niche.ts`

**O que fazer:**
Antes de enfileirar `classify-workspace-strategy`:
1. Parsear `opp.skillsRequired` (JSON array)
2. Query em `agentLearnings` por `category='skill'` e `signal='negative'` para as skills requeridas
3. Se skill tem `negativeCount > 2` e `confidence < 0.4` → não auto-enfileirar (status permanece `shortlisted` para revisão manual)
4. Registrar no `outputJson` quais skills foram identificadas como gap

**Critério de aceite:**
- Oportunidade que requer "Solidity" com histórico de falhas não é auto-executada
- Dashboard Opportunities mostra flag "skill gap" para essas oportunidades

---

### B3 — Win rate por niche/platform no contexto do scorer

**Arquivo:** `activities/score-opportunity.ts`

**O que fazer:**
Na função `buildLearningsContext`, além dos learnings textuais, adicionar uma seção de métricas:

```
PERFORMANCE HISTÓRICA:
- web3-security: 8 submissões, 5 aceitas (win rate 62%), avg reward $340
- github bounties: 12 submissões, 7 aceitas (win rate 58%)
- content-blog: 6 submissões, 1 aceita (win rate 17%) ← evitar
```

Esses números vêm de uma query em `oppSubmissions` JOIN `oppOpportunities` JOIN `oppNiches`.

**Critério de aceite:**
- Prompt do scorer inclui seção de win rates reais
- Oportunidades em nichos com win rate baixo recebem penalização no score

---

## Sprint C — Nível 3, Fase 1: Agente Ajusta Seus Próprios Prompts

> **Objetivo:** O agente identifica que um prompt está produzindo resultados ruins e propõe uma versão melhorada.

### C1 — Prompts como configuração

**O que fazer:**
Mover `SCORE_SYSTEM`, `CLASSIFY_SYSTEM` e `STRATEGY_SYSTEM` de constantes hardcoded para campos no `configJson` dos pipelines. Valor default no banco = texto atual.

### C2 — strategy_analyzer propõe atualização de prompt

**O que fazer:**
Quando win rate de um niche cai abaixo de threshold:
1. `strategy_analyzer` identifica o gargalo no scoring
2. Gera proposal `actionType: 'update_prompt'` com o novo texto sugerido
3. Human aprova no dashboard
4. `executor.ts` salva o novo prompt no `configJson`
5. Próxima execução usa o prompt atualizado

**Gate humano:** Sempre requer aprovação — nunca auto-aprovável.

---

## Sprint D — Nível 3, Fase 2: Thresholds Dinâmicos e Auto-calibração

> **Objetivo:** O agente calibra seus próprios limiares de decisão com base em performance real.

### D1 — Calibração do scorer

**O que fazer:**
Nova activity `calibrate-scorer`:
1. Query: para cada faixa de score previsto (60-69, 70-79, 80-89, 90+), qual foi a taxa de aceite real?
2. Se score previsto 80-89 tem taxa de aceite < 20% → o scorer está superestimando
3. Gera proposal `change_threshold` com ajuste baseado nos dados
4. Opcionalmente, gera aprendizado no `agentLearnings`: "scorer sobreestima bounties de Solidity"

### D2 — Auto-ajuste de batch size

**O que fazer:**
`strategy_analyzer` observa que queue está sempre vazia (processando rápido) → propõe aumentar `batch_size`. Ou queue está sempre cheia → propõe diminuir.

---

## Sprint E — Nível 3, Fase 3: Geração de Novos Scanners

> **Objetivo:** O agente detecta uma nova plataforma de oportunidades e gera o código do scanner.

### E1 — Identificação de novas plataformas

**O que fazer:**
`strategy_analyzer` inclui no prompt: "Baseado nos nichos de alta performance, existem plataformas de bounties/freelance não cobertas pelos scanners atuais?"

Se LLM identifica uma plataforma:
1. Gera proposal `actionType: 'generate_scanner'`
2. `proposedConfig` inclui: nome da plataforma, URL base, tipo de auth, estrutura esperada das oportunidades

### E2 — Activity `generate-scanner-code`

**O que fazer:**
Nova activity que, dado um `proposal_id` de tipo `generate_scanner`:
1. Chama LLM com o spec da plataforma + template do scanner existente (ex: `scan-github-bounties.ts`)
2. Gera código TypeScript do novo scanner
3. Abre PR no próprio repositório opencode via GitHub API
4. PR fica em draft para revisão humana

**Gate humano:** PR sempre em draft, requer merge manual após revisão.

---

## Sprint F — Nível 3, Fase 4: Auto-modificação de Lógica

> **Objetivo:** O agente detecta um gargalo no próprio código e propõe um PR de correção.

> **⚠️ Fase de alto risco — requer CI completo, sandbox de testes e revisão obrigatória.**

### F1 — Self-debugging activity

**O que fazer:**
Quando uma activity falha sistematicamente (ex: `submit-github-pr` falha em > 50% das execuções em uma semana):
1. `strategy_analyzer` detecta o padrão
2. Gera proposal `actionType: 'debug_activity'`
3. Nova activity `propose-code-fix`:
   - Lê o código atual da activity com falha
   - Lê os `errorMessage` das execuções falhadas
   - LLM analisa e propõe correção
   - Abre PR no repositório com a correção proposta
4. Human revisa e faz merge

**Gates obrigatórios:**
- PR nunca auto-mergeado
- CI deve passar (typecheck + testes)
- Reviewer humano obrigatório

---

## Critérios de Progressão entre Níveis

| De → Para | Critério mínimo |
|-----------|-----------------|
| Nível 1 → Nível 2 | Pipeline end-to-end funcionando por 7 dias sem intervenção humana operacional |
| Nível 2 → Nível 3.1 | strategy_analyzer gerando proposals úteis e executor aplicando-as corretamente por 14 dias |
| Nível 3.1 → 3.2 | Pelo menos 3 proposals de prompt aprovadas e aplicadas com melhora mensurável de win rate |
| Nível 3.2 → 3.3 | Auto-ajuste de thresholds demonstrando melhora de win rate > 10% em 30 dias |
| Nível 3.3 → 3.4 | Scanner gerado automaticamente funcionando em produção por 14 dias |

---

## Decisões de Arquitetura

### Por que `daemonProposals` como intermediário?

Todas as mudanças estratégicas passam por `daemonProposals` — nunca aplicadas diretamente. Isso garante:
- **Auditabilidade:** histórico completo de o que o agente quis fazer
- **Gate humano:** aprovação obrigatória antes de qualquer ação
- **Reversibilidade:** é possível rejeitar uma proposal antes de ela ser executada
- **Gradualidade:** `autoApprovable` pode ser ligado apenas para tipos de proposal com risco comprovadamente baixo

### Por que configJson em vez de env vars para thresholds?

- `configJson` é mutável em runtime (o executor pode atualizar via SQL)
- `env vars` requerem restart do servidor para mudar
- Permite que diferentes pipelines tenham diferentes thresholds simultaneamente
- O dashboard pode expor o configJson atual de cada pipeline para visualização

### Por que PRs no próprio repo (Fases 3/4) em vez de aplicar diretamente?

- Git history preserva o que o agente propôs
- CI valida antes de chegar ao branch principal
- Reviewer humano tem contexto completo do diff
- Reversível facilmente via revert
- Confiança gradual: inicialmente todos como draft, depois de track record positivo pode virar PR normal

---

## Referências

- [autonomous-opportunities-board.md](autonomous-opportunities-board.md) — plano original do sistema de oportunidades
- [autonomous-operation-revenue.md](autonomous-operation-revenue.md) — visão de geração de receita autônoma
- [architecture/autonomous-agent-loops.md](../architecture/autonomous-agent-loops.md) — diagramas dos loops de autonomia
- `packages/server/src/pipelines/strategy_analyzer.ts` — pipeline estratégico (stub a ser implementado)
- `packages/server/src/executor.ts` — executor de proposals (a ser implementado)
- `packages/server/src/activities/extract-learnings.ts` — extração de aprendizados
- `packages/server/src/schema.ts` — tabelas `daemon_proposals`, `agent_learnings`
