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
| **Projetos** | Lista de projetos abertos, abrir novo, navegar | P0 |
| **Sessões** | Lista de sessões por projeto, criar nova, navegar | P0 |
| **Chat** | Timeline de mensagens, prompt input, envio de prompt | P0 |
| **Sidebar** | Rail 64px (ícones projetos + ações), painel colapsável 244px | P0 |
| Terminal | WebSocket PTY | P1 |
| Ficheiros | Tabs, diff, busca | P1 |
| Providers / OAuth | Configuração, fluxo OAuth | P1 |

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

- **Base URL:** Configurável (ex.: `http://localhost:4096` ou URL pública).
- **Auth:** Basic Auth quando `OPENCODE_SERVER_PASSWORD` ativo.
- **SSE:** `GET /global/event` para eventos em tempo real (chat, status).
- **WebSocket:** `GET /pty/:id/connect` para terminal (fase 2).

## Implementação

O app Flutter (`packages/flutter_app`) inclui:

- **API client** (`lib/api/opencode_client.dart`): REST para path, project, session, pty, file, server
  - Projetos: list, add-by-url
  - Sessões: list, create, get, messages, prompt, abort, fork, diff
  - Ficheiros: find, list, read, status
  - Server: status, pipelines (enable/disable/run), jobs, goals, proposals (approve/reject)
- **SSE** (`lib/services/sse_client.dart`): stream `/global/event` para eventos em tempo real
- **WebSocket PTY** (`lib/services/pty_websocket.dart`): terminal integrado
- **Telas**:
  - `ConnectionScreen`: conexão a servidor, URL, password, servidores guardados
  - `MainLayout`: rail 64px, painel lateral, dialog add project (add-by-url), chat + files + terminal em tabs
  - `SessionScreen`: timeline de mensagens, prompt input, Abort/Fork, tab Files, tab Terminal
  - `FilesScreen`: busca, listagem, visualização de conteúdo
  - `ServerDashboardScreen`: status, pipelines (enable/disable/run), jobs, goals, proposals

## Testes

Testes de unidade em `packages/flutter_app/test/`:

- **`api/models_test.dart`** — Modelos (PathInfo, HealthInfo, Project, Session, Message, Part, PtyInfo, FileNode, FileContent, FileStatusEntry, ServerStatus) com dados fake via `faker_dart`
- **`api/opencode_client_test.dart`** — Cliente REST com `http.MockClient` e respostas fake
- **`state/app_state_test.dart`** — AppState (addServer, removeServer, setActive)
- **`widget_test.dart`** — App e ConnectionScreen

Executar: `cd packages/flutter_app && flutter test`

## Referências

- [Arquitetura: Flutter design parity](../architecture/flutter-design-parity.md)
- [API OpenCode Server](../api/opencode-server.md)
- [Runbook: App backend requirements](../runbooks/runbook-app-backend-requirements.md)
