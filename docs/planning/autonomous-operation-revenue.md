# Visão: operação autônoma e geração de renda (OpenCode)

Visão de como o OpenCode Server pode evoluir para um agente que opera de forma autônoma e gera renda, usando memória, pipelines e goals já existentes.

## Ciclo observe → decide → act → learn

1. **Observe:** Coleta de dados reais (métricas, conteúdo publicado, receita) via pipelines como `metrics_collector` e tabelas `daemon_content`, `daemon_revenue`, `daemon_goals`.
2. **Orient / Decide:** Análise com base em metas (goals) e geração de propostas pelo `strategy_analyzer`; propostas armazenadas em `daemon_proposals`.
3. **Act:** Execução de propostas aprovadas pelo proposal executor; publicação de conteúdo (ex.: `seo_blog`), alterações de configuração, etc.
4. **Learn:** Pipeline de memória (`memory_extract`, `memory_consolidation`) extrai aprendizado das conversas; opcionalmente resultados dos pipelines (jobs, content, proposals) podem alimentar o ciclo de memória ou uma camada de “learning” para melhorar decisões futuras.

## Papel da memória e do RAG

- **Memória persistida:** MEMORY.md, memory_summary.md e skills gerados a partir das conversas permitem que o agente reutilize procedimentos e preferências sem reensino.
- **RAG (Qdrant):** Indexação de memória e skills possibilita retrieval por similaridade; o endpoint `GET /server/memory/retrieve` pode ser usado para enriquecer o contexto das sessões e dos pipelines que usam LLM.
- **Evolução:** A cada conversa e a cada execução de pipeline, o sistema pode incorporar novos dados ao ciclo (extração → consolidação → indexação RAG).

## Caminho para geração de renda

- O server já possui `daemon_revenue`, `daemon_goals`, `daemon_proposals` e pipelines (seo_blog, strategy_analyzer, metrics_collector).
- Para “ganhar dinheiro sozinho”: configurar goals de receita, conectar métricas reais (APIs de ads, analytics), e deixar o strategy_analyzer propor ações que o executor executa (com aprovação humana inicial; depois relaxar conforme confiança).
- A memória e o RAG ajudam a tomar decisões melhores ao longo do tempo (ex.: quais tipos de conteúdo performam melhor, quais procedimentos evitar).

## Referências

- [Memory pipeline](../features/memory-pipeline.md) e [Memory RAG](../features/memory-rag.md)
- [Visão VPS e integração](../architecture/visao-opencode-server-vps-integracao.md)
- [API OpenCode Server](../api/opencode-server.md)
- [Runbook: memory pipeline](../runbooks/runbook-memory-pipeline.md)
