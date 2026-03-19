# OpenCode Flutter App

App Flutter que integra ao OpenCode Server (porta 4096), com paridade de design com o dashboard OpenCode.

## FVM e versão Flutter

O projeto usa **FVM** com Flutter **3.41.5** (stable). Configuração em `.fvmrc`.

```bash
fvm list          # listar versões instaladas
fvm use 3.41.5    # usar esta versão no projeto
fvm flutter run   # executar com a versão do FVM
```

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
