# Niche Explorer (novos nichos / fontes de exploração)

## Objetivo

Expandir o leque de **nichos** em `opp_niches` além do seed estático: o pipeline **`niche-explorer`** enfileira a activity **`discover-niches`**, que usa LLM para propor nichos **novos** (não duplicados), grava na base e pode enfileirar **`analyze-niche-relations`** por cada nicho criado (mapa de valor + proposals).

## Pré-requisitos

- Daemon com **`memoryLlm`** injetado (mesmo requisito que score-opportunity / analyze-niche-relations).

## Pipeline `niche-explorer`

`config_json` opcional:

| Campo | Default | Descrição |
|-------|---------|-----------|
| `max_new` | 5 | Quantidade alvo de sugestões (máx. 12 no activity). |
| `focus_hint` | `""` | Texto livre para orientar o LLM (ex.: *grants EU, API products, no crypto*). |
| `enqueue_relations` | `true` | Se `true`, após cada insert enfileira `analyze-niche-relations` para aquele `name`. |

**Cron sugerido:** semanal, ex. `0 4 * * 0`, ou execução manual no dashboard.

## Activity `discover-niches`

Pode ser enfileirada sozinha (Activity Queue) com input JSON:

```json
{ "max_new": 5, "focus_hint": "observability SaaS", "enqueue_relations": true }
```

- Lê nichos existentes + últimos **agent learnings** como contexto.
- Dedup por **`name`** (kebab-case); conflitos de UNIQUE ignorados.
- Relações: dedup na fila via `relatedOpportunityId: niche-discover:{name}`.

## Relação com outras peças

- **Coleta de oportunidades** continua sendo **opportunity-collector** + scanners; novos nichos melhoram **classify-niche** quando houver match semântico.
- **Novas fontes de renda** (novos marketplaces) ainda exigem **nova activity `scan-*`** ou pipeline dedicado — este entrega sobretudo **ontologia de nichos**.
