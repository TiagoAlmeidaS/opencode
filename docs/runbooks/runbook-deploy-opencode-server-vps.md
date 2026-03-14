# Runbook: Deploy OpenCode Server na VPS

Procedimento para rodar o OpenCode Server (`opencode serve --daemon`) em uma VPS Linux 24/7, com opções por systemd ou Docker.

## Pré-requisitos

- **VPS:** Linux (Ubuntu 20.04+ ou Debian 11+), mínimo 1 GB RAM (2 GB+ recomendado se pipelines usarem LLM).
- **Runtime:** [Bun](https://bun.sh) instalado (recomendado) ou Node.js 18+.
- **Variáveis de ambiente:** configurar conforme [features/env-vars.md](../features/env-vars.md), por exemplo:
  - `OPENCODE_SERVER_PASSWORD` (e opcionalmente `OPENCODE_SERVER_USERNAME`) para autenticação da API.
  - LLM: ex. `AZURE_API_KEY` e `AZURE_RESOURCE_NAME` para Azure OpenAI, ou outro provider.
  - Telegram (se usar daily_notifier ou plugin): `OPENCODE_TELEGRAM_BOT_TOKEN`, `OPENCODE_TELEGRAM_CHAT_ID`.
- **Rede:** porta do serve (ex. 4096) acessível; se atrás de proxy reverso (nginx/Caddy), apontar para o host/porta do processo.

## Passos

### 1. Obter o projeto e instalar dependências

Na VPS:

```bash
git clone <url-do-repo-opencode> opencode && cd opencode
bun install
# ou: npm install
```

### 2. Configurar daemon

Crie ou edite o config (ex.: `opencode.json` na pasta do projeto ou no XDG config dir) com:

```json
{
  "server": {
    "daemon": true
  }
}
```

Ou use a flag na linha de comando em vez do config: `opencode serve --daemon`.

### 3a. Opção A – systemd

Crie um unit file, ex. `/etc/systemd/system/opencode-server.service`:

```ini
[Unit]
Description=OpenCode Server (daemon)
After=network.target

[Service]
Type=simple
User=opencode
WorkingDirectory=/opt/opencode
EnvironmentFile=/opt/opencode/.env
ExecStart=/usr/local/bin/bun run opencode serve --daemon
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Ajuste `User`, `WorkingDirectory`, `EnvironmentFile` e o caminho do `bun` conforme o ambiente. Em seguida:

```bash
sudo systemctl daemon-reload
sudo systemctl enable opencode-server
sudo systemctl start opencode-server
sudo systemctl status opencode-server
```

### 3b. Opção B – Docker

Exemplo mínimo de Dockerfile na raiz do projeto (multi-stage para build + run):

```dockerfile
FROM oven/bun:1 AS base
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1-slim
WORKDIR /app
COPY --from=base /app/packages/opencode/dist ./packages/opencode/dist
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./
COPY --from=base /app/packages ./packages
ENV NODE_ENV=production
EXPOSE 4096
CMD ["bun", "run", "opencode", "serve", "--daemon"]
```

Build e execução:

```bash
docker build -t opencode-server .
docker run -d --name opencode-server \
  -p 4096:4096 \
  -e OPENCODE_SERVER_PASSWORD=your-secret \
  -v opencode-data:/home/bun/.local/share/opencode \
  opencode-server
```

Ajuste variáveis de ambiente (`-e` ou `--env-file`) e volume conforme [features/env-vars.md](../features/env-vars.md). Se usar Redis/Postgres na mesma VPS, pode usar o `docker-compose.vps.yml` do repositório como referência para rede e serviços auxiliares.

## Health check

- **Status do Server:** `GET /server/status` (ex.: `curl -u user:password http://localhost:4096/server/status`).
- **Raiz da API:** se o serve expõe um health na raiz, usá-lo no monitoramento.
- Em systemd: `systemctl status opencode-server`. Em Docker: `docker ps` e opcionalmente um healthcheck no Dockerfile/compose.

## Rollback

- **systemd:** `sudo systemctl stop opencode-server`; corrigir config ou binário; `sudo systemctl start opencode-server`. Se precisar voltar a uma versão anterior do código, fazer deploy da versão anterior e reiniciar o serviço.
- **Docker:** `docker stop opencode-server`; atualizar imagem ou variáveis e `docker run` de novo, ou usar uma imagem anterior com a mesma tag/versão.

## Referências

- [api/opencode-server.md](../api/opencode-server.md) — ativação, endpoints `/server`, config.
- [planning/roadmap-vps-opencode-server.md](../planning/roadmap-vps-opencode-server.md) — fases VPS, Web/Mobile, rotinas autônomas.
- [features/env-vars.md](../features/env-vars.md) — variáveis de ambiente (Server, Telegram, LLM, etc.).
