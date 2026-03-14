# Plano: Sistema Autônomo de Análise de Oportunidades

> Status: planejado | Branch: homolog

## Visão Geral

Sistema autônomo que busca, analisa e armazena oportunidades onde um agente AI pode executar trabalho e gerar valor/receita. Integrado ao board Kanban existente e com relatórios via Telegram.

## Objetivos

1. **Coleta de dados de mercado** — cripto, ações, forex, tendências (Google Trends)
2. **Descoberta de oportunidades** — bug bounties, freelance, OSS bounties, conteúdo
3. **Análise com LLM** — score, nicho, cadeia de valor, relacionamentos
4. **Storage estruturado** — 6 novas tabelas no banco SQLite existente
5. **Relatórios Telegram** — diário (8h), semanal (segunda 9h), alertas imediatos (score > 90)
6. **Board Kanban** — colunas: Descobertas / Analisadas / Selecionadas / Em Execução / Concluídas

---

## Schema: Novas Tabelas

### `opp_market_data`
Snapshots de mercado (crypto, stocks, forex, trends).

```sql
CREATE TABLE IF NOT EXISTS opp_market_data (
  id           TEXT PRIMARY KEY,
  asset_type   TEXT NOT NULL,        -- 'crypto'|'stock'|'forex'|'trend'
  symbol       TEXT NOT NULL,        -- 'BTC','ETH','AAPL','USD/BRL'
  price        REAL,
  change_24h   REAL,
  volume_24h   REAL,
  market_cap   REAL,
  source       TEXT NOT NULL,        -- 'coingecko'|'yahoo'|'google-trends'
  raw_json     TEXT,
  collected_at INTEGER NOT NULL,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_market_data_symbol ON opp_market_data(symbol, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_data_type ON opp_market_data(asset_type, collected_at DESC);
```

### `opp_niches`
Mapa de nichos/verticais com AI-agent-fit score.

```sql
CREATE TABLE IF NOT EXISTS opp_niches (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL UNIQUE,
  display_name      TEXT NOT NULL,
  description       TEXT,
  parent_niche_id   TEXT REFERENCES opp_niches(id),
  avg_reward_usd    REAL,
  opportunity_count INTEGER NOT NULL DEFAULT 0,
  trend_score       REAL,            -- 0..100
  ai_agent_fit      REAL,            -- 0..100 quão adequado para agente IA
  keywords          TEXT,            -- JSON array
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_niches_fit ON opp_niches(ai_agent_fit DESC);
```

### `opp_niche_relations`
Cadeia de valor e relacionamentos entre nichos.

```sql
CREATE TABLE IF NOT EXISTS opp_niche_relations (
  id            TEXT PRIMARY KEY,
  from_niche_id TEXT NOT NULL REFERENCES opp_niches(id),
  to_niche_id   TEXT NOT NULL REFERENCES opp_niches(id),
  relation_type TEXT NOT NULL,       -- 'value-chain'|'complement'|'prerequisite'|'competes'
  weight        REAL NOT NULL,       -- 0..1
  reasoning     TEXT,
  created_at    INTEGER NOT NULL,
  UNIQUE(from_niche_id, to_niche_id, relation_type)
);
```

### `opp_opportunities`
Repositório central de oportunidades descobertas.

```sql
CREATE TABLE IF NOT EXISTS opp_opportunities (
  id              TEXT PRIMARY KEY,
  type            TEXT NOT NULL,     -- 'bug-bounty'|'freelance'|'oss-bounty'|'content'|'grant'
  niche_id        TEXT REFERENCES opp_niches(id),
  source_platform TEXT NOT NULL,     -- 'github'|'hackerone'|'gitcoin'|'remoteok'|'hn'
  external_id     TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  url             TEXT,
  reward_min      REAL,
  reward_max      REAL,
  reward_currency TEXT NOT NULL DEFAULT 'USD',
  reward_type     TEXT,              -- 'fixed'|'range'|'tip'|'equity'|'token'
  skills_required TEXT,              -- JSON array: ["typescript","nodejs"]
  difficulty      TEXT,              -- 'easy'|'medium'|'hard'|'expert'
  deadline        INTEGER,
  status          TEXT NOT NULL DEFAULT 'new',  -- 'new'|'scored'|'shortlisted'|'applied'|'won'|'expired'|'ignored'
  score           REAL,              -- 0..100
  score_reason    TEXT,
  llm_analysis    TEXT,              -- JSON análise completa
  first_seen_at   INTEGER NOT NULL,
  last_seen_at    INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  UNIQUE(source_platform, external_id)
);
CREATE INDEX IF NOT EXISTS idx_opp_status_score ON opp_opportunities(status, score DESC);
CREATE INDEX IF NOT EXISTS idx_opp_niche ON opp_opportunities(niche_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_opp_deadline ON opp_opportunities(deadline ASC);
```

### `opp_analyses`
Resultados de análises LLM.

