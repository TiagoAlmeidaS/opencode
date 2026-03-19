# OpenCode Flutter App

App Flutter que integra ao OpenCode Server (porta 4096), com paridade de design com o dashboard OpenCode.

## FVM e versão Flutter

O projeto usa **FVM** com Flutter **3.41.5** (stable). Configuração em `.fvmrc`.

```bash
fvm list          # listar versões instaladas
fvm use 3.41.5    # usar esta versão no projeto
fvm install       # garante .fvm/flutter_sdk (symlink para a versão do .fvmrc)
fvm flutter run   # executar com a versão do FVM
```

### Erro: `SemanticsFlags` / `hasCheckedState` / `semantics_debugger.dart`

Esses erros vêm do **Flutter SDK em `C:\Users\tiago\flutter`** (ou outro PATH global): o **framework** (`packages/flutter`) e o **Dart/engine** (`dart:ui`) estão **desalinhados** — por exemplo, checkout incompleto ou mistura de canais.

**Não é bug do código deste repo.** Corrige assim:

1. **Usar só o FVM deste projeto** (não corras `flutter` do PATH global para este app):
   ```bash
   cd packages/flutter_app
   fvm install
   fvm flutter doctor -v
   fvm flutter pub get
   fvm flutter run
   ```
2. **Cursor / VS Code:** em *Settings* → `dart.flutterSdkPath` aponta para  
   `e:\projects\ia\opencode\packages\flutter_app\.fvm\flutter_sdk`  
   (ou abre a pasta `packages/flutter_app`, que já tem [`.vscode/settings.json`](.vscode/settings.json) com isso).
3. **Reparar o Flutter global** (se quiseres continuar a usá-lo noutros projetos): na pasta `C:\Users\tiago\flutter` executa `git status`, depois `git checkout stable && git pull` e `.\bin\flutter.bat doctor -v` / `upgrade` — **não** atualizes só o subdiretório `packages/flutter` à mão.

## Executar no Android (dispositivo físico)

1. **Modo de programador (Windows)** — necessário para symlinks do Flutter/FVM:
   - `start ms-settings:developers` ou Configurações → Privacidade → Modo de programador
   - Ativar "Modo de programador"

2. **No Samsung S10e:**
   - Configurações → Acerca do telemóvel → tocar 7x em "Número da versão"
   - Configurações → Opções de programador → ativar "Depuração USB"
   - Conectar via USB e aceitar "Permitir depuração USB" no telemóvel

3. **Executar:**
   ```bash
   cd packages/flutter_app
   fvm flutter devices    # verificar se o S10e aparece
   fvm flutter run -d <device_id>
   ```

## Daemon em `:3000` (automático para IPs remotos)

Se a **OpenCode Server URL** for um host **não** localhost (ex.: `http://100.98.213.86:4096`) e o campo **Daemon API base** ficar vazio, a app usa automaticamente **`http://<mesmo-host>:3000/api`** para `GET /status`, pipelines, etc. (standalone `packages/server`).

- `http://host:3000` ou `http://host:3000/` no campo é normalizado para `.../api`.
- Para usar só `opencode serve --daemon` no **mesmo** host remoto, preenche **Daemon API base** com `http://HOST:4096/server`.
- Classe dedicada: [`lib/api/daemon_api_client.dart`](lib/api/daemon_api_client.dart) (API só daemon; por baixo reutiliza `OpenCodeClient`).

## API_TOKEN (standalone `:3000/api`)

O standalone aplica **só Bearer** em `/api/*` ([`standalone.ts`](../../packages/server/src/standalone.ts)); **não** usa a password Basic do OpenCode. Se o campo **API token** estiver vazio, o pedido vai **sem** `Authorization` → **401** quando `API_TOKEN` está definido no servidor. Antes o app podia enviar **Basic** (user/password da 4096) para a 3000, o que também resulta em 401 — isso foi corrigido: em rotas para daemon standalone só vai **Bearer** com o valor de **API token** (ou nada).

O dashboard HTML ([`dashboard.html`](../../packages/server/public/dashboard.html)) usa `localStorage.api_token` e `Authorization: Bearer ${token}` em `apiFetch`, com `API = '/api'` (mesma origem :3000). O servidor pode injetar o token na página com `DASHBOARD_INJECT_TOKEN` + `API_TOKEN`.

Se usares **Daemon API base** com o servidor `packages/server` e `API_TOKEN` no [`.env.server`](../../.env.server) da raiz do repo:

- Em **desktop** (`flutter run` a partir de `packages/flutter_app`), o campo **API token** na tela de conexão é preenchido automaticamente a partir de `API_TOKEN=` nesse ficheiro (procura `../../.env.server` relativamente ao cwd).
- Alternativa: `fvm flutter run --dart-define=API_TOKEN=seu_token`
- Em **dispositivo móvel** o ficheiro da raiz não existe no telemóvel: cola o token manualmente ou usa `--dart-define` no build.

## Requisitos

- Flutter SDK 3.9+
- OpenCode Server a correr (ex.: `opencode serve` em `http://localhost:4096`)

## Executar

```bash
cd packages/flutter_app
flutter run
```

## Funcionalidades

- **Conexão**: URL do servidor, password opcional (Basic Auth), servidores guardados
- **Projetos**: Lista de projetos abertos no rail lateral
- **Sessões**: Criar nova, listar, selecionar
- **Chat**: Timeline de mensagens, envio de prompt
- **Terminal**: WebSocket PTY integrado por sessão
- **Server dashboard**: Status, pipelines, jobs quando o daemon está ativo (`opencode serve --daemon`)

## Estrutura

- `lib/api/` — API client REST
- `lib/services/` — SSE (/global/event), WebSocket PTY
- `lib/state/` — AppState (Provider)
- `lib/screens/` — Telas
- `lib/theme/` — OC-2 design tokens
- `lib/widgets/` — OpenCodeButton, OpenCodeIconButton

## Referências

- [docs/features/flutter-app.md](../../docs/features/flutter-app.md)
- [docs/architecture/flutter-design-parity.md](../../docs/architecture/flutter-design-parity.md)
