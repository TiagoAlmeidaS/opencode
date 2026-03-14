# Feature: pipeline de memória (autoaprendizado)

Pipeline do OpenCode Server que extrai memória das conversas e gera MEMORY.md, memory_summary.md e skills para o agente ficar mais inteligente a cada uso.

## Objetivo

- Persistir aprendizados a partir das sessões já armazenadas no OpenCode.
- Produzir artefatos consolidados (MEMORY.md, memory_summary.md) e skills reutilizáveis em `.opencode/skills/` (ou path configurável).
- Permitir agendamento via cron para rodar sem intervenção.

## Config / env

- **Server daemon:** Habilitar com `opencode serve --daemon` ou `server.daemon: true`.
- **opencode.db:** Deve estar no mesmo data dir (server usa `opencodeDbPath`, por padrão `{dataDir}/opencode.db`).
- **memoryLlm (opcional):** Se o host injetar `memoryLlm` em `createOpenCodeServer`, a extração e a consolidação usarão LLM para melhor qualidade; caso contrário, usam fallback (transcript bruto / merge simples).

## Estratégias de pipeline

| Estratégia              | Descrição |
|-------------------------|-----------|
| `memory_extract`        | Fase 1: lê sessões do opencode.db, extrai raw_memory e session_summary (com ou sem LLM), persiste em `memory_extractions`. |
| `memory_consolidation`  | Fase 2: lê `memory_extractions`, gera MEMORY.md, memory_summary.md e skills em disco. |

Config dos pipelines: ver [Runbook: memory pipeline](../runbooks/runbook-memory-pipeline.md).

## Uso

1. Criar pipelines via `POST /server/pipelines` (strategy `memory_extract` e `memory_consolidation`) com `config_json` e `schedule_cron`.
2. O scheduler roda os pipelines conforme o cron; não é necessário comando manual.
3. Para carregar os skills no OpenCode, usar `memory_output_dir`/`skills_output_dir` em `.opencode/skills` ou em `skills.paths`.

## Referências

- [Arquitetura: memory pipeline](../architecture/memory-pipeline.md)
- [Runbook: memory pipeline](../runbooks/runbook-memory-pipeline.md)
- [API OpenCode Server](../api/opencode-server.md)
