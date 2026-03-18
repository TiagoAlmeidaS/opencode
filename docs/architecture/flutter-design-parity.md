# Arquitetura: Paridade de design Flutter com OpenCode Dashboard

Decisões de arquitetura e mapeamento de tokens CSS para Flutter, para manter consistência visual entre o App web (SolidJS) e o App Flutter.

## Objetivo

Permitir que o app Flutter siga o mesmo design system do dashboard OpenCode (`packages/app` + `packages/ui`), garantindo reconhecimento visual e experiência familiar.

## Fonte de verdade

- **Tokens visuais:** `packages/ui/src/styles/theme.css`
- **Tema OC-2:** `packages/ui/src/theme/themes/oc-2.json`
- **Cores Tailwind:** `packages/ui/src/styles/tailwind/colors.css`

## Mapeamento CSS → Flutter

### Tipografia

| CSS variable | Valor | Flutter equivalente |
|--------------|-------|----------------------|
| `--font-family-sans` | Inter | `GoogleFonts.inter()` ou `fontFamily: 'Inter'` |
| `--font-family-mono` | IBM Plex Mono | `GoogleFonts.ibmPlexMono()` |
| `--font-size-small` | 13px | `13.0` ou `Theme.of(context).textTheme.bodySmall` |
| `--font-size-base` | 14px | `14.0` |
| `--font-size-large` | 16px | `16.0` |
| `--font-size-x-large` | 20px | `20.0` |
| `--font-weight-regular` | 400 | `FontWeight.w400` |
| `--font-weight-medium` | 500 | `FontWeight.w500` |
| `--line-height-normal` | 130% | `1.3` |
| `--line-height-large` | 150% | `1.5` |

### Espaçamento e raios

| CSS variable | Valor | Flutter |
|--------------|-------|---------|
| `--spacing` | 0.25rem (4px) | `4.0` |
| `--radius-xs` | 0.125rem (2px) | `2.0` |
| `--radius-sm` | 0.25rem (4px) | `4.0` |
| `--radius-md` | 0.375rem (6px) | `6.0` |
| `--radius-lg` | 0.5rem (8px) | `8.0` |
| `--radius-xl` | 0.625rem (10px) | `10.0` |

### Breakpoints

| CSS variable | Valor | Flutter (LayoutBuilder / MediaQuery) |
|--------------|-------|-------------------------------------|
| `--breakpoint-sm` | 40rem (640px) | `640.0` |
| `--breakpoint-md` | 48rem (768px) | `768.0` |
| `--breakpoint-lg` | 64rem (1024px) | `1024.0` |
| `--breakpoint-xl` | 80rem (1280px) | `1280.0` |
| `--breakpoint-2xl` | 96rem (1536px) | `1536.0` |

### Cores semânticas (OC-2 light)

| Token | Hex | Uso Flutter |
|-------|-----|-------------|
| `--background-base` | #f8f8f8 | `ColorScheme.surface` / scaffold |
| `--background-weak` | #f3f3f3 | Superfícies secundárias |
| `--background-strong` | #fcfcfc | Cards, modais |
| `--text-strong` | #171717 | Títulos, texto principal |
| `--text-base` | #6f6f6f | Corpo de texto |
| `--text-weak` | #8f8f8f | Texto secundário |
| `--text-interactive-base` | #034cff | Links, ações |
| `--border-weak-base` | #e5e5e5 | Bordas |
| `--icon-base` | #8f8f8f | Ícones |
| `--surface-brand-base` | #dcde8d | Destaque brand |
| `--surface-interactive-base` | #ecf3ff | Botão primário hover |
| `--surface-critical-base` | #fff2f0 | Erros |
| `--surface-success-base` | #dbfed7 | Sucesso |

### Cores semânticas (OC-2 dark)

| Token | Valor | Uso Flutter |
|-------|-------|-------------|
| `--background-base` | #101010 | `ColorScheme.surface` |
| `--background-weak` | #1e1e1e | Superfícies secundárias |
| `--text-strong` | rgba(255,255,255,0.936) | Títulos |
| `--text-base` | rgba(255,255,255,0.618) | Corpo |
| `--text-weak` | rgba(255,255,255,0.422) | Secundário |
| `--surface-brand-base` | #fab283 | Destaque brand |
| `--surface-interactive-base` | #091f52 | Botão primário |

## Decisões

1. **Opção A (manual):** Tokens portados manualmente para Dart em `packages/flutter_app/lib/theme/`. Ficheiros `oc2_colors.dart`, `oc2_theme.dart` alinhados com `theme.css` e `oc-2.json`.
2. **Fontes:** Usar `google_fonts` (Inter, IBM Plex Mono) no `pubspec.yaml`.
3. **Componentes:** Encapsular em `OpenCodeTheme`, `OpenCodeButton`, `OpenCodeIconButton` antes das telas completas.
4. **Layout:** Sidebar rail 64px, painel lateral min 244px, main flexível; mobile = drawer.

## Referências

- [Feature: Flutter App](../features/flutter-app.md)
- [packages/ui theme.css](../../packages/ui/src/styles/theme.css)
- [packages/ui themes oc-2.json](../../packages/ui/src/theme/themes/oc-2.json)
