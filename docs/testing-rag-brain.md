# Testing Guide — RAG Brain & Learning Loop

> **Branch:** `feature/multi-llm-routing`
> **Data:** Março 2026
> Cobre tudo que foi implementado nas sessões de RAG Brain (Fases 1–3 + gaps de integração).

---

## Índice

1. [Pré-requisitos](#1-pré-requisitos)
2. [Subindo o Server](#2-subindo-o-server)
3. [T1 — Migrations & Schema](#t1--migrations--schema)
4. [T2 — Endpoints de Learnings](#t2--endpoints-de-learnings)
5. [T3 — Dev Cycle Learning (trigger imediato)](#t3--dev-cycle-learning-trigger-imediato)
6. [T4 — implement-code com RAG Enrichment](#t4--implement-code-com-rag-enrichment)
7. [T5 — helpedCount: loop de feedback completo](#t5--helpedcount-loop-de-feedback-completo)
8. [T6 — memory_consolidation com agentLearnings](#t6--memory_consolidation-com-agentlearnings)
9. [T7 — strategy_analyzer com Telegram](#t7--strategy_analyzer-com-telegram)
10. [T8 — self_improvement com error_pattern + daemonProposals](#t8--self_improvement-com-error_pattern--daemonproposals)
11. [T9 — Runner Retry Logic](#t9--runner-retry-logic)
12. [T10 — CLI: injeção de contexto filtrada](#t10--cli-injeção-de-contexto-filtrada)
13. [Loop Completo End-to-End](#loop-completo-end-to-end)
14. [Checklist Rápido](#checklist-rápido)

---

## 1. Pré-requisitos

### Variáveis de ambiente obrigatórias

Copie `.env.server.example` para `.env.server` e preencha ao menos:

```env
# LLM (mínimo: uma das três opções)
ANTHROPIC_API_KEY=sk-ant-...
# ou
OPENROUTER_API_KEY=sk-or-v1-...
# ou
OPENAI_API_KEY=sk-...

# GitHub (necessário para jobs de implementação e pr-outcome-check)
GITHUB_TOKEN=ghp_...

# Telegram (necessário para T7 — strategy_analyzer notifications)
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...

# Qdrant (necessário para indexação RAG — pode ser omitido se não tiver)
QDRANT_URL=http://localhost:6333

# Autenticação da API (opcional em dev)
API_TOKEN=dev-token-local
```

### Dependências

```bash
# Na raiz do monorepo
bun install

# Confirmar que os testes passam antes de testar manualmente
cd packages/server
bun test
# Expected: 41 pass, 0 fail
```

---

## 2. Subindo o Server

```bash
cd packages/server

# Desenvolvimento local
DB_PATH=./test.db \
ANTHROPIC_API_KEY=sk-ant-... \
GITHUB_TOKEN=ghp_... \
TELEGRAM_BOT_TOKEN=... \
TELEGRAM_CHAT_ID=... \
bun run src/standalone.ts
```

Saída esperada no boot:
```
🚀 OpenCode Server running at http://0.0.0.0:3000
   Dashboard:  http://0.0.0.0:3000/
   API:        http://0.0.0.0:3000/api/
   DB:         ./test.db
   LLM:        Anthropic claude-haiku-4-5-20251001
   Auth:       disabled
   Qdrant:     disabled
```

**Variável de conveniência para os curls abaixo:**
```bash
BASE="http://localhost:3000/api"
# Se API_TOKEN estiver configurado:
AUTH="-H 'Authorization: Bearer dev-token-local'"
```

---

## T1 — Migrations & Schema

**Objetivo:** Confirmar que as colunas novas existem no banco após o boot.

```bash
# Inspecionar o schema do SQLite diretamente
sqlite3 ./test.db ".schema repo_issue_jobs" | grep -E "used_learning|retry_count"
# Esperado:
#   retry_count INTEGER NOT NULL DEFAULT 0
#   used_learning_ids TEXT

sqlite3 ./test.db ".schema agent_learnings" | grep -E "used_count|helped_count"
# Esperado:
#   used_count INTEGER NOT NULL DEFAULT 0
#   helped_count INTEGER NOT NULL DEFAULT 0
```

**✅ Critério de sucesso:** As 3 colunas existem. Se a coluna `used_learning_ids` não aparecer, o server não reiniciou com a migration nova — reiniciar e verificar o log de boot (não deve haver erro de `duplicate column`).

---

## T2 — Endpoints de Learnings

### T2.1 — POST /learnings: cria com usedCount=0 e helpedCount=0

```bash
curl -s -X POST $BASE/learnings \
  -H "Content-Type: application/json" \
  -d '{
    "key": "test-learning-001",
    "category": "error_pattern",
    "title": "Teste de learning via API",
    "body": "Quando X acontece, faça Y.",
    "confidence": 0.8,
    "tags": ["TiagoAlmeidaS/opencode", "typescript"]
  }' | jq '{id, key, usedCount, helpedCount, positiveCount, negativeCount}'
```

**✅ Esperado:**
```json
{
  "id": "01...",
  "key": "test-learning-001",
  "usedCount": 0,
  "helpedCount": 0,
  "positiveCount": 0,
  "negativeCount": 0
}
```

> ⚠️ **Falha anterior:** `usedCount` e `helpedCount` retornavam `null`. Agora devem ser `0`.

---

### T2.2 — GET /learnings: sem filtro

```bash
curl -s "$BASE/learnings?limit=5" | jq '.[0] | {id, key, category, usedCount, helpedCount}'
```

**✅ Esperado:** Objeto com `usedCount` e `helpedCount` como números (não null).

---

### T2.3 — GET /learnings: filtro por category

```bash
curl -s "$BASE/learnings?category=error_pattern&limit=10" | jq 'length'
# Deve retornar apenas learnings com category=error_pattern
```

---

### T2.4 — GET /learnings: filtro por tag (NOVO)

```bash
# Usar o learning criado no T2.1 que tem tag "TiagoAlmeidaS/opencode"
curl -s "$BASE/learnings?tag=TiagoAlmeidaS%2Fopencode" | jq '.[].key'
# Esperado: "test-learning-001" aparece nos resultados
```

**✅ Critério:** Retorna apenas learnings cujo array `tags` contém o valor exato.

```bash
# Filtro combinado: category + tag
curl -s "$BASE/learnings?category=error_pattern&tag=typescript" | jq 'length'
```

---

### T2.5 — POST /learnings/:id/used (NOVO)

```bash
# Obter o ID do learning criado
ID=$(curl -s "$BASE/learnings?category=error_pattern&limit=1" | jq -r '.[0].id')

# Incrementar used_count
curl -s -X POST "$BASE/learnings/$ID/used" | jq
# Esperado: {"ok": true}

# Verificar que usedCount foi para 1
curl -s "$BASE/learnings?limit=1" | jq '.[0] | {usedCount}'
# Esperado: {"usedCount": 1}

# Chamar mais 2 vezes
curl -s -X POST "$BASE/learnings/$ID/used"
curl -s -X POST "$BASE/learnings/$ID/used"

# Verificar usedCount = 3
curl -s "$BASE/learnings/$ID" 2>/dev/null || \
  curl -s "$BASE/learnings?limit=100" | jq --arg id "$ID" '.[] | select(.id==$id) | {usedCount}'
# Esperado: {"usedCount": 3}
```

**✅ Critério:** Cada chamada a `POST /learnings/:id/used` incrementa `usedCount` em 1 atomicamente.

---

## T3 — Dev Cycle Learning (trigger imediato)

**Objetivo:** Verificar que a activity `dev-cycle-learning` extrai learnings de um job específico.

### Pré-condição: criar um job de teste no banco

```bash
# Inserir um job fake com status=failed para testar a extração
sqlite3 ./test.db "
INSERT INTO repo_issue_jobs (
  id, repo_full_name, issue_title, issue_body, status,
  cli_output, created_at, updated_at
) VALUES (
  'test-job-001',
  'TiagoAlmeidaS/opencode',
  'Fix: TypeError when parsing null response',
  'When the API returns null, the parser throws TypeError at line 42',
  'failed',
  'Error: TypeError: Cannot read property \"data\" of null\n  at parseResponse (src/parser.ts:42)\n  at fetchData (src/api.ts:18)',
  strftime(\"%s\",\"now\"),
  strftime(\"%s\",\"now\")
);
"
```

### Enfileirar a activity via API

```bash
# Endpoint para enfileirar uma activity manualmente
curl -s -X POST $BASE/queue \
  -H "Content-Type: application/json" \
  -d '{
    "activityType": "dev-cycle-learning",
    "input": {"repo_issue_job_id": "test-job-001"},
    "priority": 1
  }' | jq '{id, status}'
```

> Se não houver endpoint `/api/queue` direto, aguardar o próximo tick do queue processor (a cada 10s) ou usar o endpoint `/api/queue/trigger` se existir.

### Verificar resultado

```bash
# Aguardar ~15s e verificar se learnings foram extraídos
sqlite3 ./test.db "
SELECT key, category, title, confidence, used_count, helped_count
FROM agent_learnings
ORDER BY created_at DESC
LIMIT 5;
"

# Verificar que learning_extracted_at foi setado no job
sqlite3 ./test.db "
SELECT id, status, learning_extracted_at
FROM repo_issue_jobs
WHERE id = 'test-job-001';
"
```

**✅ Critérios:**
- `agent_learnings` tem pelo menos 1 nova row com `category IN ('dev-cycle', 'error_pattern', 'repo', 'pattern')`
- `repo_issue_jobs.learning_extracted_at` não é NULL para `test-job-001`
- `used_count = 0` e `helped_count = 0` nas novas rows

**✅ Teste de idempotência:**
```bash
# Enfileirar novamente — deve ser ignorado (learning_extracted_at já setado)
curl -s -X POST $BASE/queue \
  -H "Content-Type: application/json" \
  -d '{"activityType": "dev-cycle-learning", "input": {"repo_issue_job_id": "test-job-001"}, "priority": 1}'

# Aguardar 15s — número de learnings não deve aumentar
sqlite3 ./test.db "SELECT count(*) FROM agent_learnings"
```

---

## T4 — implement-code com RAG Enrichment

**Objetivo:** Confirmar que `implement-code` persiste `used_learning_ids` no job após a execução.

### Pré-condição: ter learnings no banco

Execute T2.1 + T3 antes. Devem existir learnings em `agent_learnings`.

### Disparar um job de implementação

Via Dashboard (`http://localhost:3000`) ou API:

```bash
# Criar um repo_issue_job que rode implement-code
# (use um repo pequeno e uma issue simples)
curl -s -X POST $BASE/repo-jobs \
  -H "Content-Type: application/json" \
  -d '{
    "repoFullName": "TiagoAlmeidaS/opencode",
    "issueTitle": "Add hello world endpoint",
    "issueBody": "Add a GET /hello endpoint that returns {\"message\": \"hello world\"}",
    "useFork": 0,
    "requirePassingTests": 0
  }' | jq '{id, status}'
```

### Verificar após implementação

```bash
JOB_ID="<id retornado acima>"

# Aguardar o job mudar de status (pode levar minutos)
watch -n 5 "sqlite3 ./test.db \"SELECT status, used_learning_ids FROM repo_issue_jobs WHERE id='$JOB_ID'\""

# Quando status = 'implementing', verificar:
sqlite3 ./test.db "
SELECT
  id,
  status,
  used_learning_ids,
  length(cli_output) as cli_len
FROM repo_issue_jobs
WHERE id = '$JOB_ID';
"
```

**✅ Critérios:**
- `used_learning_ids` é um JSON array de strings (IDs), ex: `["01ABC...", "01DEF..."]`
- Se nenhum learning era relevante, pode ser `null` (aceitável)
- Os IDs no array existem em `agent_learnings`

```bash
# Verificar que os IDs são válidos
sqlite3 ./test.db "
SELECT al.id, al.title, al.used_count
FROM agent_learnings al
WHERE al.id IN (
  SELECT json_each.value
  FROM repo_issue_jobs rij, json_each(rij.used_learning_ids)
  WHERE rij.id = '$JOB_ID'
);
"
# Esperado: used_count dos learnings listados deve ter aumentado (incrementado em implement-code)
```

---

## T5 — helpedCount: loop de feedback completo

**Objetivo:** Fechar o loop — quando um PR é mergeado, `helpedCount` dos learnings usados no job deve incrementar.

### Setup: simular um job com PR mergeado

```bash
# Pegar o JOB_ID do T4 (ou criar um job de teste)
# Definir used_learning_ids e pr_outcome manualmente para simular

LEARNING_ID=$(sqlite3 ./test.db "SELECT id FROM agent_learnings LIMIT 1;")

sqlite3 ./test.db "
UPDATE repo_issue_jobs
SET
  used_learning_ids = json_array('$LEARNING_ID'),
  pr_url = 'https://github.com/TiagoAlmeidaS/opencode/pull/99',
  pr_number = 99,
  status = 'completed'
WHERE id = 'test-job-001';
"

# Anotar helped_count atual
sqlite3 ./test.db "
SELECT id, helped_count, used_count FROM agent_learnings WHERE id = '$LEARNING_ID';
"
```

### Simular PR mergeado (mock no banco)

```bash
# O pr-outcome-check busca jobs com status completed/pr-open, pr_url não null, e pr_outcome null
# Para testar sem GitHub real, inserir pr_outcome diretamente e depois acionar o update de helpedCount manualmente
# OU: usar um PR real que foi mergeado

# Opção A: simular diretamente (para teste isolado)
sqlite3 ./test.db "
UPDATE repo_issue_jobs
SET pr_outcome = 'merged', pr_outcome_at = strftime('%s','now')
WHERE id = 'test-job-001';
"
```

### Disparar pr-outcome-check

```bash
# Trigger manual via pipeline run (se o pipeline estiver configurado)
# Ou aguardar o cron (schedule padrão é a cada hora)

# Para trigger imediato via API:
PIPELINE_ID=$(sqlite3 ./test.db "SELECT id FROM daemon_pipelines WHERE strategy='pr_outcome_check' LIMIT 1;")
curl -s -X POST "$BASE/pipelines/$PIPELINE_ID/run" | jq

# Aguardar ~10s
sleep 10

# Verificar helpedCount
sqlite3 ./test.db "
SELECT id, title, used_count, helped_count
FROM agent_learnings
WHERE id = '$LEARNING_ID';
"
```

**✅ Critério:** `helped_count` aumentou em 1 (de 0 para 1, ou de N para N+1).

> **Nota:** Para testar com GitHub real, abra um PR no repo de teste via `implement-code` e faça merge. Na próxima execução do `pr-outcome-check`, o `helpedCount` dos learnings no `used_learning_ids` do job será incrementado.

---

## T6 — memory_consolidation com agentLearnings

**Objetivo:** Verificar que learnings de `agent_learnings` são incluídos no MEMORY.md consolidado.

### Pré-condição: ter extrações de memória OU learnings no banco

```bash
# Verificar se existem memoryExtractions
sqlite3 ./test.db "SELECT count(*) FROM memory_extractions;"

# Se zero, os learnings do agent_learnings ainda vão aparecer no prompt
# (a pipeline agora busca os dois)
```

### Configurar e rodar memory_consolidation

```bash
# Criar diretório de output
mkdir -p /tmp/opencode-memory-test

# Atualizar config do pipeline no banco
PIPELINE_ID=$(sqlite3 ./test.db "
  SELECT id FROM daemon_pipelines WHERE strategy='memory_consolidation' LIMIT 1;
")

# Se não existir, inserir:
if [ -z "$PIPELINE_ID" ]; then
  sqlite3 ./test.db "
    INSERT INTO daemon_pipelines (id, name, strategy, config_json, schedule_cron, enabled, max_retries, retry_delay_sec, max_runs_per_day, created_at, updated_at)
    VALUES (
      'mem-consol-test',
      'Memory Consolidation Test',
      'memory_consolidation',
      '{\"memory_output_dir\": \"/tmp/opencode-memory-test\"}',
      '0 3 * * 0',
      1, 1, 5, 0,
      strftime(\"%s\",\"now\"),
      strftime(\"%s\",\"now\")
    );
  "
  PIPELINE_ID="mem-consol-test"
fi

# Trigger manual
curl -s -X POST "$BASE/pipelines/$PIPELINE_ID/run" | jq
```

### Verificar output

```bash
# Aguardar ~30s (depende do LLM)
sleep 30

# Verificar se MEMORY.md foi gerado
ls -la /tmp/opencode-memory-test/
cat /tmp/opencode-memory-test/MEMORY.md | head -60
```

**✅ Critérios:**
- `MEMORY.md` foi criado e tem mais de 100 bytes
- `memory_summary.md` também foi criado
- Se havia learnings com `category=error_pattern`, eles devem aparecer como seção no MEMORY.md

```bash
# Verificar que learnings foram incluídos
grep -i "error_pattern\|agent learning\|dev-cycle" /tmp/opencode-memory-test/MEMORY.md
```

---

## T7 — strategy_analyzer com Telegram

**Objetivo:** Verificar que o analyzer gera propostas E envia notificação no Telegram.

### Pré-condição: TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID configurados

```bash
# Verificar que as vars estão no ambiente
echo "BOT: ${TELEGRAM_BOT_TOKEN:0:10}..."
echo "CHAT: $TELEGRAM_CHAT_ID"
```

### Inserir dados de métricas simulados (para o analyzer ter algo para analisar)

```bash
# Inserir alguns jobs completados e falhados para que o analyzer tenha métricas
sqlite3 ./test.db "
INSERT OR IGNORE INTO repo_issue_jobs (id, repo_full_name, issue_title, status, created_at, updated_at)
VALUES
  ('sim-job-1', 'owner/repo-a', 'Issue A', 'completed', strftime('%s','now')-86400, strftime('%s','now')-86400),
  ('sim-job-2', 'owner/repo-a', 'Issue B', 'failed',    strftime('%s','now')-3600,  strftime('%s','now')-3600),
  ('sim-job-3', 'owner/repo-b', 'Issue C', 'completed', strftime('%s','now')-7200,  strftime('%s','now')-7200);
"
```

### Rodar strategy_analyzer

```bash
PIPELINE_ID=$(sqlite3 ./test.db "
  SELECT id FROM daemon_pipelines WHERE strategy='strategy_analyzer' LIMIT 1;
")

curl -s -X POST "$BASE/pipelines/$PIPELINE_ID/run" | jq '{jobId, ok}'
```

### Verificar propostas geradas

```bash
# Aguardar ~30s
sleep 30

# Ver propostas no banco
sqlite3 ./test.db "
SELECT action_type, title, risk_level, confidence, status, auto_approvable
FROM daemon_proposals
ORDER BY created_at DESC
LIMIT 5;
"
```

**✅ Critérios:**
- Pelo menos 1 row em `daemon_proposals`
- Propostas com `confidence >= 0.85` e `risk_level = 'low'` têm `status = 'approved'` e `auto_approvable = 1`
- Propostas medium/high têm `status = 'pending'`
- **Telegram:** Uma mensagem aparece no chat configurado com o resumo das propostas

**Formato esperado da mensagem Telegram:**
```
Strategy Analyzer — 2026-03-21

✅ 1 proposal(s) auto-approved and applied
🔍 2 proposal(s) pending human review

✅ [change_model/low] Usar modelo mais barato para análise (conf=90%)
🔍 [update_prompt/medium] Melhorar prompt para bounties TypeScript (conf=70%)
```

---

## T8 — self_improvement com error_pattern + daemonProposals

**Objetivo:** Confirmar que o pipeline usa error_patterns, métricas de efetividade, e propostas pendentes.

### Pré-condição: ter dados dos testes anteriores (T3, T7)

```bash
# Verificar que existem error_patterns
sqlite3 ./test.db "
  SELECT count(*) FROM agent_learnings WHERE category='error_pattern';
"

# Verificar que existem daemon_proposals pendentes (de T7)
sqlite3 ./test.db "
  SELECT count(*) FROM daemon_proposals WHERE status='pending';
"
```

### Configurar target_repo no pipeline

```bash
PIPELINE_ID=$(sqlite3 ./test.db "
  SELECT id FROM daemon_pipelines WHERE strategy='self_improvement' LIMIT 1;
")

# Verificar config atual
sqlite3 ./test.db "
  SELECT config_json FROM daemon_pipelines WHERE id='$PIPELINE_ID';
"
# Deve conter: {"target_repo": "TiagoAlmeidaS/opencode", ...}
```

### Rodar self_improvement (DRY RUN — sem criar issues reais)

Para testar sem criar GitHub issues, pode temporariamente usar um repo inexistente:

```bash
# Atualizar para um repo de teste que não vai criar issues reais
sqlite3 ./test.db "
  UPDATE daemon_pipelines
  SET config_json = '{\"target_repo\": \"TiagoAlmeidaS/opencode-test-nonexistent\", \"max_proposals\": 2}'
  WHERE id = '$PIPELINE_ID';
"

curl -s -X POST "$BASE/pipelines/$PIPELINE_ID/run" | jq
```

### Verificar logs do job

```bash
sleep 30

JOB_ID=$(sqlite3 ./test.db "
  SELECT id FROM daemon_jobs
  WHERE pipeline_id = '$PIPELINE_ID'
  ORDER BY created_at DESC LIMIT 1;
")

sqlite3 ./test.db "
SELECT status, output_json, error_message
FROM daemon_jobs
WHERE id = '$JOB_ID';
" | head -20
```

**✅ Critério:** O `output_json` deve mencionar `error_patterns`, `ineffective_learnings`, ou `pending_proposals` como parte do contexto analisado (verificável no log do server).

---

## T9 — Runner Retry Logic

**Objetivo:** Verificar que uma pipeline que falha na 1ª tentativa é retentada automaticamente.

### Criar uma pipeline que falha nas primeiras tentativas

```bash
# Registrar uma "strategy" que não existe — vai falhar com "Unknown strategy"
# (isso testa o path de retry com a mensagem de erro)

# Na verdade, o retry é relevante para falhas transitórias de REDE ou API.
# Para simular: usar uma strategy válida mas com LLM que retorna erro

# Verificar o log do server quando uma pipeline falha:
# Deve aparecer: [warn] Attempt 1/3 failed — retrying in Xs: ...
# E depois: [error] (na última tentativa)
```

### Teste manual via log inspection

```bash
# Temporariamente configurar uma pipeline com ANTHROPIC_API_KEY inválida
# e observar o comportamento de retry no log do server

# Alternativa: verificar que o campo `attempt` no daemon_jobs incrementa
sqlite3 ./test.db "
SELECT id, pipeline_id, attempt, status, error_message
FROM daemon_jobs
ORDER BY created_at DESC
LIMIT 10;
"
```

**✅ Critério:** No log do server, falhas transitórias geram linha de `[warn]` com "retrying" antes da falha final. O job `daemon_jobs.attempt` reflete a tentativa correta.

---

## T10 — CLI: injeção de contexto filtrada

**Objetivo:** Verificar que o CLI injeta learnings filtrados por categoria no contexto LLM.

### Pré-condição: server rodando com learnings no banco (T2, T3)

```bash
# Configurar o CLI para apontar para o server local
export OPENCODE_SERVER_URL=http://localhost:3000
# ou no opencode config:
# server.memory.url = "http://localhost:3000/api"
```

### Teste direto via Node/Bun

```bash
cd packages/opencode

# Criar um script de teste rápido
cat > /tmp/test-context.ts << 'EOF'
import { ServerMemory } from "./src/server-memory/client.ts"

// Simular chamada com texto de usuário
const ctx = await ServerMemory.contextForUserMessage(
  "fix TypeError when parsing null response",
  { repoTag: "TiagoAlmeidaS/opencode" }
)

console.log("=== Context sections:", ctx.length)
for (const section of ctx) {
  console.log("\n--- Section ---")
  console.log(section.slice(0, 500))
}
EOF

bun run /tmp/test-context.ts
```

**✅ Critérios:**
- Retorna array com 1-2 elementos (RAG chunks + learnings)
- A seção `<agent-learnings>` aparece se houver learnings com categorias `error_pattern`, `dev-cycle`, `repo`, ou `pattern`
- Learnings de outras categorias (`skill`, `niche`, `platform`) NÃO aparecem (filtrado)

### Verificar que used_count foi incrementado

```bash
# Após a chamada acima, verificar se used_count aumentou nos learnings retornados
sqlite3 ../server/test.db "
SELECT key, category, used_count
FROM agent_learnings
WHERE category IN ('error_pattern', 'dev-cycle', 'repo', 'pattern')
AND used_count > 0
ORDER BY used_count DESC
LIMIT 5;
"
```

**✅ Critério:** Os learnings que foram injetados têm `used_count` incrementado (fire-and-forget `POST /learnings/:id/used`).

---

## Loop Completo End-to-End

Este teste valida o ciclo completo: **código implementado → learning extraído → injetado → PR mergeado → helpedCount creditado**.

```
1. implement-code (job) ──→ used_learning_ids preenchido
         ↓
2. notify-pr-approval ──→ dev-cycle-learning enfileirado
         ↓
3. dev-cycle-learning ──→ agentLearnings populado
         ↓
4. próximo implement-code ──→ RAG busca learnings, injeta no task, incrementa used_count
         ↓
5. PR aberto
         ↓
6. PR mergeado (GitHub)
         ↓
7. pr-outcome-check ──→ helpedCount++ nos learnings de used_learning_ids
         ↓
8. strategy_analyzer ──→ calcula efetividade real (helped/used), gera propostas, notifica Telegram
         ↓
9. memory_consolidation ──→ learnings de alta confiança entram no MEMORY.md
```

### Executar o loop completo

```bash
# 1. Garantir learnings existem (T3 + T2.1)
# 2. Disparar implement-code em um repo real pequeno
# 3. Aguardar PR ser criado (acompanhar via Dashboard)
# 4. Fazer merge manual do PR no GitHub
# 5. Aguardar pr-outcome-check rodar (schedule horário, ou trigger manual)

# Verificar estado final do loop:
sqlite3 ./test.db "
SELECT
  rij.id as job_id,
  rij.issue_title,
  rij.status,
  rij.pr_outcome,
  rij.used_learning_ids,
  rij.learning_extracted_at
FROM repo_issue_jobs rij
ORDER BY rij.created_at DESC
LIMIT 5;
"

# Verificar learnings creditados
sqlite3 ./test.db "
SELECT
  key,
  title,
  used_count,
  helped_count,
  CASE WHEN used_count > 0
    THEN ROUND(CAST(helped_count AS REAL) / used_count * 100, 1) || '%'
    ELSE 'N/A'
  END as effectiveness
FROM agent_learnings
WHERE used_count > 0
ORDER BY used_count DESC;
"
```

**✅ Critério final:** Pelo menos um learning tem `helped_count > 0` após um PR mergeado que usou esse learning.

---

## Checklist Rápido

| # | Teste | Critério | Status |
|---|-------|----------|--------|
| T1 | Schema migrations | Colunas `used_learning_ids`, `used_count`, `helped_count` existem | ⬜ |
| T2.1 | POST /learnings | Retorna `usedCount=0, helpedCount=0` | ⬜ |
| T2.4 | GET /learnings?tag= | Filtra por tag do JSON array | ⬜ |
| T2.5 | POST /learnings/:id/used | Incrementa `usedCount` | ⬜ |
| T3 | dev-cycle-learning trigger | Extrai learnings e seta `learning_extracted_at` | ⬜ |
| T3 idempotência | dev-cycle-learning 2x | Não duplica learnings | ⬜ |
| T4 | implement-code RAG | `used_learning_ids` preenchido no job | ⬜ |
| T5 | pr-outcome-check | `helpedCount++` após merge | ⬜ |
| T6 | memory_consolidation | MEMORY.md inclui agent_learnings | ⬜ |
| T7 | strategy_analyzer | Propostas criadas + Telegram recebido | ⬜ |
| T8 | self_improvement | Usa error_patterns + daemonProposals no prompt | ⬜ |
| T9 | Runner retry | Log mostra "retrying" antes de falha final | ⬜ |
| T10 | CLI context | `<agent-learnings>` filtrado por categoria + `used_count` incrementado | ⬜ |
| E2E | Loop completo | `helped_count > 0` após PR mergeado | ⬜ |

---

## Troubleshooting

### "usedCount is null" no GET /learnings

Learnings criados antes da migration têm NULL nos campos novos. Corrigir:
```bash
sqlite3 ./test.db "
UPDATE agent_learnings
SET used_count = 0, helped_count = 0
WHERE used_count IS NULL OR helped_count IS NULL;
"
```

### dev-cycle-learning não extrai nada

1. Verificar que `ANTHROPIC_API_KEY` (ou `OPENROUTER_API_KEY`) está configurada — sem LLM, usa fallback heurístico que só cria um learning genérico para jobs `failed`
2. Verificar logs do server: `[dev-cycle-learning-trigger]` deve aparecer no output

### GET /learnings?tag= retorna vazio

O filtro usa SQL LIKE sobre a coluna `tags` (JSON string). Verificar:
```bash
# Ver valor raw da coluna tags
sqlite3 ./test.db "SELECT key, tags FROM agent_learnings LIMIT 5;"
# Esperado: ["TiagoAlmeidaS/opencode", "typescript"]

# O filtro procura por: tags LIKE '%"TiagoAlmeidaS/opencode"%'
# Nota: barras no nome do repo são escapadas normalmente no JSON
```

### Telegram não recebe mensagem

1. Verificar `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` no ambiente do processo
2. Testar manualmente:
```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${TELEGRAM_CHAT_ID}&text=Teste"
```
3. O strategy_analyzer só envia se `stored > 0` (pelo menos 1 proposal foi gerada)

### Runner não retenta

O retry só acontece se `maxRetries > 1` no pipeline. Verificar:
```bash
sqlite3 ./test.db "
  SELECT name, strategy, max_retries, retry_delay_sec
  FROM daemon_pipelines
  WHERE strategy='strategy_analyzer';
"
# Default após seed: max_retries=3, retry_delay_sec=300
# Em dev: o delay é capped em 30s
```
