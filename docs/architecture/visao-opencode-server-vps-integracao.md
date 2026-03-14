# Visão: OpenCode Server na VPS e integração Web/Mobile

Arquitetura de referência para rodar o OpenCode Server em uma VPS e integrar clientes Web e Mobile, com evolução futura para rotinas autônomas de aprendizado.

## Diagrama

```mermaid
flowchart LR
  subgraph clientes [Clientes]
    Web[Web]
    Mobile[Mobile]
  end

  subgraph vps [VPS]
    Server[OpenCode Server]
    Scheduler[Scheduler / Pipelines]
    Server --- Scheduler
  end

  subgraph infra [Infra opcional]
    Redis[Redis]
    Postgres[Postgres]
    Qdrant[Qdrant]
  end

  Web -->|"Base URL + Auth"| Server
  Mobile -->|"Base URL + Auth"| Server
  Scheduler -.->|"se necessário"| Redis
  Scheduler -.->|"se necessário"| Postgres
  Scheduler -.->|"se necessário"| Qdrant

  subgraph futuro [Futuro]
    Rotinas[Rotinas autônomas de aprendizado]
  end
  Scheduler --> Rotinas
```

- **VPS:** uma instância de `opencode serve --daemon` (OpenCode Server) com scheduler e pipelines; opcionalmente Redis, Postgres ou Qdrant na mesma rede (ex.: via docker-compose) se pipelines ou integrações precisarem.
- **Clientes:** aplicações Web e Mobile usam a mesma base URL do serve e a mesma autenticação (ex.: Basic Auth com `OPENCODE_SERVER_PASSWORD`), consumindo `/server` (status, pipelines, jobs, goals, proposals) e demais endpoints.
- **Futuro – Rotinas autônomas:** evoluem a partir dos pipelines e goals já documentados; a visão de autonomia (observe → orient → decide → act → learn) está no roadmap de autonomia do repositório Jarvis.

## Resumo

- **Web/Mobile** são clientes da API OpenCode; não há componente extra além do serve já documentado em [api/opencode-server.md](../api/opencode-server.md).
- **Rotinas autônomas de aprendizado** utilizam o scheduler e os pipelines do OpenCode Server; o roadmap de fases está em [planning/roadmap-vps-opencode-server.md](../planning/roadmap-vps-opencode-server.md) e a visão de autonomia do Jarvis em documentação do repositório Jarvis (autonomy-roadmap, autonomy-growth-self-learning).

## Referências

- [api/opencode-server.md](../api/opencode-server.md)
- [planning/roadmap-vps-opencode-server.md](../planning/roadmap-vps-opencode-server.md)
- [runbooks/runbook-deploy-opencode-server-vps.md](../runbooks/runbook-deploy-opencode-server-vps.md)