```sql
CREATE TABLE IF NOT EXISTS opp_analyses (
  id             TEXT PRIMARY KEY,
  analysis_type  TEXT NOT NULL,      -- 'opportunity-score'|'niche-map'|'market-digest'|'value-chain'
  scope          TEXT NOT NULL,      -- 'opportunity'|'niche'|'market'|'portfolio'
  scope_id       TEXT,
  prompt_hash    TEXT,
  llm_model      TEXT,
  llm_tokens     INTEGER,
  llm_cost_usd   REAL,
  input_summary  TEXT,
  output         TEXT,
  structured     TEXT,               -- JSON parseado
  quality_score  REAL,
  created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analyses_type ON opp_analyses(analysis_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_scope ON opp_analyses(scope, scope_id);
```

### `opp_telegram_reports`
Histórico de relatórios enviados.

```sql
CREATE TABLE IF NOT EXISTS opp_telegram_reports (
  id               TEXT PRIMARY KEY,
  report_type      TEXT NOT NULL,    -- 'daily'|'weekly'|'alert'|'digest'
  chat_id          TEXT NOT NULL,
  message_id       TEXT,
  content_hash     TEXT NOT NULL,
  opportunity_ids  TEXT,             -- JSON array
  sent_at          INTEGER,
  created_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_telegram_reports ON opp_telegram_reports(report_type, created_at DESC);
```

---

## Activities a Implementar

### Grupo A: Coleta de Mercado (sem LLM, APIs free)

| Activity | Arquivo | API | Frequência |
|---|---|---|---|
| `market-data-crypto` | `activities/market-data-crypto.ts` | CoinGecko (free, sem key) | 1h |
| `market-data-trends` | `activities/market-data-trends.ts` | Google Trends unofficial | 4h |

### Grupo B: Descoberta de Oportunidades (sem LLM, APIs free/public)

| Activity | Arquivo | API | Frequência |
|---|---|---|---|
| `scan-github-bounties` | `activities/scan-github-bounties.ts` | GitHub REST (GITHUB_TOKEN) | 4h |
| `scan-gitcoin-bounties` | `activities/scan-gitcoin-bounties.ts` | Gitcoin API pública | 4h |
| `scan-hackerone-programs` | `activities/scan-hackerone-programs.ts` | HackerOne API pública | 4h |
| `scan-freelance-jobs` | `activities/scan-freelance-jobs.ts` | RemoteOK JSON + WWR RSS | 4h |
| `scan-content-opportunities` | `activities/scan-content-opportunities.ts` | HN Algolia (free) | 4h |

### Grupo C: Análise LLM

| Activity | Arquivo | Consome |
|---|---|---|
| `score-opportunity` | `activities/score-opportunity.ts` | 1 opp → score 0-100 + niche |
| `classify-niche` | `activities/classify-niche.ts` | 1 opp → niche upsert |
| `analyze-niche-relations` | `activities/analyze-niche-relations.ts` | 1 niche novo → grafo de relações |
| `generate-market-digest` | `activities/generate-market-digest.ts` | top-N opps → texto digest |
| `seed-niches` | `activities/seed-niches.ts` | insere nichos base se não existem |

### Grupo D: Execução e Notificação

| Activity | Arquivo |
|---|---|
| `send-telegram-report` | `activities/send-telegram-report.ts` |
| `execute-opportunity` | `activities/execute-opportunity.ts` (spawn OpenCode) |

---

## Pipelines Agendados

| Pipeline | Arquivo | Cron | Descrição |
|---|---|---|---|
| `opportunity-collector` | `pipelines/opportunity_collector.ts` | `0 */4 * * *` | Enfileira todos os scanners |
| `market-data-collector` | `pipelines/market_data_collector.ts` | `0 * * * *` | Cripto + trends |
| `opportunity-analyst` | `pipelines/opportunity_analyst.ts` | `30 */2 * * *` | Score batch das novas opps |
| `daily-opportunity-report` | `pipelines/daily_opportunity_report.ts` | `0 8 * * *` | Digest → Telegram |
| `weekly-opportunity-report` | `pipelines/weekly_opportunity_report.ts` | `0 9 * * 1` | Resumo semanal → Telegram |

---

## Nichos Seed (inseridos pelo `seed-niches`)

```
Tier 1 — Alta adequação para AI agents (ai_agent_fit > 85):
  ai-tooling          (fit: 95) — ferramentas para devs de IA
  cli-tooling         (fit: 92) — CLIs, dev experience
  llm-integration     (fit: 90) — SDKs, APIs, wrappers LLM
  code-review-auto    (fit: 88) — automação de code review
  test-generation     (fit: 87) — geração de testes

Tier 2 — Recompensas maiores (fit: 70-85):
  web3-security       (fit: 75) — bug bounties smart contracts
  devops-automation   (fit: 80) — CI/CD, infra-as-code
  api-development     (fit: 82) — REST/GraphQL/SDKs
  documentation-ai    (fit: 85) — docs automação

Tier 3 — Conteúdo e tendências (fit: 60-70):
  ai-content          (fit: 70) — tutoriais, reviews
  oss-contributions   (fit: 78) — PRs para projetos OSS

Cadeia de valor seed:
  ai-tooling → llm-integration       [value-chain, 0.9]
  cli-tooling → ai-tooling           [complement, 0.8]
  test-generation → code-review-auto [complement, 0.7]
  ai-content → ai-tooling            [value-chain, 0.6]
  devops-automation → llm-integration [value-chain, 0.65]
```

