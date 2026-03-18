# Arquitetura: Loops de Autonomia do OpenCode Agent

> Documento técnico complementar ao [roadmap-autonomous-agent-phases.md](../planning/roadmap-autonomous-agent-phases.md)
> Última atualização: 2026-03-18

---

## Visão Geral

O OpenCode Agent opera em três loops de autonomia aninhados. Cada loop tem um ciclo diferente, uma velocidade de aprendizado diferente e um nível diferente de risco nas ações que toma.

```
┌──────────────────────────────────────────────────────────────────────┐
│                    LOOP META (Nível 3)                                │
│                    ciclo: semanal/mensal                              │
│   ┌────────────────────────────────────────────────────────────────┐ │
│   │               LOOP ESTRATÉGICO (Nível 2)                       │ │
│   │               ciclo: diário/semanal                            │ │
│   │  ┌──────────────────────────────────────────────────────────┐  │ │
│   │  │           LOOP OPERACIONAL (Nível 1)                     │  │ │
│   │  │           ciclo: horas                                   │  │ │
│   │  │                                                          │  │ │
│   │  │   Collect → Score → Classify → Execute → Submit → Learn  │  │ │
│   │  │                                                          │  │ │
│   │  └──────────────────────────────────────────────────────────┘  │ │
│   │                                                                  │ │
│   │   Analyze Performance → Propose Strategy → Apply (human gate)   │ │
│   │                                                                  │ │
│   └────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│   Observe Self → Propose Improvement → PR + CI → Merge (human gate)  │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Loop 1 — Operacional

### Diagrama de Fluxo Completo

```
┌─────────────────────────────────────────────────────────────────────┐
│  COLETA (cron: a cada 4h)                                            │
│                                                                      │
│  opportunity-collector pipeline                                      │
│    ├─ scan-github-bounties    → GitHub Issues com label "bounty"     │
│    ├─ scan-gitcoin-bounties   → Gitcoin Grants API                   │
│    ├─ scan-freelance-jobs     → Plataformas freelance                │
│    ├─ scan-content-jobs       → Plataformas de conteúdo              │
│    ├─ scan-immunefi-bounties  → Immunefi bug bounties                │
│    └─ scan-hackerone-programs → HackerOne programs                   │
│                                                                      │
│    Output: INSERT opp_opportunities (status="new")                   │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ cron: a cada 2h (offset 30min)
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ANÁLISE (opportunity-analyst pipeline)                              │
│                                                                      │
│  SELECT opp_opportunities WHERE status="new"                         │
│    → enqueue score-opportunity (priority 6) para cada opp            │
│                                                                      │
│  SELECT opp_opportunities WHERE status="scored"                      │
│    AND updatedAt < (now - rescore_days)                              │
│    → enqueue score-opportunity para re-análise                       │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ daemon_queue
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SCORING (score-opportunity activity)                                │
│                                                                      │
│  1. Carrega opp + contexto do agentLearnings (top 6 por confiança)  │
│  2. Carrega métricas de win rate por niche/platform [Sprint B3]      │
│  3. Chama LLM: score 0-100 + análise + tags                         │
│  4. UPDATE opp (score, status="scored", llmAnalysis)                 │
│                                                                      │
│  SE score >= classify_min_score (default: 60):                       │
│    → enqueue classify-niche (priority 6)                             │
│  SENÃO:                                                              │
│    → status="discarded"                                              │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│  CLASSIFICAÇÃO DE NICHE (classify-niche activity)                    │
│                                                                      │
│  1. Chama LLM: determina niche + ai_agent_suitable (bool)           │
│  2. INSERT/UPDATE opp_niches                                         │
│  3. UPDATE opp status="shortlisted"                                  │
│                                                                      │
│  SE ai_agent_suitable AND score >= auto_execute_min_score (def: 75): │
│    → enqueue classify-workspace-strategy (priority 6)               │
│  SENÃO [Sprint B2]:                                                   │
│    → checa skill gaps em agentLearnings                              │
│    → se skill gap detectado: mantém "shortlisted" (revisão manual)  │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│  CLASSIFICAÇÃO DE WORKSPACE (classify-workspace-strategy activity)   │
│                                                                      │
│  LLM analisa o repositório alvo e determina estratégia:              │
│                                                                      │
│  "fork-temp"      → enqueue submit-github-pr (priority 5)           │
│  "dedicated-repo" → enqueue create-dedicated-repo (priority 4)      │
│  "extend-repo"    → enqueue execute-opportunity (priority 5)        │
└──────┬───────────────────────┬────────────────────────┬─────────────┘
       │ fork-temp             │ dedicated-repo         │ extend-repo
       ▼                       ▼                        ▼
