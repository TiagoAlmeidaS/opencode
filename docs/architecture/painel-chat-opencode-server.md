# Integração: Painel (chat) e OpenCode Server

Este documento descreve como o **painel** (app React com chat e Board) se conecta ao backend e ao OpenCode Server, e qual é a diferença entre os dois modos de uso.

## Dois cenários de uso

### 1. Backend OpenCode com daemon (porta 4096)

Quando você roda o **OpenCode** em modo servidor com daemon:

- **Comando:** `opencode serve --daemon` (ou config `server.daemon: true`)
- **Porta:** 4096 (ou a que estiver configurada)
- **O que expõe:**
  - API principal do OpenCode: sessões, chat, projetos, worktrees, providers, etc. (SDK usado pelo painel)
  - Rotas do OpenCode Server em **`/server`**: queue, discovery, pipelines, jobs, opportunities, etc.

O **painel** (packages/app) conecta-se a **uma única URL de servidor** (ex.: `http://localhost:4096`). Essa URL é a do backend OpenCode.

- **Chat e sessões:** usam a API principal (ex.: `GET /session/list`, mensagens, etc.) nessa mesma URL.
- **Board (Queue, Discovery, etc.):** usa a mesma URL + prefixo `/server` (ex.: `http://localhost:4096/server/queue`, `.../server/discovery`). Ou seja, Board e chat estão integrados porque usam o **mesmo servidor**; o daemon do OpenCode Server está embutido nesse processo e exposto em `/server`.

Resumo: **uma URL (4096) = backend OpenCode + OpenCode Server**. O painel não precisa de duas integrações; ele só aponta para esse backend e tanto o chat quanto o Board funcionam.

### 2. OpenCode Server standalone (porta 3000, Docker)

Quando você roda **apenas** o container do OpenCode Server (packages/server):

- **Comando:** `docker compose -f docker-compose.opencode-server.yml up`
- **Porta:** 3000
- **O que expõe:**
  - Dashboard estático (`dashboard.html`) em `/`
  - API em `/api/*`: status, queue, discovery, pipelines, etc.
  - **Não** expõe a API do OpenCode (sessões, chat, worktrees, SDK do painel).

Nesse cenário **não existe** o backend OpenCode (4096). O que você acessa em `http://localhost:3000` (ou `http://76.13.96.99:3000`) é só o dashboard e a API do OpenCode Server. Não há “chat do painel” nessa URL porque o painel (React) e o chat dependem da **API do OpenCode** (sessões, mensagens, etc.), que só existe no processo `opencode serve`.

Ou seja: **não há integração do chat do painel com o opencode-server (3000)** quando só o container na 3000 está rodando. A “integração” que existe é no cenário 1: chat e Board usam o mesmo backend (4096) que, com daemon, já inclui as rotas `/server`.

## Onde isso está no código

| Componente | Função | Servidor usado |
|------------|--------|----------------|
| **Painel (packages/app)** | UI React: chat, sessões, Board, projetos | `server.current.http.url` (contexto Server) — normalmente 4096 |
| **globalSDK** (chat, sessões, providers) | Cliente SDK (createSdkForServer) | Mesma URL do servidor selecionado (4096) |
| **Board** (Queue, Discovery, etc.) | `apiBase() = server.current.http.url + "/server"` | Mesma URL + `/server` (ex.: 4096/server) |
| **entry.tsx** | URL padrão do servidor | Dev: `VITE_OPENCODE_SERVER_PORT` (4096); produção: `location.origin` ou valor salvo |

O backend OpenCode (packages/opencode) monta as rotas do OpenCode Server em `/server` quando o daemon está ativo:

```ts
// packages/opencode/src/server/server.ts
if (opts.daemon) {
  serverDaemonInstance = createOpenCodeServer({ ... })
  app = app.route("/server", serverDaemonInstance!.routes) as Hono
  serverDaemonInstance!.startDaemon()
}
```

Por isso, quando o painel está conectado a `http://localhost:4096`, o Board chama `http://localhost:4096/server/queue`, `.../server/discovery`, etc., e tudo funciona na mesma origem.

## Como ter chat + Board na mesma experiência

- **Opção A (recomendada hoje):** Rodar o **OpenCode** com daemon na VPS (ou na sua máquina) na porta 4096 e apontar o painel para essa URL. O painel (se estiver em app.opencode.ai ou atrás do mesmo proxy) usa essa base URL e terá tanto chat quanto Board integrados.
- **Opção B:** Rodar só o container do OpenCode Server (3000): você tem o dashboard estático e a API de queue/discovery, mas **sem** chat do painel; para ter chat seria necessário também expor um `opencode serve --daemon` (4096) e o painel conectar a ele.
- **Opção C (Docker, interface integrada):** Use o compose: `docker compose -f docker-compose.opencode-server.yml up -d`. O **opencode-backend** (porta 4096) sobe por padrão e é construído já com o app (packages/app) em `OPENCODE_APP_DIST`; a interface de chat é servida na **mesma URL** (`http://<host>:4096`). Basta abrir `http://<host>:4096` no browser para ter chat e Board sem depender de app.opencode.ai. Se no futuro precisar só do server (3000) sem chat, comente o serviço `opencode-backend` no compose ou reintroduza um perfil.

## Referências

- [api/opencode-server.md](../api/opencode-server.md) — API do OpenCode Server (prefixo `/server`) e ativação do daemon
- [visao-opencode-server-vps-integracao.md](visao-opencode-server-vps-integracao.md) — Visão VPS e clientes
- [runbook-deploy-opencode-server-vps.md](../runbooks/runbook-deploy-opencode-server-vps.md) — Deploy na VPS
