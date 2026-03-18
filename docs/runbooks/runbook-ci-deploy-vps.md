# Runbook: CI Deploy VPS

Workflow GitHub Actions que faz deploy do OpenCode Server na VPS ao fazer push na branch `homolog`.

## Fluxo

1. Push em `homolog` (ou `workflow_dispatch` manual)
2. Runner SSH na VPS
3. `git pull origin homolog`
4. `docker compose -f docker-compose.scheduler.yml build opencode-server`
5. `docker compose -f docker-compose.scheduler.yml up -d opencode-server`

## Configuração

### 1. Secrets no repositório

Em **Settings → Secrets and variables → Actions**, crie:

| Secret | Descrição |
|--------|-----------|
| `VPS_HOST` | IP ou hostname da VPS (ex.: `100.98.213.86` ou `opencode.seudominio.com`) |
| `VPS_USER` | Usuário SSH (ex.: `deploy` ou `root`) |
| `VPS_SSH_KEY` | Chave privada SSH (conteúdo de `~/.ssh/id_rsa` ou chave dedicada) |
| `VPS_DEPLOY_PATH` | Caminho do repositório na VPS (ex.: `/opt/opencode`) |

### 2. VPS — pré-requisitos

- Repositório clonado em `VPS_DEPLOY_PATH` (ex.: `/opt/opencode`)
- Docker e Docker Compose instalados
- `.env.server` configurado (não versionado)
- Rede `jarvis-network` existente (ou remova do compose se não usar):

  ```bash
  docker network create jarvis-network
  ```

### 3. Chave SSH

- A chave pública deve estar em `~/.ssh/authorized_keys` do usuário
- Ou use uma chave de deploy dedicada (sem passphrase para automação)

## Execução manual

Em **Actions → Deploy VPS → Run workflow** → Run.

## Rollback

Se o deploy quebrar, na VPS:

```bash
cd $VPS_DEPLOY_PATH
git checkout HEAD~1
docker compose -f docker-compose.scheduler.yml up -d opencode-server
```

Ou reverta o commit e faça push — o CI fará deploy da versão anterior.

## Referências

- [runbook-deploy-opencode-server-vps.md](runbook-deploy-opencode-server-vps.md) — deploy manual
- [docker-compose.scheduler.yml](../../docker-compose.scheduler.yml)