┌────────────────┐    ┌──────────────────┐    ┌──────────────────────┐
│ submit-github  │    │ create-dedicated │    │ execute-opportunity  │
│ -pr            │    │ -repo            │    │                      │
│                │    │                  │    │ OpenCode implementa  │
│ Fork → Clone   │    │ Cria repo GitHub │    │ no workspace atual   │
│ → Impl (LLM)   │    │ → execute-opp    │    │                      │
│ → Test Loop    │    │                  │    │                      │
│ → Commit+Push  │    │                  │    │                      │
│ → Create PR    │    │                  │    │                      │
└───────┬────────┘    └────────┬─────────┘    └──────────┬───────────┘
        │                      │                          │
        └──────────────────────┴──────────────────────────┘
                               │ INSERT opp_submissions
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  VERIFICAÇÃO DE OUTCOME (verify-submission-outcome activity)         │
│                                                                      │
│  polling via daemon_queue (priority 9→10)                            │
│                                                                      │
│  Lê status do PR via GitHub API:                                     │
│    merged  → status="accepted" → enqueue extract-learnings (P6)     │
│    closed  → captura review comments [Sprint B1]                     │
│            → status="rejected" → enqueue extract-learnings (P7)     │
│    open    → re-enqueue verify-submission-outcome se não expirou     │
│    TTL exp → status="expired"  → enqueue extract-learnings (P7)     │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│  EXTRAÇÃO DE APRENDIZADOS (extract-learnings activity)               │
│                                                                      │
│  Contexto de entrada:                                                │
│    - opp: title, description, niche, platform, score                 │
│    - submission: status (accepted/rejected/expired)                  │
│    - review_comments [Sprint B1]                                     │
│                                                                      │
│  LLM extrai 2-6 learnings estruturados:                              │
│    { key, title, body, category, signal, confidence, tags }          │
│                                                                      │
│  UPSERT agent_learnings (incrementa positive/negativeCount)          │
│                                                                      │
│  SE ctx.embed disponível:                                            │
│    → addChunks(learnings) para Qdrant (RAG)                          │
│    → learnings pesquisáveis por similaridade semântica               │
└─────────────────────────────────────────────────────────────────────┘
                    ↑
                    │ agentLearnings injetados no contexto do scorer
                    │ (fecha o loop de aprendizado)
