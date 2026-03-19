---
name: flutter-screen
description: Create a new Flutter screen for the OpenCode mobile app following the established design system, API patterns and UX conventions. Use when the user asks to build, add or create a new screen, page, tab or widget in the Flutter app.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
argument-hint: [ScreenName] [brief description]
---

# Flutter Screen — OpenCode Design System

Crie uma nova tela Flutter para o app OpenCode (`packages/flutter_app/`) seguindo **rigorosamente** os padrões abaixo.

## Contexto: $ARGUMENTS

---

## 1. Checklist obrigatório antes de escrever código

1. Leia `packages/flutter_app/lib/theme/oc2_colors.dart` — paleta de cores
2. Leia `packages/flutter_app/lib/widgets/opencode_button.dart` — componente de botão
3. Leia `packages/flutter_app/lib/screens/home_dashboard_screen.dart` — exemplo de tela **sem Scaffold** (tab 0 e 1)
4. Leia `packages/flutter_app/lib/screens/repo_jobs_screen.dart` — exemplo de tela **com Scaffold** (tabs navegadas via Navigator.push ou tabs 2-3)
5. Verifique em `packages/server/src/routes.ts` os endpoints que a tela vai consumir
6. Confirme os nomes exatos dos campos JSON — o servidor retorna **camelCase** (ex: `createdAt`, `reportType`, `oppCount`) e timestamps são **Unix seconds (int)**, não strings ISO

---

## 2. Regras de design

### Paleta de cores
```dart
// SEMPRE usar assim — nunca hardcode colors sem palette
final palette = Theme.of(context).brightness == Brightness.dark
    ? Oc2Colors.dark
    : Oc2Colors.light;

// Campos disponíveis:
palette.backgroundBase   // fundo principal
palette.backgroundWeak   // fundo secundário (cards, sidebars)
palette.textStrong       // texto principal
palette.textWeak         // texto secundário, subtítulos
palette.borderWeak       // bordas sutis
palette.iconBase         // ícones padrão
```

### Tipo de tela — escolher um dos dois padrões

**Padrão A — Tela inline (sem Scaffold próprio):** usar para tabs 0 (Home) e 1 (Server) no `main_layout.dart`
```dart
class MyScreen extends StatefulWidget {
  const MyScreen({super.key});
  @override
  State<MyScreen> createState() => _MyScreenState();
}

class _MyScreenState extends State<MyScreen> {
  bool _loading = true;

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? Oc2Colors.dark : Oc2Colors.light;

    if (_loading) {
      return Container(
        color: palette.backgroundBase,
        child: const Center(child: CircularProgressIndicator()),
      );
    }
    return Container(
      color: palette.backgroundBase,
      child: SingleChildScrollView(padding: const EdgeInsets.all(24), child: Column(...)),
    );
  }
}
```

**Padrão B — Tela navegada (com Scaffold próprio):** usar para telas abertas via `Navigator.push`, ou tabs 2-3
```dart
@override
Widget build(BuildContext context) {
  final palette = Theme.of(context).brightness == Brightness.dark
      ? Oc2Colors.dark : Oc2Colors.light;
  return Scaffold(
    backgroundColor: palette.backgroundBase,
    appBar: AppBar(
      backgroundColor: palette.backgroundBase,
      foregroundColor: palette.textStrong,
      title: const Text('Título'),
      actions: [
        IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
      ],
    ),
    body: _loading
        ? const Center(child: CircularProgressIndicator())
        : /* conteúdo */,
  );
}
```

### Botões
```dart
// Importar: '../theme/button_style.dart' e '../widgets/opencode_button.dart'

OpenCodeButton(
  onPressed: _action,
  variant: OpenCodeButtonVariant.primary,   // ou .secondary
  size: OpenCodeButtonSize.small,            // ou .large (default medium)
  icon: Icons.refresh,                       // opcional
  child: const Text('Label'),
)
```

### Cards com badge de tipo
```dart
Card(
  margin: const EdgeInsets.only(bottom: 8),
  child: Padding(
    padding: const EdgeInsets.all(14),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: typeColor.withOpacity(0.15),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(type, style: TextStyle(fontSize: 11, color: typeColor, fontWeight: FontWeight.w600)),
          ),
          const SizedBox(width: 8),
          Expanded(child: Text(title, overflow: TextOverflow.ellipsis)),
        ]),
      ],
    ),
  ),
)
```

