# Feature: aprendizado a partir dos pipelines (memória)

Como os resultados dos pipelines do OpenCode Server podem alimentar o ciclo de memória e melhorar o agente ao longo do tempo.

## Objetivo

- Usar outcomes dos pipelines (jobs concluídos, content publicado, proposals aprovados/executados) como entrada adicional ao ciclo de memória.
- Permitir que a consolidação e o RAG incorporem não só conversas, mas também padrões de sucesso/falha das execuções em background.

## Estado atual

- O pipeline de memória hoje consome apenas **sessões e mensagens** do `opencode.db` (via `memory_extract`).
- Os resultados dos pipelines ficam em `daemon_jobs`, `daemon_content`, `daemon_proposals`; não são ainda automaticamente transformados em “raw memory” ou em entradas para a Fase 2.

## Caminhos de implementação

1. **Tabela de outcomes:** Criar uma tabela (ex.: `pipeline_outcomes`) onde um job ou um pipeline pós-execução grava um resumo (job id, strategy, status, output resumido). O `memory_extract` ou um pipeline dedicado lê essa tabela e produz “sessões sintéticas” ou blocos de texto que a Fase 2 consolida junto com as extrações de conversas.
2. **Pipeline de learning:** Um pipeline agendado (ex.: `memory_learning`) que lê os últimos N jobs/content/proposals, gera um texto resumido (ex.: “job X concluiu com sucesso; conteúdo Y publicado”) e insere em `memory_extractions` ou em uma tabela intermediária que a consolidação considera.
3. **Integração no strategy_analyzer:** Quando o strategy_analyzer (ou executor) produz resultado, chamar um webhook ou escrever em uma fila/tabela que o pipeline de memória processa.

A decisão de qual caminho adotar e a implementação ficam para uma fase posterior; este doc registra a intenção e as opções.

## Referências

- [Memory pipeline](memory-pipeline.md)
- [Visão: operação autônoma e renda](../planning/autonomous-operation-revenue.md)
- [Arquitetura: memory pipeline](../architecture/memory-pipeline.md)
