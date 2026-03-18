# Fontes de Oportunidades de Conteúdo

Funcionalidade que expande a busca de oportunidades para além de codificação, incluindo criação de texto, roteiro, copywriting e conteúdo. O agente pode descobrir, pontuar e executar oportunidades de escrita (blog, copy, script, social media).

## Objetivo

Permitir que o OpenCode Server colete e processe oportunidades de **conteúdo** (texto, roteiro, copy) em paralelo às de codificação, ampliando as fontes de receita do agente autônomo.

## Fontes Implementadas

| Fonte | Activity | Plataforma | Tipo |
|-------|----------|------------|------|
| ProBlogger | `scan-content-jobs` | RSS (FeedBlitz) | content |
| WeWorkRemotely (copywriting) | `scan-content-jobs` | RSS | content |
| WeWorkRemotely (content-creation) | `scan-content-jobs` | RSS | content |
| RemoteOK (writing, copywriting) | `scan-freelance-jobs` | API JSON | content |
| WeWorkRemotely (copywriting) | `scan-freelance-jobs` | RSS | content |

## Config / Env

### Pipeline opportunity-collector

O Coletor inclui a fonte `content-jobs` por padrão:

```json
{
  "sources": ["github-bounties", "freelance-jobs", "content-jobs"],
  "limit_per_source": 30
}
```

### scan-content-jobs (input)

```json
{
  "platforms": ["problogger", "weworkremotely"],
  "limit": 30
}
```

### scan-freelance-jobs (input para conteúdo)

Para incluir vagas de conteúdo no scan-freelance-jobs:

- **RemoteOK:** `tags: ["writing", "copywriting", "content", "blog", "technical writing"]`
- **WeWorkRemotely:** `categories: ["remote-programming-jobs", "remote-copywriting-jobs"]`

Quando `tags` inclui termos de conteúdo ou `categories` inclui `remote-copywriting-jobs` / `remote-content-creation-jobs`, as vagas são inseridas com `type: "content"`.

## Nichos de Conteúdo

Inseridos pelo `seed-niches`:

| name | displayName | keywords |
|------|-------------|----------|
| content-copywriting | Copywriting | copywriting, ad copy, landing page, sales copy, email marketing |
| content-scriptwriting | Roteiro e Script | script, screenplay, roteiro, video script, podcast script |
| content-blog | Blog e Artigos | blog post, article, long-form, editorial |
| content-social | Conteúdo Social | social media, captions, posts, instagram, linkedin |
| ai-content | AI Content & Education | tutorial, blog post, course, newsletter, technical writing |

## Fluxo de Processamento

1. **Coleta** — `scan-content-jobs` ou `scan-freelance-jobs` (modo conteúdo) insere em `opp_opportunities` com `type: "content"`.
2. **Score** — `score-opportunity` usa prompt específico para conteúdo (especificação clara, formato definido, entrega digital).
3. **Classificação** — `classify-niche` associa a nichos como `content-copywriting`, `content-blog`, etc.
4. **Execução** — `execute-opportunity` usa `buildTask` alternativo para conteúdo (escrever texto, roteiro, copy em vez de código).
5. **Submissão** — `send-freelance-email` funciona para qualquer oportunidade; o humano revisa e envia.

## Uso

- Oportunidades de conteúdo aparecem no Dashboard e nos relatórios Telegram junto com as de codificação.
- Para executar: `POST /api/opportunities/:id/execute` — o agente gera o texto conforme o brief.
- Para enviar proposta: `POST /api/opportunities/:id/send-freelance-email` (quando houver email na descrição).

## Referências

- [runbook-troubleshoot-schedules-reports.md](../runbooks/runbook-troubleshoot-schedules-reports.md) — fontes de conteúdo, troubleshooting
- [autonomous-opportunities-board.md](../planning/autonomous-opportunities-board.md) — visão geral do sistema de oportunidades
