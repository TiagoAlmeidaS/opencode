# Feature: App Flutter OpenCode

App Flutter que integra ao OpenCode Server (porta 4096), reutilizando a mesma API e seguindo o padrão de design do dashboard OpenCode.

## Objetivo

- Painel mobile/desktop em Flutter que converse com o backend OpenCode (REST + SSE + WebSocket).
- Paridade visual com o App web (SolidJS) via design system OC-2.
- MVP focado em servidores, projetos, sessões e chat.

## MVP de UI

Escopo mínimo para primeira versão:

| Área | Funcionalidade | Prioridade |
|-----|----------------|------------|
| **Servidores** | Lista, adicionar, selecionar, configurar baseUrl + credenciais | P0 |
| **Projetos** | Lista, abrir novo; GitHub PAT + listar repos + `POST /project/add-by-url` com token | P0 |
| **Sessões** | Lista de sessões por projeto, criar nova, navegar | P0 |
| **Chat** | Timeline de mensagens, prompt input, envio de prompt | P0 |
| **Sidebar** | Rail 64px (ícones projetos + ações), painel colapsável 244px | P0 |
| Terminal | WebSocket PTY | P1 |
| Ficheiros | Tabs, diff, busca | P1 |
| Modelo LLM (global + projeto) | `LlmSettingsScreen`, sem OAuth no app | P0 |
| Providers / OAuth | Chaves no servidor; OAuth no app | P1 |

### Telas MVP

1. **Tela de conexão** — Seleção de servidor, health check, erro de conexão.
2. **Layout principal** — Sidebar rail + painel lateral + área main.
3. **Lista de projetos** — Rail com ícones; painel com projetos e workspaces.
4. **Lista de sessões** — Por projeto/workspace, criar nova sessão.
5. **Chat de sessão** — Timeline de mensagens, input de prompt, ações (abort, fork).

### Layout

- **Desktop (≥1280px):** Sidebar rail 64px + painel lateral colapsável (min 244px) + main.
- **Mobile:** Drawer lateral em vez de sidebar fixa; mesma hierarquia de conteúdo.

## Config / integração

- **Base URL:** Configurável (ex.: `http://localhost:4096` ou URL pública) — sempre o host do **`opencode serve`** para chat/sessões.
- **Daemon API base (opcional):** quando o daemon/pipelines correm no standalone `packages/server`, indicar `http://host:3000` ou `http://host:3000/api` (normalizado). Se vazio e o host da OpenCode URL **não** for localhost, a app assume automaticamente `http://<mesmo-host>:3000/api`. Para `opencode serve --daemon` no mesmo host remoto, preencher explicitamente `http://host:4096/server`. Helpers: [`daemon_url.dart`](../../packages/flutter_app/lib/api/daemon_url.dart), cliente só daemon: [`daemon_api_client.dart`](../../packages/flutter_app/lib/api/daemon_api_client.dart).
- **API token (opcional):** Bearer para o standalone quando `API_TOKEN` está definido no servidor. Em desenvolvimento desktop, a app pode pré-preencher a partir de `API_TOKEN` no `.env.server` na raiz do monorepo (ver [README do flutter_app](../../packages/flutter_app/README.md)) ou via `--dart-define=API_TOKEN=...`. **Auto-detecção:** no Flutter Web (ou quando o campo está vazio), a app busca `GET /` no servidor standalone e extrai o token injectado no HTML (`localStorage.setItem("api_token","<TOKEN>")`), o mesmo mecanismo do dashboard. Fallback duplo: no `_connect()` da ConnectionScreen e no `AppState.connect()` se `status()` falhar sem token.
- **Auth:** Basic Auth quando `OPENCODE_SERVER_PASSWORD` ativo (pedidos OpenCode via `OpenCodeClient`). Server API (`ServerApiClient`) usa **apenas Bearer** — sem conflito de credenciais entre os dois.
- **GitHub:** No diálogo *Add repository*, PAT opcional: chamadas à API GitHub só no dispositivo para listar repos; ao confirmar *Add to OpenCode*, o URL e o token (se preenchido) vão em `POST /project/add-by-url`. Repositórios **públicos** podem ser adicionados só com URL (clone anónimo no servidor). **Privados** exigem PAT no app ou `GITHUB_TOKEN` no host do servidor.
- **SSE:** `GET /global/event` para eventos em tempo real (chat, status).
- **WebSocket:** `GET /pty/:id/connect` para terminal (fase 2).

### Home dashboard (daemon)

- A aba **Home** mostra `HomeDashboardScreen` (métricas, relatórios, learnings, funil de oportunidades, ações pendentes) apenas quando `GET /server/status` responde **200** — isto é, quando o OpenCode está a correr com a camada **daemon** ativa.
- Para ver o dashboard na prática: arrancar com `opencode serve --daemon` ou `server.daemon: true` na configuração. Ver [API OpenCode Server](../api/opencode-server.md).
- Sem daemon, a Home mostra um estado explicativo com atalhos para o menu de sessões (mobile), separador **Server** e **Check again** (chama `refreshServerStatus()`). Ao voltar à aba Home, o app também tenta atualizar o estado do daemon.

## Implementação

O app Flutter (`packages/flutter_app`) inclui:

- **API client** (`lib/api/opencode_client.dart`): REST alinhado ao SDK JS v2 para o OpenCode (porta 4096). **Server API client** (`lib/api/server_api_client.dart`): client dedicado para o standalone `packages/server` (porta 3000), com Bearer token independente — simplifica gestão de auth e evita conflito Basic/Bearer.
- **SSE** (`lib/services/sse_client.dart`): `GET /global/event`; payload `{ directory, payload: { type, properties } }`.
- **AppState** (`lib/state/app_state.dart`): `chatReload` (stream) recarrega mensagens na sessão ativa em eventos `message.*`, `session.status`, `session.idle`; debounce ~400ms. `sessionAttention` notifica sessão em `permission.asked` / `question.asked`. Lista de sessões em `session.created|updated|deleted` (correção do parsing do tipo aninhado).
- **Permissões / perguntas** (`lib/widgets/session_pending_dialogs.dart`): `GET /permission`, `POST /permission/:id/reply`; `GET /question`, `POST /question/:id/reply`, `POST /question/:id/reject`. Polling a cada 3s na sessão + após envio de prompt + SSE.
- **WebSocket PTY** (`lib/services/pty_websocket.dart`): terminal integrado.
- **Telas**: `ConnectionScreen`, `MainLayout`, `HomeDashboardScreen` (resumo `/server/*` quando daemon ativo), `SessionScreen` (chat + Files + Terminal), `FilesScreen`, `ServerDashboardScreen`, `RepoJobsScreen`, `ReportsScreen`, `LearningsScreen`, `OpportunitiesScreen`, `LlmSettingsScreen` (modelo global via `PATCH /global/config`; modelo do projeto via `PATCH /config` + lista `GET /config/providers`). Chaves API/OAuth permanecem no host do servidor.

### Matriz API principal (SDK vs client Flutter)

| Família SDK | Coberto no client | UI |
|-------------|-------------------|-----|
| `/global/health`, `/path` | sim | Connection / Main |
| `/project`, `/project/add-by-url` | sim | MainLayout |
| `/session` CRUD, messages, prompt, abort, fork, diff | sim (diff só API) | Session |
| `/pty` + WS connect | sim | Terminal tab |
| `/find/file`, `/file`, `/file/content`, `/file/status` | sim | Files |
| `/permission`, `/permission/:id/reply` | sim | Session (dialogs) |
| `/question`, `/question/:id/reply`, `/question/:id/reject` | sim | Session (dialogs) |
| `/global/config` GET/PATCH, `/config` GET/PATCH, `/config/providers` | sim (client) | LLM & provider (`LlmSettingsScreen`) |
| OAuth, MCP, LSP, experimental… | não | — |
| `/session/prompt_async`, share, summarize, revert, edição mensagens… | não | — |
| `/find/symbol` | não | — |

### Matriz API `/server/*` (daemon)

| Rota doc | Client | UI |
|----------|--------|-----|
| `/server/status` | sim | `HomeDashboardScreen`, `AppState.daemonAvailable` |
| `/server/pipelines` (+ create/patch, enable/disable/run) | sim | `ServerDashboardScreen` |
| `/server/jobs`, `/server/goals`, `/server/proposals` (+ approve/reject, get by id) | sim | `ServerDashboardScreen`, `HomeDashboardScreen` (pendentes) |
| `/server/dashboard` | sim | `ServerDashboardScreen` |
| `/server/memory/retrieve` | sim | `ServerDashboardScreen` |
| `/server/discovery` GET/POST | sim | `ServerDashboardScreen` |
| `/server/repo-issue-jobs` (+ detalhe por id) | sim | `ServerDashboardScreen`, `RepoJobsScreen` |
| `/server/reports`, `/server/reports/:id` | sim | `HomeDashboardScreen`, `ReportsScreen` |
| `/server/learnings`, `POST …/learnings/extract` | sim | `HomeDashboardScreen`, `LearningsScreen` |
| `/server/opportunities/stats`, `/server/opportunities` (+ shortlist/ignore) | sim | `HomeDashboardScreen`, `OpportunitiesScreen` |
| `/server/submissions` (+ approve/reject) | sim | `HomeDashboardScreen` |
| `/server/logs`, filas genéricas não listadas acima | não | — |

**Fonte de verdade:** ampliar client consultando `sdk.gen.ts` ou OpenAPI em `{baseUrl}/doc`.

## Testes

Testes de unidade em `packages/flutter_app/test/`:

- **`api/models_test.dart`** — Modelos (PathInfo, HealthInfo, Project, Session, Message, Part, PtyInfo, FileNode, FileContent, FileStatusEntry, ServerStatus) com dados fake via `faker_dart`
- **`api/opencode_client_test.dart`** — Cliente REST OpenCode (health, path, sessions, files, permissions, questions) com `http.MockClient`
- **`api/server_api_client_test.dart`** — Server API client (status, pipelines, jobs, dashboard, memory, discovery) com Bearer e URL normalization
- **`state/app_state_test.dart`** — AppState (addServer, removeServer, setActive)
- **`widget_test.dart`** — App e ConnectionScreen

Executar: `cd packages/flutter_app && flutter test`

## Referências

- [Arquitetura: Flutter design parity](../architecture/flutter-design-parity.md)
- [API OpenCode Server](../api/opencode-server.md)
- [Runbook: App backend requirements](../runbooks/runbook-app-backend-requirements.md)
