# Flutter: design system KINETIC

## Objetivo

Documentar a **fonte de verdade** do app Flutter em modo escuro: paleta cyber (ciano neon, vidro, mono) alinhada ao protótipo HTML KINETIC, em paralelo ao design **OC-2** usado no dashboard web (`packages/ui`) e no tema **claro** do app.

## Onde está no código

| Peça | Caminho |
|------|---------|
| Tokens (cores, raios, blur) | [`packages/flutter_app/lib/theme/kinetic_tokens.dart`](../../packages/flutter_app/lib/theme/kinetic_tokens.dart) |
| `ThemeData` + `ThemeExtension` (glass / nav) | [`packages/flutter_app/lib/theme/kinetic_theme.dart`](../../packages/flutter_app/lib/theme/kinetic_theme.dart) |
| `Tema claro OC-2` + `dark` = KINETIC | [`packages/flutter_app/lib/theme/opencode_theme.dart`](../../packages/flutter_app/lib/theme/opencode_theme.dart) |
| `KineticGlassPanel`, `KineticPrimaryButton`, `KineticLogRow`, `KineticBottomBarChrome` | [`packages/flutter_app/lib/widgets/`](../../packages/flutter_app/lib/widgets/) |
| Oportunidades (Bounties) — terminal header, `AI_OPPORTUNITIES_CORE`, chips sólidos, cards glass + `HEALTH_INTEGRITY` | [`packages/flutter_app/lib/screens/opportunities_screen.dart`](../../packages/flutter_app/lib/screens/opportunities_screen.dart) |
| `Brain` → Learnings — modo **mapa 3D** (tela cheia sem AppBar; constelação leve; HUD com estado real **API_OFFLINE** / **NO_DAEMON** / **API_OK**; dados em `GET /learnings`) | [`packages/flutter_app/lib/widgets/learnings_constellation_view.dart`](../../packages/flutter_app/lib/widgets/learnings_constellation_view.dart) |

## Relação com OC-2 e web

- **Light theme** (`OpenCodeTheme.light`): continua **OC-2** (Inter, paleta `Oc2Colors.light`), como em [`docs/architecture/flutter-design-parity.md`](flutter-design-parity.md).
- **Dark theme** (`OpenCodeTheme.dark`): **KINETIC** — Space Grotesk (títulos), Inter (corpo), JetBrains Mono (logs), cores do protótipo HTML.

O dashboard web **não** é alterado por este design system; o app mobile pode divergir visualmente no dark mode de propósito.

## API Server (dashboard / protótipo)

O painel home consome dados enriquecidos em `GET /status` e `GET /logs`:

- `server.started_at` — tempo de processo (Unix s) para SLA / uptime.
- `metrics.jobs_completed_last_12h` — 12 inteiros (histograma por hora, slot `11` = última hora) para o gráfico de barras.
- `metrics.load_index` — 0–1 derivado de jobs em execução e volume completado nas últimas 12h.
- `metrics.jobs_last_hour` — jobs completados na última hora (valor do bucket mais recente).
- `metrics.jobs_per_hour_avg_12h` — média de jobs completados por hora nas últimas 12h; o hero KINETIC usa isto no rótulo **LOAD** (`X.X jobs/h`).
- `metrics.chart_highlight_slot` — índice da barra “atual” (normalmente `11`); o app destaca essa barra em ciano.
- `POST /pipelines/run-all-enabled` — “RE-SYNC ALL NODES” (dispara pipelines habilitados).
- `GET /logs` aceita `pipeline_id` ou `pipeline`, e `level` opcional.

Detalhes de implementação: [`packages/server/src/routes.ts`](../../packages/server/src/routes.ts).

## Modelo Flutter `ServerStatus`

[`packages/flutter_app/lib/api/models.dart`](../../packages/flutter_app/lib/api/models.dart) — `ServerStatus` inclui campos opcionais para `revenue`, `goals`, `content`, `server`, `metrics` conforme o JSON do servidor.