---

## Formato Relatório Telegram

### Diário (8h)
```
<b>🤖 OpenCode Opportunities — Resumo Diário</b>
📅 DD/MM/YYYY

<b>🏆 Top 5 (score > 70):</b>

1. [oss-bounty] Título da oportunidade
   📦 GitHub | 💰 $500 | 🎯 Score: 87/100
   🏷️ Niche: cli-tooling
   🔗 <a href="...">Ver</a>

<b>📈 Mercado:</b>
BTC: $85,400 (+2.3%) | ETH: $3,200 (-0.8%)
Trend "ai coding": ↑ alta

<b>📊 Resumo:</b>
47 oportunidades coletadas | 12 com score > 70
💵 Potencial: $8,500–$42,000
```

### Alerta imediato (score > 90)
```
<b>🚨 ALERTA: Oportunidade Premium</b>
[tipo] Título
💰 $X | 🎯 Score: 95/100 | ⏰ X dias restantes
🔗 <a href="...">Ver agora</a>
```

---

## Mudança Necessária: ActivityContext + LLM

Adicionar ao `ActivityContext` em `types.ts`:
```typescript
memoryLlm?: (opts: MemoryLlmOptions) => Promise<string>
embed?: (text: string) => Promise<number[]>
```

Passar via `QueueProcessorOpts` em `queue.ts` (espelhar o que `RunJobExtra` faz para Pipelines).

---

## Rotas API Novas

```
GET  /opportunities              — lista com filtros: type, status, min_score, niche_id
GET  /opportunities/stats        — agregados por tipo, niche, score range
GET  /opportunities/:id          — detalhe com análise LLM
POST /opportunities/:id/action   — body: { action: 'shortlist'|'ignore'|'apply'|'won' }
GET  /niches                     — lista com métricas
GET  /niches/:id/relations       — cadeia de valor
GET  /market-data                — últimos snapshots por symbol/type
```

---

## Variáveis de Ambiente

```bash
# Já existentes
OPENCODE_TELEGRAM_BOT_TOKEN=...
OPENCODE_TELEGRAM_CHAT_ID=...

# Novas
GITHUB_TOKEN=...           # Aumenta rate limit GitHub de 10 → 30 req/min

# Opcionais (APIs sem auth também funcionam)
HACKERONE_USERNAME=...
HACKERONE_API_TOKEN=...
COINGECKO_API_KEY=...      # Pro tier — maior rate limit
```

---

## Ordem de Implementação

### Sprint 1 — Fundação de Schema
1. `db.ts` + `schema.ts`: 6 novas tabelas
2. `types.ts`: adicionar `memoryLlm` ao `ActivityContext`
3. `queue.ts`: passar `memoryLlm` via `QueueProcessorOpts`
4. `activities/seed-niches.ts`: inserir nichos e relações base
5. `activities/index.ts`: registrar seed-niches

### Sprint 2 — Coleta (sem LLM)
6. `activities/market-data-crypto.ts`
7. `activities/scan-github-bounties.ts`
8. `activities/scan-gitcoin-bounties.ts`
9. `activities/scan-freelance-jobs.ts`
10. `pipelines/opportunity_collector.ts` + `pipelines/market_data_collector.ts`

### Sprint 3 — Análise LLM
11. `activities/score-opportunity.ts`
12. `activities/classify-niche.ts`
13. `activities/analyze-niche-relations.ts`
14. `pipelines/opportunity_analyst.ts`

### Sprint 4 — Relatórios Telegram
15. `activities/generate-market-digest.ts`
16. `activities/send-telegram-report.ts`
17. `pipelines/daily_opportunity_report.ts`
18. `pipelines/weekly_opportunity_report.ts`

### Sprint 5 — Rotas + Board
19. Rotas `/opportunities`, `/niches`, `/market-data` em `routes.ts`
20. Colunas do board para `opp_opportunities` status
21. `activities/execute-opportunity.ts`

---

## Considerações Técnicas

- **Rate limits**: sleep entre requests; backoff exponencial no 429
- **Custo LLM**: truncar descrição a 2000 chars; `batch_size` configurável no analyst pipeline
- **Dedup**: `UNIQUE(source_platform, external_id)` + `content_hash` para Telegram
- **Idempotência**: todas as Activities são re-roríveis sem efeito colateral se já processado
