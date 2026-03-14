# Memory pipeline — arquitetura

Visão do pipeline de memória do OpenCode Server: conversas persistidas → extração → consolidação → MEMORY.md, memory_summary.md e skills.

## Objetivo

Usar as sessões e mensagens já armazenadas no `opencode.db` para produzir memória consolidada e skills reutilizáveis, de forma que o agente fique mais inteligente a cada interação sem depender de ensino manual.

## Componentes

- **Entrada:** Tabelas `session`, `message`, `part` do OpenCode (SQLite em `opencode.db`).
- **Fase 1 (memory_extract):** Lê sessões elegíveis (raiz, não arquivadas, atualizadas desde N dias), monta o transcript por sessão, opcionalmente chama LLM para extrair `raw_memory` e `session_summary`, persiste em `memory_extractions` (SQLite do server).
- **Fase 2 (memory_consolidation):** Lê as extrações, opcionalmente chama LLM para consolidar, escreve `MEMORY.md`, `memory_summary.md` e opcionalmente skills em disco (ex.: `memory_output_dir/skills/<name>/SKILL.md`).
- **Saída:** Artefatos em disco; o OpenCode carrega skills de `.opencode/skills/` ou de paths configurados em `skills.paths`.

## Onde roda

- **Server package (`@opencode-ai/server`):** Pipelines `memory_extract` e `memory_consolidation`, tabela `memory_extractions`, leitor de sessões (`memory/session-reader.ts`).
- **Acesso ao opencode.db:** O server recebe `opencodeDbPath` (em `OpenCodeServerOpts`); por padrão é `path.join(path.dirname(dbPath), "opencode.db")`. Com `opencode serve --daemon`, o opencode passa explicitamente `opencodeDbPath` usando `Global.Path.data`.

## Elegibilidade de sessões

- Sessões raiz (`parent_id IS NULL`).
- Não arquivadas (`time_archived IS NULL` ou 0).
- Atualizadas após um timestamp configurável (`since_days` no config do pipeline).
- Excluídas as que já têm registro em `memory_extractions`.

## LLM opcional

- **memoryLlm:** Callback opcional em `OpenCodeServerOpts`. Se presente, é passado ao contexto dos pipelines e usado na extração (Fase 1) e na consolidação (Fase 2). Se ausente, a extração grava transcript bruto e a consolidação faz merge simples sem LLM.
- Para uso completo (extração e consolidação com LLM), o host (ex.: opencode) pode injetar uma função que chame o provedor configurado (ex.: `generateText` do AI SDK).

## Referências

- [Runbook: memory pipeline](../runbooks/runbook-memory-pipeline.md)
- [API OpenCode Server](../api/opencode-server.md)
- [Visão VPS e rotinas autônomas](visao-opencode-server-vps-integracao.md)
