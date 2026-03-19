# GitHub OAuth — proxy (device flow)

O servidor OpenCode expõe um proxy para o [OAuth 2.0 Device Authorization Grant](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow) da GitHub (OAuth App) e o fluxo equivalente para [GitHub Apps](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app#using-the-device-flow-to-generate-a-user-access-token). O app Flutter só recebe o `access_token` após o utilizador concluir o fluxo em `github.com/login/device`.

Para padrões de mercado (OAuth por redirect / código de autorização) e plano de evolução **ainda não implementado**, ver [features/github-integration-strategy.md](../features/github-integration-strategy.md).

**Prefixo:** `/github/auth` na mesma base do `opencode serve` (ex.: `http://host:4096/github/auth/...`).

### OAuth App vs GitHub App

- **GitHub App** (`/settings/apps`): o pedido inicial a `POST https://github.com/login/device/code` deve levar **apenas** `client_id` (sem `scope`). Neste proxy: define **`GITHUB_OAUTH_SKIP_SCOPE=1`** (o mais fiável) ou **`GITHUB_OAUTH_SCOPES=`** vazio (se o teu `.env` preservar strings vazias).
- **OAuth App** (`/settings/developers`): não uses `GITHUB_OAUTH_SKIP_SCOPE`. Com `GITHUB_OAUTH_SCOPES` omitida, o proxy envia por defeito `repo read:user` (separado por espaços, como a GitHub pede). Ativa **Device flow** em *Settings → Developer settings → OAuth Apps → [a tua app]*.

Se a página da GitHub mostrar “device connected” mas o poll ficar sempre em `pending`: em **OAuth Apps** verifica sobretudo se o **`GITHUB_OAUTH_CLIENT_ID` no servidor** é o Client ID **dessa mesma** app (não confundir com outra app ou com App ID de GitHub App), se iniciaste um **novo** fluxo após mudar o `.env`, e se não há **várias réplicas** do servidor com IDs diferentes. Para GitHub App, verifica também `GITHUB_OAUTH_SKIP_SCOPE` e ausência de `scope` indevido.

## Variáveis de ambiente

| Variável | Obrigatório | Notas |
|----------|-------------|--------|
| `GITHUB_OAUTH_CLIENT_ID` | Sim | Client ID (OAuth App ou GitHub App); **ativar device flow** nas definições. |
| `GITHUB_OAUTH_SKIP_SCOPE` | Não | Se `1` ou `true`: não se envia `scope` (GitHub App). |
| `GITHUB_OAUTH_SCOPES` | Condicional | Se **omitida** (e sem skip): envia-se `repo read:user`. Se **vazia**: não se envia `scope`. Se preenchida: scopes separados por espaços. |
| `GITHUB_OAUTH_CLIENT_SECRET` | Não | Se existir, é enviado no poll do token (alguns registos beneficiam). |

## Endpoints

### `POST /github/auth/start`

Inicia o device flow junto da GitHub.

**Resposta 200:** JSON com `deviceCode`, `userCode`, `verificationUri`, `expiresIn`, `interval` (segundos mínimos entre pedidos de token na GitHub).

**Erros:** `503` se `GITHUB_OAUTH_CLIENT_ID` não estiver definido; `502` se a GitHub devolver erro HTTP.

### `POST /github/auth/poll`

Corpo JSON: `{ "deviceCode": "<string>" }`.

A GitHub pode responder ao pedido de token com **HTTP 400** e corpo JSON (`authorization_pending`, `slow_down`, etc.); o proxy **sempre** devolve **200** ao cliente com o campo `status` normalizado abaixo (desde que consiga interpretar a resposta).

**Resposta 200** — campo `status`:

| `status` | Significado |
|----------|-------------|
| `pending` | Autorização ainda não concluída (`authorization_pending` na GitHub). |
| `slow_down` | Pedidos demasiado frequentes; o cliente **deve** aumentar o intervalo entre polls. Opcional: `interval` (segundos) se a GitHub o enviar. |
| `done` | Sucesso; inclui `token` (access token). |
| `expired` | `device_code` expirou; reiniciar com `/start`. |
| `denied` | Utilizador cancelou. |
| `error` | Falha; campo `error` com detalhe. |

## Comportamento do cliente (Flutter / outro)

1. Respeitar o `interval` devolvido em `/start` entre chamadas a `/poll`.
2. Ao receber `slow_down`, aumentar o intervalo (ex.: usar `interval` da resposta ou somar 5 s ao intervalo atual) e **reagendar** o timer; continuar a tratar como “a aguardar autorização”, não como erro fatal.
3. Ignorar `slow_down` agregado em `pending` sem ajuste de intervalo pode manter o estado “à espera” indefinidamente mesmo depois de autorizado na GitHub, porque a API continua a responder com erro de ritmo.

## Referências

- [GitHub — Device flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow)
- Código: `packages/opencode/src/server/routes/github_auth.ts`, `packages/flutter_app/lib/widgets/dialog_add_project.dart`
