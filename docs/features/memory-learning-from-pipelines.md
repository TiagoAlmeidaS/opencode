# Feature: aprendizado a partir dos pipelines (memoria)

Como os resultados dos pipelines do OpenCode Server alimentam o ciclo de memoria e melhoram o agente ao longo do tempo.

## Objetivo

- Usar outcomes dos pipelines (jobs concluidos, content publicado, proposals aprovados/executados) como entrada adicional ao ciclo de memoria.
- Permitir que a consolidacao e o RAG incorporem nao so conversas, mas tambem padroes de sucesso/falha das execucoes em background.

## Implementacao: Dev Cycle Learning

O primeiro caminho implementado foi o **Pipeline de learning** (opcao 2 do doc original), especificamente para o dev cycle:

- Pipeline `dev_cycle_learning` (cron diario): le `repo_issue_jobs` completed/failed, extrai padroes via LLM, e upsert em `agent_learnings` com categorias `dev-cycle`, `repo`, `pattern`.
- Activity `pr-outcome-check`: consulta GitHub API para capturar merge/rejection de PRs, alimentando review comments no learning.
- Session tracking: `spawnOpenCode` agora retorna `session_id`, vinculando a sessao CLI ao job para leitura do transcript completo.

Ver detalhes em [dev-cycle-learning.md](dev-cycle-learning.md).

## Caminhos futuros

1. **Opportunity outcomes**: Estender o learning para alem do dev cycle -- submissoes aceitas/rejeitadas (ja parcialmente coberto por `extract-learnings` activity).
2. **Content delivery outcomes**: Aprender padroes de sucesso de conteudo publicado (views, engagement).
3. **Strategy analyzer feedback**: Integrar outcomes do `strategy_analyzer` e `executor` ao pipeline de memoria.

## Referencias

- [Dev Cycle Learning](dev-cycle-learning.md)
- [Memory pipeline](memory-pipeline.md)
- [Visao: operacao autonoma e renda](../planning/autonomous-operation-revenue.md)
- [Arquitetura: memory pipeline](../architecture/memory-pipeline.md)
