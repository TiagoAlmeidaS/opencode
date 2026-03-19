# Dev Cycle Learning Loop

Loop de aprendizado que conecta execucoes do dev cycle (repo_issue_jobs) ao sistema de memoria e RAG, permitindo que o agente melhore com base em resultados reais.

## Visao geral

```
spawnOpenCode ──> opencode.db (session, message, part)
      │                          │
      │ session_id               │ memory_extract (existente)
      ▼                          ▼
repo_issue_jobs ◄── pr-outcome-check (GitHub API)
      │
      ▼
dev_cycle_learning (pipeline diario)
      │
      ├──> agent_learnings (category: dev-cycle, repo, pattern)
      └──> Qdrant (opencode_memory)

session_cleanup (pipeline diario)
      │
      └──> Deleta messages/parts >7 dias (mantem session metadata)
```

## Componentes

### A. Vinculacao de sessao (session tracking)

`spawnOpenCode` agora retorna `{ output, sessionId }`. Apos a CLI terminar, o server consulta `opencode.db` para encontrar a sessao mais recente pelo `directory` do workDir.

Campos adicionados em `repo_issue_jobs`:
- `session_id`: ID da sessao no `opencode.db`
- `cli_output`: stdout+stderr truncado (~10 KB) para debug rapido

### B. PR Outcome Check

Activity `pr-outcome-check` (sem cron dedicado -- disparada manualmente ou por schedule externo):
- Le jobs com `pr_url` preenchido e sem `pr_outcome`
- Consulta GitHub API: merged / rejected / closed
- Salva review comments para feeding no learning

Campos em `repo_issue_jobs`:
- `pr_outcome`: merged | rejected | closed
- `pr_outcome_at`: timestamp
- `pr_review_comments`: review comments concatenados

### C. Dev Cycle Learning Pipeline

Pipeline `dev_cycle_learning` (cron diario 03:30 UTC):
- Le `repo_issue_jobs` completed/failed sem `learning_extracted_at`
- Para cada job: monta contexto (issue, spec, CLI output, session transcript, PR reviews)
- LLM extrai 2-6 learnings por job
- Upsert em `agent_learnings` (rolling confidence average)
- Indexa no Qdrant via `addChunks`
- Marca job com `learning_extracted_at`

Categorias de learning:
- `dev-cycle`: padroes de execucao (retry, deps, test strategy)
- `repo`: convencoes de repo (framework, test runner, package manager)
- `pattern`: padroes gerais de sucesso/falha

Config:
- `since_days` (default 7): janela de lookback
- `max_jobs` (default 20): maximo de jobs por run

### D. Session Cleanup (Retention 7 dias)

Pipeline `session_cleanup` (cron diario 04:00 UTC, apos learning):
- Sessoes com `time_updated < NOW - 7d`
- So deleta se ja processada por `memory_extract` (verifica `memory_extractions`)
- Deleta `part` e `message`, marca sessao como archived
- Mantem row de `session` para referencia

Config:
- `retention_days` (default 7)

## Fluxo temporal

```
T+0    implement-code: spawnOpenCode → session_id salvo no job
T+0    CLI salva sessao completa em opencode.db
T+6h   pr-outcome-check: verifica PRs no GitHub, salva outcome
T+24h  memory_extract: extrai raw_memory da sessao (existente)
T+24h  dev_cycle_learning: extrai padroes do job → agent_learnings + Qdrant
T+7d   session_cleanup: deleta messages/parts da sessao (resumo ja salvo)
```

## Referencia de schema

Colunas adicionadas em `repo_issue_jobs`:

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| `session_id` | text | ID da sessao CLI no opencode.db |
| `cli_output` | text | stdout+stderr truncado (~10 KB) |
| `learning_extracted_at` | integer | Timestamp da extracao de learning |
| `pr_outcome` | text | merged / rejected / closed |
| `pr_outcome_at` | integer | Timestamp do outcome |
| `pr_review_comments` | text | Review comments concatenados |

## Referencia de arquivos

| Arquivo | Tipo | Descricao |
|---------|------|-----------|
| `spawn.ts` | Alterado | Retorna `{ output, sessionId }` |
| `implement-code.ts` | Alterado | Salva session_id e cli_output no job |
| `pr-outcome-check.ts` | Novo | Activity que consulta GitHub PRs |
| `dev_cycle_learning.ts` | Novo | Pipeline de learning |
| `session_cleanup.ts` | Novo | Pipeline de retention |
| `schema.ts` | Alterado | 6 colunas novas em repo_issue_jobs |
| `seed-pipelines.ts` | Alterado | Seed dos 2 novos pipelines |

## Referencias

- [Repo issue dev cycle](repo-issue-dev-cycle.md)
- [Memory pipeline](memory-pipeline.md)
- [Memory learning from pipelines](memory-learning-from-pipelines.md)
