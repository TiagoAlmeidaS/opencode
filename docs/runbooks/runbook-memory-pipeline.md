# Runbook: pipeline de memória (extract + consolidation)

Configurar e agendar o pipeline de memória do OpenCode Server para gerar MEMORY.md, memory_summary.md e skills a partir das conversas.

## Pré-requisitos

- OpenCode Server com daemon habilitado (`opencode serve --daemon` ou `server.daemon: true`).
- `opencode.db` no mesmo diretório de dados que o server (por padrão `{dataDir}/opencode.db`).
- API do Server acessível (ex.: `http://localhost:4096/server`) com autenticação configurada.

## Passos

### 1. Registrar pipeline de extração (Fase 1)

Crie o pipeline `memory_extract` para processar sessões novas e gravar em `memory_extractions`:

```bash
curl -X POST "http://localhost:4096/server/pipelines" \
  -H "Content-Type: application/json" \
  -u ":$OPENCODE_SERVER_PASSWORD" \
  -d '{
    "name": "Memory Extract",
    "strategy": "memory_extract",
    "config_json": {
      "since_days": 7,
      "max_sessions_per_run": 20,
      "min_transcript_length": 100
    },
    "schedule_cron": "0 */6 * * *"
  }'
```

- `since_days`: só sessões atualizadas nos últimos N dias (default 7).
- `max_sessions_per_run`: limite por execução (default 20).
- `schedule_cron`: ex. `0 */6 * * *` = a cada 6 horas.

### 2. Registrar pipeline de consolidação (Fase 2)

Crie o pipeline `memory_consolidation` para ler `memory_extractions` e escrever MEMORY.md, memory_summary.md e skills:

```bash
curl -X POST "http://localhost:4096/server/pipelines" \
  -H "Content-Type: application/json" \
  -u ":$OPENCODE_SERVER_PASSWORD" \
  -d '{
    "name": "Memory Consolidation",
    "strategy": "memory_consolidation",
    "config_json": {
      "memory_output_dir": "/absolute/path/to/memory",
      "skills_output_dir": "/absolute/path/to/.opencode/skills",
      "max_extractions": 100
    },
    "schedule_cron": "0 2 * * *"
  }'
```

- **memory_output_dir:** (obrigatório) diretório onde serão criados `MEMORY.md` e `memory_summary.md`. Use um path absoluto (ex.: `{dataDir}/memory` ou um projeto `.opencode/memory`).
- **skills_output_dir:** (opcional) diretório para skills; default é `memory_output_dir/skills`. Para o OpenCode carregar automaticamente, use `.opencode/skills` do projeto ou adicione este path em `skills.paths` no config.
- **schedule_cron:** ex. `0 2 * * *` = uma vez por dia às 02:00 (após acumular extrações).

### 3. Ordem recomendada

1. Rode primeiro `memory_extract` (várias vezes ou em cron mais frequente) para popular `memory_extractions`.
2. Rode `memory_consolidation` depois (ex.: 1x/dia) para gerar os artefatos.

Se quiser um único horário, use por exemplo extract a cada 6h e consolidation 1x/dia às 2h.

### 4. Carregar skills no OpenCode

- Se `skills_output_dir` for `.opencode/skills` de um projeto, os skills já serão descobertos pelo OpenCode.
- Caso use outro diretório (ex.: `{dataDir}/memory/skills`), adicione em `opencode.json`:

```json
{
  "skills": {
    "paths": ["/path/to/memory/skills"]
  }
}
```

## Rollback

- Desabilitar pipelines: `POST /server/pipelines/:id/disable`.
- Remover registros de extração: deletar linhas da tabela `memory_extractions` no SQLite do server (ou truncar) e reexecutar extract/consolidation se necessário.
- Os arquivos MEMORY.md, memory_summary.md e skills são sobrescritos a cada run; mantenha backup se precisar reverter.

## Referências

- [Arquitetura: memory pipeline](../architecture/memory-pipeline.md)
- [API OpenCode Server](../api/opencode-server.md)
- [Feature: memory pipeline](../features/memory-pipeline.md)