### Filtros por categoria (chips)
```dart
SingleChildScrollView(
  scrollDirection: Axis.horizontal,
  child: Row(
    children: _filters.map((f) => Padding(
      padding: const EdgeInsets.only(right: 8),
      child: FilterChip(
        label: Text(f),
        selected: _filter == f,
        onSelected: (_) { setState(() => _filter = f); _load(); },
      ),
    )).toList(),
  ),
)
```

### Barra de progresso colorida (score, confidence)
```dart
ClipRRect(
  borderRadius: BorderRadius.circular(4),
  child: LinearProgressIndicator(
    value: score / 100.0,  // normalizado 0.0–1.0
    backgroundColor: palette.backgroundWeak,
    color: score >= 70 ? Colors.green : score >= 40 ? Colors.orange : Colors.red,
    minHeight: 4,
  ),
)
```

---

## 3. Padrões de dados da API

### Carregamento em paralelo (obrigatório quando múltiplas APIs)
```dart
Future<void> _load() async {
  setState(() => _loading = true);
  final client = context.read<AppState>().client;
  if (client == null) { setState(() => _loading = false); return; }

  final results = await Future.wait([
    client.methodA(),
    client.methodB(limit: 50),
  ]);
  if (!mounted) return;

  setState(() {
    _dataA = results[0] as TypeA?;
    _dataB = results[1] as List<Map<String, dynamic>>?;
    _loading = false;
  });
}
```

### Timestamps Unix (todos os campos `createdAt`, `updatedAt`, `sentAt` etc.)
```dart
// NUNCA usar DateTime.parse() — o servidor retorna int (Unix seconds), não string
String _formatDate(dynamic raw) {
  if (raw is int) {
    final dt = DateTime.fromMillisecondsSinceEpoch(raw * 1000).toLocal();
    return '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')}';
  }
  return '-';
}
```

### Campos JSON — nomenclatura do servidor
| Campo DB/TypeScript | JSON retornado | NÃO usar |
|---------------------|----------------|----------|
| `reportType` | `r['reportType']` | `r['report_type']` |
| `createdAt` | `r['createdAt']` (int) | `r['created_at']` |
| `oppCount` | `r['oppCount']` | `r['opportunity_count']` |
| `positiveCount` | `l['positiveCount']` | `l['upvotes']` |
| `riskLevel` | `p['riskLevel']` | `p['risk_level']` |
| `/opportunities/stats` | `stats['by_status']['new']` | `stats['new_count']` |
| ServerStatus | `j['pipelines']['total']` | `j['pipelinesTotal']` |

### `tags` em learnings — é JSON string no banco
```dart
final tagsRaw = l['tags'];
List<String> tagList = [];
if (tagsRaw is String && tagsRaw.isNotEmpty) {
  try {
    final parts = tagsRaw.replaceAll(RegExp(r'[\[\]"]'), '').split(',');
    tagList = parts.map((t) => t.trim()).where((t) => t.isNotEmpty).toList();
  } catch (_) {}
} else if (tagsRaw is List) {
  tagList = tagsRaw.map((t) => t.toString()).toList();
}
```

---

## 4. Integração no main_layout.dart

### Para nova tab no NavigationBar (tabs 0-3 já existem — só adicionar se necessário)
```dart
// Em _buildContent(), adicionar case:
case 4:
  return const NovaScreen();

// Em NavigationBar destinations, adicionar:
NavigationDestination(
  icon: Icon(Icons.new_icon_outlined),
  selectedIcon: Icon(Icons.new_icon),
  label: 'Nova Tab',
),
```

### Para tela navegada (Navigator.push desde outra tela)
```dart
TextButton(
  onPressed: () => Navigator.of(context).push(
    MaterialPageRoute<void>(builder: (_) => const NovaScreen()),
  ),
  child: const Text('Ver tudo →'),
)
```

---

## 5. Verificação final

Antes de encerrar, execute:
```bash
cd packages/flutter_app && dart analyze lib/
```

Esperado: **zero errors, zero warnings**. Apenas `info` de `withOpacity` deprecation é aceitável (padrão existente no codebase).

---

## 6. Imports padrão para uma tela completa

```dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../theme/button_style.dart';   // para OpenCodeButtonVariant / OpenCodeButtonSize
import '../theme/oc2_colors.dart';
import '../widgets/opencode_button.dart';
```
