# Incidente 2026-03-19: 20 jobs falhados no dev cycle

## Resumo

Todos os 20 repo-issue-jobs falharam por 3 causas raiz distintas: modulo ausente no container Docker, runtime (npm) nao disponivel, e rate limiting do OpenRouter.

## Impacto

- 20 repo-issue-jobs com status `failed` (100% dos jobs ativos)
- Repos afetados: `TiagoAlmeidaS/atendimento_atacado`, `TiagoAlmeidaS/solana-wallet-connect-react`, `SolFoundry/solfoundry`, e mais 5 repos
- Nenhum PR foi aberto; ciclo de desenvolvimento completamente parado

## Erros encontrados

### Erro 1: `Cannot find module '@opencode-ai/util/error'` (16+ jobs)

- **Step:** `implement-code` (via `spawnOpenCode`)
- **Causa:** `packages/server/Dockerfile` nao copiava `packages/util` para o estagio runtime. O symlink do workspace em `node_modules/@opencode-ai/util` apontava para `../../packages/util` que nao existia.
- **Fix:** Adicionado `COPY --from=deps /app/packages/util ./packages/util` ao Dockerfile.

### Erro 2: `Executable not found in $PATH: "npm"` (1 job)

- **Step:** `implement-code` (pre-agent test run)
- **Causa:** `detectTestCommand()` retornava `"npm test"` para projetos Node.js, mas o container `oven/bun:1.2-alpine` nao tem npm. O `runCommand()` executava direto via `Bun.spawn` sem tratamento de erro, e a falha acontecia antes da CLI OpenCode ser chamada.
- **Fix:** Refatorado `implement-code` para delegar todo o ciclo de desenvolvimento (spec, testes, implementacao) para a CLI OpenCode, que tem `BashTool` e pode instalar runtimes autonomamente. Adicionado `try/catch` em `runCommand` para fallback graceful.

### Erro 3: OpenRouter API 429/502 (2 jobs)

- **Step:** `generate-spec` e `generate-tdd-tests`
- **Causa:** `.env.server` definia `MEMORY_LLM_PROVIDER` 3 vezes (azure, openai, openrouter); a ultima vencia, usando OpenRouter free tier com `google/gemini-2.0-flash` que sofre rate limiting severo. Nenhuma funcao LLM tinha retry logic.
- **Fix:** Corrigido `.env.server` para ter apenas um `MEMORY_LLM_PROVIDER=openai`. Adicionado retry com backoff exponencial (2s, 4s, 8s) para erros 429/502/503/529 em todos os providers.

## Refatoracao arquitetural

Alem dos fixes pontuais, o dev cycle foi refatorado:

### Antes

```
generate-spec (memoryLlm) → generate-tdd-tests (memoryLlm) → implement-code (pre-test + CLI)
```

Problemas: LLM sem contexto do repo, dependencia de runtime pre-instalado, rate limiting.

### Depois

```
implement-code (CLI OpenCode faz tudo: le codebase, gera spec, escreve testes, implementa, instala deps)
```

A CLI salva `.opencode/spec.json` no repo para rastreabilidade, que o server le e persiste no banco.

## Arquivos alterados

| Arquivo | Mudanca |
|---------|---------|
| `packages/server/Dockerfile` | `COPY packages/util` no runtime |
| `packages/server/src/repo-job-chain.ts` | Remove `generate-spec` e `generate-tdd-tests` da chain |
| `packages/server/src/activities/implement-code.ts` | Delega tudo para CLI; le spec apos execucao |
| `packages/server/src/activities/dev-cycle-shared.ts` | `try/catch` em `runCommand` |
| `packages/server/src/standalone.ts` | `withRetry` com backoff exponencial para todos os LLM providers |
| `.env.server` | Unico `MEMORY_LLM_PROVIDER=openai` |

## Acoes pendentes

1. Deploy manual na VPS (CI/CD de deploy com secrets faltando)
2. Atualizar `.env.server` na VPS
3. Re-enqueue dos 20 jobs falhados via API:

```bash
# Para cada job_id falhado, enfileirar implement-code:
curl -X POST http://<host>:3000/api/queue \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"activity_type":"implement-code","input":{"repo_issue_job_id":"<JOB_ID>"},"priority":5}'
```

## Referências

- [repo-issue-dev-cycle](../features/repo-issue-dev-cycle.md)
- [runbook-deploy-opencode-server-vps](../runbooks/runbook-deploy-opencode-server-vps.md)
- Commit: `fix(server): resolve 3 critical errors blocking all dev cycle jobs`
