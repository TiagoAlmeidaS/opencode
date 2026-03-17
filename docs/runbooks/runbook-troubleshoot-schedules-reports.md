# Runbook: Troubleshooting Schedules e Relatórios do OpenCode Server

Procedimento para diagnosticar e corrigir problemas com pipelines agendados (schedules) e relatórios (Telegram) no OpenCode Server.

## Visão geral do fluxo

1. **Scheduler** — executa a cada 60 segundos; para cada pipeline habilitado com cron compatível, dispara `runJob()`.
2. **Pipeline** — ex.: `daily-opportunity-report` insere um item na fila (`daemon_queue`) com `activityType: "daily-report"`.
3. **Queue** — processa itens pendentes a cada 10 segundos; executa a activity `daily-report`.
4. **daily-report** — gera o digest e envia via Telegram (requer `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`).

## Pré-requisitos

- OpenCode Server rodando (standalone em Docker ou `opencode serve --daemon`).
- `.env.server` configurado (copiar de `.env.server.example`).
- Para relatórios: `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` definidos.

## Pipelines padrão (seed automático)

Na primeira inicialização, o servidor cria automaticamente dois pipelines se não existirem:

| Strategy | Nome | Cron |
|----------|------|------|
| `daily-opportunity-report` | Relatório Diário | `0 8 * * *` (8h diariamente) |
| `weekly-opportunity-report` | Relatório Semanal | `0 9 * * 1` (segunda às 9h) |

Para desativar o seed: `SEED_DEFAULT_PIPELINES=false`.

## Checklist de diagnóstico

### 1. Schedules não disparam

| Causa | Como verificar | Solução |
|-------|----------------|---------|
| **Nenhum pipeline cadastrado** | `GET /api/pipelines` ou Dashboard → status bar "Pipelines: 0/0" | Criar pipeline via Dashboard ou `POST /api/pipelines` |
| **Pipeline desabilitado** | `enabled = 0` na tabela `daemon_pipelines` | `POST /api/pipelines/:id/enable` |
| **Cron não bate no minuto atual** | Scheduler verifica a cada 60s; cron deve coincidir com minuto/hora/dia | Ajustar `schedule_cron` (ex.: `0 8 * * *` = 8h diariamente) |
| **Job já em execução ou pendente** | Scheduler não dispara se houver job running/pending | Aguardar conclusão ou cancelar job travado |
| **Rede `jarvis-network` inexistente** (Docker) | `docker compose -f docker-compose.scheduler.yml up` falha | Remover `jarvis-network` do compose ou criar: `docker network create jarvis-network` |
| **RabbitMQ não healthy** | Container `opencode-rabbitmq` não passa no healthcheck | Verificar logs; RabbitMQ é dependência do `opencode-server` |

### 2. Relatórios não chegam no Telegram

| Causa | Como verificar | Solução |
|-------|----------------|---------|
| **TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID vazios** | Verificar `.env.server` | Configurar ambas as variáveis |
| **Pipeline de relatório não existe** | `GET /api/pipelines` — ausência de `daily-opportunity-report` ou `weekly-opportunity-report` | Criar pipeline com strategy correspondente |
| **Queue não processa** | Dashboard → Activity Queue: itens em "Pending" por muito tempo | Verificar logs `[opencode-server] queue tick error` |
| **Dedup por hash** | Activity evita reenvio se o digest for idêntico | Normal; aguardar próximo ciclo com dados novos |
| **LLM não configurado** (opcional) | Relatório usa fallback sem LLM se `memoryLlm` ausente | Configurar `ANTHROPIC_API_KEY` ou `OPENROUTER_API_KEY` para relatórios mais ricos |

## Comandos úteis

### Verificar pipelines e status

```bash
# Via API (standalone na porta 3000)
curl -s http://localhost:3000/api/pipelines | jq
curl -s http://localhost:3000/api/status | jq

# Com Bearer token (se API_TOKEN definido)
curl -s -H "Authorization: Bearer $API_TOKEN" http://localhost:3000/api/pipelines | jq
```

### Criar pipeline de relatório diário

```bash
curl -X POST http://localhost:3000/api/pipelines \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Relatório Diário",
    "strategy": "daily-opportunity-report",
    "schedule_cron": "0 8 * * *",
    "config_json": {}
  }'
```

Cron sugerido: `0 8 * * *` = diariamente às 8h.

### Criar pipeline de relatório semanal

```bash
curl -X POST http://localhost:3000/api/pipelines \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Relatório Semanal",
    "strategy": "weekly-opportunity-report",
    "schedule_cron": "0 9 * * 1",
    "config_json": {}
  }'
```

Cron sugerido: `0 9 * * 1` = toda segunda às 9h.

### Executar pipeline manualmente

```bash
curl -X POST http://localhost:3000/api/pipelines/{id}/run
```

### Verificar fila de activities

```bash
curl -s http://localhost:3000/api/queue?limit=50 | jq
```

## Estrutura de cron (5 campos)

Formato: `minuto hora dia_mês mês dia_semana`

- `*` = qualquer valor
- `0 8 * * *` = 8h todo dia
- `0 9 * * 1` = 9h toda segunda (0=domingo, 1=segunda, …)
- `*/15 * * * *` = a cada 15 minutos

## Variáveis de ambiente para relatórios

No `.env.server`:

```env
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_CHAT_ID=-1001234567890
```

- **Bot:** criar em [@BotFather](https://t.me/BotFather).
- **Chat ID:** pode ser negativo para grupos; obter via [@userinfobot](https://t.me/userinfobot) ou API do Telegram.

## Logs relevantes

- `[opencode-server] scheduler tick error` — erro no scheduler
- `[opencode-server] queue tick error` — erro no processador da fila
- `[opencode-server] initial tick error` — erro no primeiro tick

## Dashboard (http://host:3000/)

O painel em `/` ou `/dashboard` exibe:

- **Activity Queue** — itens da fila (pending, running, completed, failed). Use "+ Add Activity" para enfileirar manualmente.
- **Pipelines** — pipelines cadastrados e seus crons. Use "▶ Run" para executar manualmente.
- **Opportunities, Niches, Market, Submissions, Discovery, Specs** — demais abas.

### API Token

Se o servidor usa `API_TOKEN` no `.env.server`, todas as requisições `/api/*` exigem `Authorization: Bearer <token>`.

1. Clique no botão **🔑** no header.
2. Cole o token e clique em **Salvar**.
3. O token fica em `localStorage` do navegador.

Sem o token configurado, a barra de status mostra "API requer token. Clique em 🔑 para configurar." e as abas ficam vazias.

## Referências

- [docs/features/env-vars.md](../features/env-vars.md) — variáveis de ambiente
- [docs/api/opencode-server.md](../api/opencode-server.md) — API do server
- [docs/runbooks/runbook-deploy-opencode-server-vps.md](runbook-deploy-opencode-server-vps.md) — deploy
