# Flutter App — Auditoria UX/UI e Layout Responsivo

**Objetivo:** Mapear telas, orientações e problemas de layout para garantir usabilidade em modo vertical (portrait) e horizontal (landscape).

**Referência:** [flutter-app.md](flutter-app.md)

---

## Resumo executivo

| Tela | Portrait | Landscape | Problemas críticos |
|------|----------|-----------|--------------------|
| ConnectionScreen | ⚠️ | ✅ | Coluna pode não caber com teclado |
| MainLayout | ✅ | ✅ | **Corrigido:** drawer em mobile (&lt;600px) |
| SessionScreen | ⚠️ | ✅ | TabBar + toolbar podem comprimir |
| FilesScreen | ✅ | ✅ | **Corrigido:** layout vertical em mobile (&lt;600px) |
| ServerDashboardScreen | ⚠️ | ✅ | Cards com Row podem overflow |
| TerminalScreen | ✅ | ✅ | Layout simples |
| DialogAddProject | ⚠️ | ✅ | Largura fixa 400px em mobile |

---

## 1. ConnectionScreen

**Arquivo:** `lib/screens/connection_screen.dart`

**Estrutura atual:**
- `Scaffold` → `SafeArea` → `Center` → `ConstrainedBox(maxWidth: 400)` → `Column`
- Campos: URL, Password, botão Connect, lista de servidores salvos

**Problemas:**
- `Column` não é scrollável — com teclado aberto ou em landscape com altura reduzida, conteúdo pode ser cortado
- `maxWidth: 400` ok em landscape; em portrait mobile (~360px) funciona
- Lista de servidores pode crescer e sair da tela

**Ajustes sugeridos:**
- Envolver `Column` em `SingleChildScrollView`
- Em landscape, considerar layout em 2 colunas (formulário à esquerda, servidores à direita)

---

## 2. MainLayout

**Arquivo:** `lib/screens/main_layout.dart`

**Estrutura atual:**
- `Scaffold` → `Row`
  - Rail: **64px** fixo (ícones de projetos + add + dashboard + settings)
  - Panel: **280px** fixo (botão New session + lista de sessões)
  - Main: `Expanded` (SessionScreen ou ServerDashboardScreen)

**Problemas:**
- Largura mínima ocupada: **64 + 280 = 344px** antes do conteúdo principal
- S10e portrait: ~360px → sobra ~16px para o conteúdo → **overflow**
- Em landscape (~720px) funciona, mas Rail e Panel consomem espaço desnecessário

**Ajustes sugeridos:**
- **Breakpoint mobile:** esconder Panel e Rail em drawer/bottom nav; mostrar só conteúdo principal
- **Breakpoint tablet:** Rail colapsável ou ícones menores
- Usar `LayoutBuilder` ou `MediaQuery.of(context).size` para adaptar
- Considerar `NavigationRail` com `extended: false` em mobile

---

## 3. SessionScreen

**Arquivo:** `lib/screens/session_screen.dart`

**Estrutura atual:**
- `Column`
  - `TabBar` (Chat | Files | Terminal)
  - `Expanded` → `TabBarView` (3 tabs)

**Chat tab:**
- Toolbar (Abort, Fork) — `Row` com 2 botões
- Lista de mensagens
- Input (TextField + Send) — `Row` com `Expanded` + botão

**Problemas:**
- Toolbar: em portrait estreito, Abort + Fork podem comprimir
- Input: `Row` com `Expanded` — geralmente ok
- TabBar com ícones + texto pode ficar apertado

**Ajustes sugeridos:**
- Toolbar: em mobile, só ícones (sem texto) ou overflow menu
- TabBar: `TabBar` com `isScrollable: true` ou ícones apenas em mobile

---

## 4. FilesScreen ⚠️ CRÍTICO

**Arquivo:** `lib/screens/files_screen.dart` (linha 103)

**Estrutura atual:**
- `Column`
  - Toolbar (search + Up)
  - `Expanded` → `Row`
    - `SizedBox(width: 260)` → lista de ficheiros
    - `Container(width: 1)` → divisor
    - `Expanded` → conteúdo do ficheiro