```

### Tabelas Envolvidas

| Tabela | Papel |
|--------|-------|
| `opp_opportunities` | Oportunidades coletadas — estado central do pipeline |
| `opp_niches` | Classificação de nicho por oportunidade |
| `opp_submissions` | Submissões de trabalho (PRs, repos criados) |
| `agent_learnings` | Conhecimento acumulado (positivo/negativo) |
| `daemon_queue` | Fila de execução das activities |
| `daemon_pipelines` | Configuração dos pipelines com cron e configJson |
| `daemon_jobs` | Histórico de execuções dos pipelines |

---

## Loop 2 — Estratégico

### Diagrama de Fluxo

```
┌─────────────────────────────────────────────────────────────────────┐
│  ANÁLISE ESTRATÉGICA (strategy_analyzer pipeline — cron: semanal)    │
│                                                                      │
│  Carrega dados de performance:                                       │
│    ├─ opp_submissions: win rate por (niche × platform)               │
│    ├─ daemon_revenue: receita por tipo (30/90 dias)                  │
│    ├─ daemon_goals: metas e progresso atual                          │
│    ├─ agent_learnings: padrões de alta confiança                     │
│    └─ daemon_queue: taxa de falha por activity type                  │
│                                                                      │
│  Calcula métricas:                                                   │
│    - win rate por niche (aceitos / total submetidos)                 │
│    - ROI por platform (recompensa / tempo estimado)                  │
│    - gargalos (opps classificadas >> opps executadas → threshold alto│
│    - scanners improdutivos (0 aceitos em 30 dias)                    │
│                                                                      │
│  LLM recebe métricas + prompt de "analista de estratégia":           │
│    "Dadas essas métricas, quais 2-5 ações maximizariam receita?"     │
│                                                                      │
│  Output: 2-5 proposals INSERT daemon_proposals                       │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│  DASHBOARD — Aba Proposals                                           │
│                                                                      │
│  Mostra proposals pendentes ao operador:                             │
│    - tipo de ação, justificativa, dados que embasam, risco           │
│    - proposedConfig (o que vai mudar exatamente)                     │
│                                                                      │
│  Ações disponíveis:                                                  │
│    [Aprovar]  → status="approved"                                    │
│    [Rejeitar] → status="rejected"                                    │
│                                                                      │
│  Auto-aprovação (autoApprovable=true):                               │
│    → apenas proposals de risco "low" com confiança > 0.85            │
│    → ex: increase_batch_size, focus_niche com dados sólidos          │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ status="approved"
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│  EXECUTOR (executor.ts)                                              │
│                                                                      │
│  Poll: daemon_proposals WHERE status="approved"                      │
│                                                                      │
│  Por actionType:                                                     │
│                                                                      │
│  change_threshold                                                    │
│    → UPDATE daemon_pipelines.config_json                             │
│    → { field: "auto_execute_min_score", to: 70 }                    │
│    → muda comportamento na próxima execução do pipeline              │
│                                                                      │
│  focus_niche / deprioritize_niche                                    │
│    → UPDATE opp_niches.ai_agent_fit                                  │
│    → opp_niches.priority_score                                       │
│                                                                      │
│  disable_scanner                                                     │
│    → UPDATE daemon_pipelines SET enabled=0 WHERE strategy=scanner    │
│                                                                      │
│  increase_batch_size                                                 │
│    → UPDATE daemon_pipelines.config_json { batch_size: newValue }   │
│                                                                      │
│  create_pipeline                                                     │
│    → INSERT daemon_pipelines com configJson fornecido                │
│                                                                      │
│  UPDATE daemon_proposals SET status="executed", executedAt=now       │
│  LOG: "proposal X aplicada: campo Y mudou de A para B"               │
└─────────────────────────────────────────────────────────────────────┘
                    ↑
                    │ thresholds atualizados afetam Loop 1
                    │ (fecha o loop estratégico)
```

### Tipos de Proposal e Impacto

| actionType | Tabela modificada | Campo | Risco |
|------------|------------------|-------|-------|
| `change_threshold` | `daemon_pipelines` | `config_json.{field}` | Médio |
| `focus_niche` | `opp_niches` | `ai_agent_fit`, `priority_score` | Baixo |
| `deprioritize_niche` | `opp_niches` | `ai_agent_fit`, `priority_score` | Baixo |
| `disable_scanner` | `daemon_pipelines` | `enabled` | Médio |
| `increase_batch_size` | `daemon_pipelines` | `config_json.batch_size` | Baixo |
| `create_pipeline` | `daemon_pipelines` | (novo registro) | Alto |
| `update_prompt` | `daemon_pipelines` | `config_json.{prompt_field}` | Médio |

---

## Loop 3 — Meta (Auto-modificação)

### Diagrama de Fluxo

```
┌─────────────────────────────────────────────────────────────────────┐
│  DETECÇÃO DE OPORTUNIDADE DE MELHORIA                                │
│  (parte do strategy_analyzer — cron: semanal)                       │
│                                                                      │
│  Padrões que disparam propostas meta:                                │
│                                                                      │
│  → win rate de um niche caiu > 20% em 30d                           │
│       Gatilho: proposal update_prompt (Fase 3.1)                     │
│                                                                      │
│  → threshold atual produz falsos positivos (score alto, rejeição)   │
│       Gatilho: proposal change_threshold via calibrate-scorer        │
│       (Fase 3.2)                                                     │
│                                                                      │
│  → nichos de alta performance não têm scanner dedicado               │
│       Gatilho: proposal generate_scanner (Fase 3.3)                  │
│                                                                      │
│  → activity X falha em > 50% das execuções por 7 dias               │
│       Gatilho: proposal debug_activity (Fase 3.4)                    │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
           ┌───────────┴───────────┐
           │ Fase 3.1/3.2          │ Fase 3.3/3.4
           ▼                       ▼
┌──────────────────┐    ┌─────────────────────────────────────────────┐
│ Flui pelo Loop 2 │    │  GERAÇÃO DE CÓDIGO (generate-scanner-code   │
│ (proposal +      │    │   ou propose-code-fix activity)              │
│  executor)       │    │                                              │
│                  │    │  Input: spec da plataforma (Fase 3.3)        │
│ Prompts e        │    │      OU: código da activity + errorMessages  │
│ thresholds são   │    │                                              │
│ configuração     │    │  Template: lê scanner existente como base    │
│ → Loop 2 resolve │    │                                              │
└──────────────────┘    │  LLM gera código TypeScript do novo scanner  │
                        │  ou da correção proposta                     │
                        │                                              │
                        │  OUTPUT: cria PR no próprio repo opencode    │
                        │    - título: "[Agent] Add scanner for X"     │
                        │    - corpo: spec + justificativa + código    │
                        │    - sempre como DRAFT                       │
                        │    - CI roda typecheck + testes              │
                        └─────────────────┬───────────────────────────┘
                                          │
                                          ▼
                        ┌─────────────────────────────────────────────┐
                        │  REVISÃO HUMANA OBRIGATÓRIA                  │
                        │                                              │
                        │  Engenheiro revisa o PR:                     │
                        │    1. Código correto e sem regressões?       │
                        │    2. CI passou?                             │
                        │    3. Impacto no sistema claro?              │
                        │                                              │
                        │  Aprova → merge → código entra em produção   │
                        │  Rejeita → fecha PR + feedback para o agente │
                        └─────────────────────────────────────────────┘
```

### Gates de Segurança por Fase

```
Fase 3.1 — update_prompt
  ┌─────────────────────────────────────────────────────────────┐
  │ autoApprovable: false (sempre)                              │
  │ Gate: aprovação humana via dashboard                        │
  │ Reversão: configJson tem histórico de prompts anteriores    │
  └─────────────────────────────────────────────────────────────┘

Fase 3.2 — change_threshold (calibração)
  ┌─────────────────────────────────────────────────────────────┐
  │ autoApprovable: true SE delta <= 5 pontos E confiança > 0.9 │
  │ Gate: aprovação humana para mudanças > 5 pontos             │
  │ Reversão: configJson anterior disponível em daemon_proposals│
  └─────────────────────────────────────────────────────────────┘

Fase 3.3 — generate_scanner
  ┌─────────────────────────────────────────────────────────────┐
  │ autoApprovable: false (sempre)                              │
  │ Gate: PR em draft + revisão humana + CI obrigatório         │
  │ Isolamento: código novo em arquivo separado                 │
  │ Reversão: reverter merge do PR                              │
  └─────────────────────────────────────────────────────────────┘

Fase 3.4 — debug_activity / propose-code-fix
  ┌─────────────────────────────────────────────────────────────┐
  │ autoApprovable: false (sempre)                              │
  │ Gate: PR em draft + revisão obrigatória + CI + tests pass   │
  │ Requisito: pelo menos 1 reviewer humano aprovando           │
  │ Reversão: git revert                                        │
  └─────────────────────────────────────────────────────────────┘
```

---

## Fluxo de Dados entre Loops

```
                    DADOS QUE SOBEM (feedback up)
                    ┌────────────────────────────────┐
                    │                                │
Loop 1              │                                │
opp_submissions ────┤──→ win rate por niche/platform │
agent_learnings ────┤──→ padrões de skills/nichos    │──→ Loop 2 (strategy_analyzer)
daemon_queue ───────┤──→ taxas de falha de activities│
opp_opportunities ──┘──→ volume de coleta vs aceite  │
                                                     │
Loop 2                                               │
daemon_proposals ────────────────────────────────────┤──→ Loop 3 (quando tipo meta)
performance_metrics ─────────────────────────────────┘

                    DADOS QUE DESCEM (config down)
                    ┌────────────────────────────────┐
                    │                                │
Loop 3              │                                │
PR merged ──────────┤──→ novo código em produção     │──→ Loop 1 (novo scanner/fix)
                    │                                │
Loop 2              │                                │
executor.ts ────────┤──→ configJson atualizado       │──→ Loop 1 (thresholds novos)
                    │──→ niche priorities            │──→ Loop 1 (foco de coleta)
                    │──→ scanner enabled/disabled    │──→ Loop 1 (quais fontes ativas)
                    └────────────────────────────────┘
```

---

## Modelo de Dados — Componentes Críticos

### `agent_learnings` — Memória do Agente

```typescript
{
  id: string           // ulid
  key: string          // slug único (ex: "web3-security-low-test-coverage")
  title: string        // frase curta do aprendizado
  body: string         // detalhamento
  category: string     // "skill" | "niche" | "platform" | "pattern"
  signal: string       // "positive" | "negative" | "neutral"
  confidence: number   // 0.0–1.0 (aumenta com repetição)
  positiveCount: int   // vezes confirmado como positivo
  negativeCount: int   // vezes confirmado como negativo
  tags: string[]       // tags para filtragem
  source: string       // activity que gerou o learning
  createdAt: number    // timestamp unix
  updatedAt: number
}
```

**Como o confidence evolui:**
- Novo learning: confidence = 0.6 (valor inicial do LLM)
- Cada outcome positivo: confidence = min(1.0, confidence + 0.05)
- Cada outcome negativo: confidence = max(0.0, confidence - 0.1)
- Learning com confidence < 0.3 é marcado como obsoleto

### `daemon_proposals` — Decisões Estratégicas

```typescript
{
  id: string
  pipelineId: string | null  // pipeline que gerou
  title: string
  description: string        // justificativa com dados
  actionType: string         // change_threshold | focus_niche | ...
  proposedConfig: JSON        // o que mudar e para quê
  currentConfig: JSON | null  // estado atual (para rollback)
  status: string             // pending | approved | rejected | executed | expired
  riskLevel: string          // low | medium | high
  confidence: number         // 0.0–1.0 (confiança da LLM)
  autoApprovable: boolean    // pode ser aprovado sem intervenção humana?
  expiresAt: number | null   // TTL da proposal (perde validade se dados mudaram)
  executedAt: number | null
  createdAt: number
  updatedAt: number
}
```

### `daemon_pipelines.configJson` — Configuração Dinâmica

```typescript
// Exemplo de configJson para opportunity-analyst
{
  "batch_size": 20,
  "min_reward_usd": 0,
  "rescore_older_than_days": 7,
  "classify_min_score": 60,          // Sprint A3
  "auto_execute_min_score": 75,       // Sprint A3
  "alert_min_score": 90,              // Sprint A3
  "max_impl_retries": 2,              // Sprint A3
  "score_system_prompt": null         // Sprint C1 (null = usa o hardcoded)
}
```

---

## Invariantes de Sistema

Estas propriedades devem ser sempre verdadeiras, independente do nível de autonomia:

1. **Nenhuma ação irreversível sem gate humano** — delete de dados, push forçado, remoção de pipelines ativos
2. **Toda proposta de código passa por CI** — typecheck + testes devem passar antes de qualquer merge
3. **Proposals têm TTL** — uma proposal gerada com dados de semana passada expira e não é aplicada com dados desatualizados
4. **Loop Meta não tem acesso direto à produção** — só via PR ao repositório, nunca via execução direta de código gerado
5. **Aprendizados negativos têm mais peso** — confidence cai mais rápido do que sobe (aprender com erros é mais crítico)
6. **Queue items têm stale lock recovery** — após 30 minutos travado, item volta para "pending" (evita deadlock)

---

## Referências

- [roadmap-autonomous-agent-phases.md](../planning/roadmap-autonomous-agent-phases.md) — plano de implementação com sprints
- [autonomous-opportunities-board.md](../planning/autonomous-opportunities-board.md) — plano original do board de oportunidades
- `packages/server/src/queue.ts` — implementação do QueueProcessor (Loop 1 runtime)
- `packages/server/src/pipelines/strategy_analyzer.ts` — Loop 2 pipeline (stub a implementar)
- `packages/server/src/executor.ts` — aplicação de proposals (a implementar)
- `packages/server/src/activities/extract-learnings.ts` — fechamento do Loop 1
- `packages/server/src/activities/score-opportunity.ts` — score com contexto RAG
- `packages/server/src/schema.ts` — schema completo (agent_learnings, daemon_proposals, etc.)
