# Server dashboard UI (design alignment)

## Objetivo

O dashboard estático em `packages/server/public/dashboard.html` (servido em `/` e `/dashboard` no standalone) usa **tokens de cor e layout alinhados ao tema smoke-dark** do pacote UI do OpenCode, **sidebar** com grupos colapsáveis (Operate / Market / Content / Brain), barra de status do daemon, **toasts** para ações (queue, pipelines, proposals, submissions, discovery, learnings), e **ordenção por coluna** em Opportunities (Title, Score) e Pipelines (Nome).

## Stack

- HTML + CSS + JS vanilla (sem build; compatível com “standalone”).
- Tipografia: stack **system UI** (sem CDN obrigatório).

## Navegação

| Sidebar        | Conteúdo                          |
|----------------|-----------------------------------|
| Operate        | Queue, Pipelines, Reports, Proposals |
| Market         | Opportunities, Niches, Market data  |
| Content        | Submissions, Discovery, Specs       |
| Brain          | Learnings                         |

## Responsivo

Em viewports estreitas (&lt; 900px), a sidebar vira **drawer** (menu ☰ + backdrop).

## Referências

- Tema: `packages/ui/src/styles/colors.css` (escala smoke-dark).
- App principal: `packages/app` (Solid + Tailwind) — dashboard replica *visualmente* o tom, não compartilha bundle.