**Problemas:**
- **Row com largura fixa 260px** — em portrait, o pai pode ter ~16px disponível (após MainLayout consumir 344px) → **RenderFlex overflow 245px**
- Em landscape funciona se houver espaço
- Layout horizontal (lista | conteúdo) não se adapta a ecrãs estreitos

**Ajustes sugeridos:**
- **Breakpoint:** se `MediaQuery.of(context).size.width < 600`, usar layout vertical:
  - Lista em cima (altura fixa ou `Expanded` com `flex` menor)
  - Conteúdo em baixo
- Ou: lista em `Drawer`/`BottomSheet` em mobile; ao selecionar ficheiro, mostrar só conteúdo
- Substituir `SizedBox(width: 260)` por `Flexible`/`Expanded` com `flex` para permitir encolher

---

## 5. ServerDashboardScreen

**Arquivo:** `lib/screens/server_dashboard_screen.dart`

**Estrutura atual:**
- `SingleChildScrollView` → `Column` com cards
- Header: `Row` com `Expanded` (título) + botão Refresh
- Pipeline cards: `Row` com `Expanded` (nome/strategy) + `Row` (Enable/Disable, Run)
- Proposal cards: `Row` com `Expanded` (id) + status + Approve + Reject

**Problemas:**
- Pipeline card: botões Enable/Disable + Run podem overflow em portrait
- Proposal card: id + status + 2 botões — idem
- `SingleChildScrollView` ajuda no scroll vertical

**Ajustes sugeridos:**
- Cards: em mobile, empilhar em `Column` em vez de `Row`
- Botões: wrap em `Wrap` ou colocar em segunda linha
- Usar `LayoutBuilder` para breakpoint

---

## 6. TerminalScreen

**Arquivo:** `lib/screens/terminal_screen.dart`

**Estrutura atual:**
- `Column`
  - `Expanded` → `ListView` (output)
  - `Container(height: 48)` → `Row` (Enter, Clear)

**Problemas:**
- Layout simples; `Row` com 2 ícones não deve overflow
- ✅ Sem problemas críticos

---

## 7. DialogAddProject

**Arquivo:** `lib/widgets/dialog_add_project.dart`

**Estrutura atual:**
- `AlertDialog` com `SizedBox(width: 400)` no content

**Problemas:**
- 400px pode exceder largura em portrait (~360px)
- `AlertDialog` do Material adapta-se, mas o `SizedBox` força 400px

**Ajustes sugeridos:**
- Usar `ConstrainedBox(maxWidth: min(400, MediaQuery.of(context).size.width - 32))`
- Ou remover largura fixa e deixar o dialog adaptar

---

## 8. Orientação e configuração

**AndroidManifest:**
- `configChanges` inclui `orientation` — Activity recria ao rodar
- Sem `android:screenOrientation` — portrait e landscape permitidos ✅

**Flutter:**
- Nenhum `SystemChrome.setPreferredOrientations` — ambas orientações permitidas ✅
- Falta lógica para adaptar layout conforme orientação

---

## Plano de ação sugerido

| Prioridade | Tela | Ação | Status |
|------------|------|------|--------|
| P0 | MainLayout | Layout responsivo: drawer em mobile, rail+panel em tablet/desktop | ✅ Feito |
| P0 | FilesScreen | Layout adaptativo: vertical em &lt;600px, horizontal acima | ✅ Feito |
| P1 | ConnectionScreen | `SingleChildScrollView` no conteúdo | Pendente |
| P1 | ServerDashboardScreen | Cards responsivos (Column em mobile) | Pendente |
| P2 | SessionScreen | Toolbar e TabBar adaptativos | Pendente |
| P2 | DialogAddProject | Largura máxima responsiva | Pendente |

---

## Breakpoints propostos

| Nome | Largura | Comportamento |
|------|---------|---------------|
| mobile | &lt; 600px | MainLayout: drawer; FilesScreen: vertical; cards empilhados |
| tablet | 600–900px | MainLayout: rail colapsável; FilesScreen: horizontal |
| desktop | &gt; 900px | Layout atual (rail + panel + main) |

---

## Referências

- [flutter-app.md](flutter-app.md)
- [flutter-design-parity.md](../architecture/flutter-design-parity.md)
- Flutter: `MediaQuery`, `LayoutBuilder`, `OrientationBuilder`
