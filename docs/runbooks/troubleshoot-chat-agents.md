# Troubleshooting: chat pede agente/modelo ou “nenhum agente disponível”

Este runbook cobre validação quando a UI bloqueia o envio do prompt ou mostra toasts sobre providers, agentes ou falha de carregamento do projeto.

## 1. Confirmar API no mesmo host que a app

Com basic auth (se `OPENCODE_SERVER_PASSWORD` estiver definido no processo do `opencode serve`):

```bash
curl -sS -u "opencode:SUA_SENHA" "http://127.0.0.1:4096/agent"
curl -sS -u "opencode:SUA_SENHA" "http://127.0.0.1:4096/provider"
```

Sem password no servidor, omitir `-u`.

- **`/agent`:** deve ser um JSON array com entradas como `build`, `plan` (modo `primary`, não `hidden`).
- **`/provider`:** o array **`connected`** deve listar IDs de providers com credenciais carregadas.

Se `401` ou falha de rede, a app também não consegue fazer bootstrap — ver secção 4.

## 2. `opencode.json` / `.opencode/`

- **`agent.<nome>.disable: true`:** remove o agente. Desativar **build** e **plan** sem outro agente `primary` visível pode deixar a lista filtrada na UI vazia.
- **`enabled_providers` / `disabled_providers`:** podem esvaziar `connected` no `/provider`.

Ver [env-vars.md](../features/env-vars.md) e o schema em https://opencode.ai/config.json

## 3. Estado do projeto na app (bootstrap)

Se os pedidos iniciais falharem (`project.current`, `provider.list`, `app.agents`, `config.get`), o estado fica **`partial`** e a lista de agentes pode ficar vazia. Recarregar o projeto ou corrigir URL/auth.

## 4. `.env.server` e Docker

- O ficheiro **`.env.server`** é carregado pelo **Docker Compose** (`env_file`), não automaticamente por `opencode serve` na shell — exportar variáveis ou usar `--env-file` ao testar localmente.
- **`OPENCODE_SERVER_PASSWORD`:** o cliente (browser / app) precisa de enviar **basic auth** nas mesmas condições que o `curl` acima.
- **`MEMORY_LLM_PROVIDER`:** não lista agentes HTTP; evitar **duplicar** a mesma variável no ficheiro (a última linha prevalece).

Stack local típica: [docker-compose.scheduler.yml](../../docker-compose.scheduler.yml) + [docker-compose.opencode-server.yml](../../docker-compose.opencode-server.yml). Ver comentários nos ficheiros para ordem de subida e porta (`OPENCODE_BACKEND_PORT`, default 4096).

## 5. Comparação homolog vs local

Se `GET /agent` for correto no Docker/local e falhar na homolog (ou o contrário), o problema é **deploy, URL, firewall ou env no host**, não a lógica de `Agent.list()` no repositório.
