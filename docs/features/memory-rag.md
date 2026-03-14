# Feature: RAG para memória (Qdrant)

Uso de Qdrant e embeddings para retrieval de memória e skills no OpenCode Server, com endpoint de consulta e pipeline de indexação.

## Objetivo

- Indexar MEMORY.md, memory_summary.md e skills em um vector store (Qdrant).
- Oferecer um endpoint de retrieval para enriquecer o contexto das sessões (ex.: chamado antes do LLM com a pergunta ou título da sessão).
- Pipeline opcional `memory_rag_index` que roda após a consolidação e popula o Qdrant.

## Config / env

- **OPENCODE_QDRANT_URL:** URL do Qdrant (ex.: `http://localhost:6333`). Se não definido, RAG fica desativado.
- **memoryEmbed:** Função de embedding injetada em `createOpenCodeServer({ memoryEmbed })`. Deve receber texto e retornar `Promise<number[]>` (vetor). O host (ex.: opencode) pode implementar usando o provedor configurado ou um modelo de embedding dedicado.
- **qdrantUrl:** Passado em `createOpenCodeServer({ qdrantUrl })`; pode ser lido de `process.env.OPENCODE_QDRANT_URL`.

Quando `qdrantUrl` e `memoryEmbed` estão configurados, o server registra `GET /server/memory/retrieve` e o pipeline `memory_rag_index` pode ser usado.

## Pipeline memory_rag_index

- **Estratégia:** `memory_rag_index`
- **Config:** `memory_output_dir` (obrigatório), `max_chunk_len` (opcional, default 800).
- Lê MEMORY.md, memory_summary.md e skills/*/SKILL.md do diretório, fragmenta em chunks, gera embeddings (via config global) e faz upsert na collection `opencode_memory` do Qdrant.
- Agende após `memory_consolidation` (ex.: cron 1x/dia após a consolidação).

## Endpoint GET /server/memory/retrieve

- **Query:** `q` (texto da busca), `limit` (opcional, default 5, max 20).
- **Resposta:** `{ chunks: { text, source, score }[] }`.
- Uso típico: o cliente (TUI, app) chama com a pergunta do usuário ou o título da sessão e injeta os trechos retornados no system prompt ou no contexto da conversa.

## Referências

- [Memory pipeline](memory-pipeline.md)
- [Arquitetura: memory pipeline](../architecture/memory-pipeline.md)
- [API OpenCode Server](../api/opencode-server.md)
