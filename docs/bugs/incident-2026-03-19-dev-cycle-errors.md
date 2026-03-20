# Incidente 2026-03-19: 20 jobs falhados no dev cycle

## Resumo

Todos os 20 repo-issue-jobs falharam por 3 causas raiz distintas: modulo ausente no container Docker, runtime (npm) nao disponivel, e rate limiting do OpenRouter.

## Impacto

- 20 repo-issue-jobs com status `failed` (100% dos jobs ativos)
- Repos afetados: `TiagoAlmeidaS/atendimento_atacado`, `TiagoAlmeidaS/solana-wallet-connect-react`, `SolFoundry/solfoundry`, e mais 5 repos
- Nenhum PR foi aberto; ciclo de desenvolvimento completamente parado

## Erros encontrados

### Erro 1a: `Cannot find module '@opencode-ai/util/error'` (16+ jobs)

- **Step:** `implement-code` (via `spawnOpenCode`)
- **Causa:** `packages/server/Dockerfile` nao copiava `packages/util` para o estagio runtime. O symlink do workspace em `node_modules/@opencode-ai/util` apontava para `../../packages/util` que nao existia.
- **Fix:** Copiar `packages/util` no runtime.

### Erro 1b: `Cannot find module '@opencode-ai/sdk/v2'` (apos fix 1a)

- **Step:** `implement-code` (via `spawnOpenCode`)
- **Causa:** A CLI (`bun packages/opencode/src/index.ts`) importa estaticamente todos os comandos no boot, incluindo `acp.ts` → `@opencode-ai/sdk/v2`. O pacote SDK fica em `packages/sdk/js` e nao estava no container. O mesmo vale para `@opencode-ai/plugin` (ex.: `tool/registry.ts`) e o pacote `server` completo (ex.: `ServeCommand` → `server/server.ts` → `@opencode-ai/server`).
- **Fix:** No Dockerfile, copiar do stage `deps` para o runtime: `packages/sdk/js`, `packages/plugin`, e `packages/server` inteiro (alem de `opencode` e `util`).

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
| `packages/server/Dockerfile` | Copia `util`, `sdk/js`, `plugin`, `server` e `opencode` do stage deps (symlinks workspace) |
| `packages/server/src/repo-job-chain.ts` | Remove `generate-spec` e `generate-tdd-tests` da chain |
| `packages/server/src/activities/implement-code.ts` | Delega tudo para CLI; le spec apos execucao |
| `packages/server/src/activities/dev-cycle-shared.ts` | `try/catch` em `runCommand` |
| `packages/server/src/standalone.ts` | `withRetry` com backoff exponencial para todos os LLM providers |
| `.env.server` | Unico `MEMORY_LLM_PROVIDER=openai` |

## Follow-up 2026-03-20: eliminacao da verificacao hardcoded

Analise dos erros pos-fix mostrou que os 3 jobs do repo `atendimento_atacado` continuaram falhando por:

- `Testes ainda falhando apos 3 tentativas: Runtime not available: Error: Executable not found in $PATH: "npm"` — o `detectTestCommand()` retornava `"npm test"` e `runCommand()` falhava ao executar npm diretamente no shell, **apos** a CLI com LLM ter rodado.

### Causa raiz real

O `implement-code.ts` tinha um fluxo em duas fases:
1. `spawnOpenCode(task)` — CLI com LLM roda (funciona, sabe adaptar-se)
2. `detectTestCommand()` + `runCommand("npm test")` — verificacao **hardcoded** de testes, sem LLM, dependente de runtimes pre-instalados

O passo 2 era fragil: se amanha o projeto for C#, Rust ou Go, precisaria de `dotnet`, `cargo`, `go` no container.

### Fix definitivo

- **`implement-code.ts`**: removido `detectTestCommand` + `runCommand`. O loop agora delega TUDO para a CLI com LLM: install deps, run tests, diagnose errors. Se a CLI falha (exit code != 0), retenta com o output de erro no prompt. Nunca mais depende de runtimes hardcoded.
- **`submit-github-pr.ts`** e **`dev-cycle-shared.ts`**: `detectTestCommand` agora usa `Bun.which("npm")` para fallback para `bun` quando `npm` nao esta disponivel.
- **Dockerfile**: adicionado `nodejs npm` ao `apk add` para projetos que legitimamente precisam de npm.
- **Task prompt**: melhorado para instruir a CLI a detectar linguagem, package manager, instalar deps, adaptar ao runtime disponivel, e auto-diagnosticar falhas.

## Follow-up 2026-03-20 (2): prompt enriquecido e skills

Apos o fix definitivo da verificacao hardcoded, o prompt do `buildTask` foi reestruturado para incluir todo o contexto disponivel do job e instruir a CLI com um fluxo em 4 fases:

### Contexto enriquecido no prompt

Campos adicionados: `issueNumber` (para `Closes #N`), `baseBranch`, `requirePassingTests` (para decidir se abre draft PR), `specJson` (de tentativas anteriores), e `cli_output` expandido para 3000 chars.

### Prompt em 4 fases

1. **DISCOVERY** — mapear estrutura, detectar stack, ler convenções, identificar padrões de teste
2. **PLAN** — gerar spec, extrair critérios de aceite, planejar tarefas + testes
3. **BUILD** — instalar deps, escrever testes, implementar, rodar suite
4. **FINALIZE** — mudanças mínimas, auto-diagnóstico de falhas

### Skills injetadas

Criadas duas skills em `.opencode/skills/`:
- **pm-discover** — fluxo estruturado de discovery/indexação do projeto (similar a `claude init`)
- **pm-implement** — implementação estruturada com critérios de aceite, testes unitários/integração

O `implement-code` agora copia estas skills para o repo target após clone, permitindo que a CLI as encontre via `SkillTool`.

### Dockerfile atualizado

Adicionado `COPY --from=deps /app/.opencode/skills ./.opencode/skills` para disponibilizar as skills no container.

## Acoes pendentes

1. Deploy manual na VPS (CI/CD de deploy com secrets faltando)
2. Atualizar `.env.server` na VPS
3. Re-enqueue dos jobs falhados via API:

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
