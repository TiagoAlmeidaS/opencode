# Feature: CLI + OpenCode Server (RAG e learnings)

O CLI `opencode` pode consumir o mesmo RAG e os mesmos `agent_learnings` que o OpenCode Server expõe na porta do daemon (ex.: 4096), alinhando contexto com a App.

## Configuração

1. **URL da API `/server`** (uma das opções):
   - `opencode.json`: `server.memory.url` — ex.: `"http://127.0.0.1:4096/server"`
   - Env: `OPENCODE_SERVER_MEMORY_URL` (base completa com `/server`)
   - Env: `OPENCODE_SERVER_URL` — ex.: `http://127.0.0.1:4096` (o CLI acrescenta `/server`)

2. **Auth** (igual ao resto da API): `OPENCODE_SERVER_PASSWORD` e opcionalmente `OPENCODE_SERVER_USERNAME`.

3. **Opções** (`server.memory`):
   - `rag`: `false` para desativar injeção de chunks RAG por mensagem (default `true` quando a URL está definida).
   - `learnings`: `false` para desativar injeção da lista de learnings (default `true`).
   - `timeoutMs`: timeout HTTP (default 8000).

Sem URL configurada, o CLI comporta-se como antes (apenas skills locais em ficheiro).

## Comportamento na sessão

Em cada turno com mensagem do utilizador, se `server.memory.url` (ou env equivalente) estiver definido:

- É chamado `GET /server/memory/retrieve?q=...` com o texto do utilizador (até ~4k caracteres).
- É chamado `GET /server/learnings?limit=20` e o resultado é formatado no system prompt.

Falhas de rede ou 401/503 são ignoradas (log WARN); a sessão continua.

## Comandos CLI

| Comando | Descrição |
|---------|-----------|
| `opencode server memory retrieve "<query>"` | Imprime JSON com chunks RAG. |
| `opencode server learnings list [--category] [--limit]` | Lista learnings. |
| `opencode server learnings create --key ... --category ... --title ... --body ...` | Cria ou atualiza por `key`. Opções: `--confidence`, `--source`, `--tags` (CSV). |

## Referências

- [API OpenCode Server](../api/opencode-server.md)
- [Memory RAG](memory-rag.md)
