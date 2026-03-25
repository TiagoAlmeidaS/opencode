import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../theme/kinetic_tokens.dart';
import '../theme/oc2_colors.dart';
import '../widgets/kinetic_ui.dart';
import '../widgets/learnings_constellation_view.dart';

class LearningsScreen extends StatefulWidget {
  const LearningsScreen({super.key});

  @override
  State<LearningsScreen> createState() => _LearningsScreenState();
}

class _LearningsScreenState extends State<LearningsScreen> {
  List<Map<String, dynamic>>? _learnings;
  bool _loading = true;
  bool _extracting = false;
  String _filter = 'all';
  bool _brainMap = false;

  static const _categories = ['all', 'skill', 'niche', 'platform', 'pattern'];

  Oc2Palette get _palette =>
      Theme.of(context).brightness == Brightness.dark ? Oc2Colors.dark : Oc2Colors.light;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final srv = context.read<AppState>().server;
    if (srv == null) {
      setState(() => _loading = false);
      return;
    }
    final learnings = await srv.learnings(
      category: _filter == 'all' ? null : _filter,
      limit: 100,
    );
    if (!mounted) return;
    setState(() {
      _learnings = learnings;
      _loading = false;
    });
  }

  Future<void> _extract() async {
    setState(() => _extracting = true);
    final srv = context.read<AppState>().server;
    if (srv != null) {
      await srv.learningExtract();
      if (mounted) await _load();
    }
    if (!mounted) return;
    setState(() => _extracting = false);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Extração iniciada')),
    );
  }

  String _formatDate(dynamic raw) {
    if (raw == null) return '-';
    if (raw is int) {
      final dt = DateTime.fromMillisecondsSinceEpoch(raw * 1000).toLocal();
      return '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')}';
    }
    try {
      final dt = DateTime.parse(raw.toString()).toLocal();
      return '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')}';
    } catch (_) {
      return '-';
    }
  }

  Color _confidenceColor(double conf) {
    if (conf >= 0.7) return Colors.green;
    if (conf >= 0.4) return Colors.orange;
    return Colors.red;
  }

  Color _categoryColor(String cat) {
    switch (cat) {
      case 'skill':
        return Colors.blue;
      case 'niche':
        return Colors.purple;
      case 'platform':
        return Colors.teal;
      case 'pattern':
        return Colors.orange;
      default:
        return Colors.grey;
    }
  }

  void _openCategorySheet(BuildContext context) {
    final k = isKineticDark(context);
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: k ? KineticTokens.surfaceContainer : null,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Categoria',
                  style: k
                      ? GoogleFonts.spaceGrotesk(fontWeight: FontWeight.w700, fontSize: 16, color: KineticTokens.onSurface)
                      : Theme.of(ctx).textTheme.titleMedium,
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: _categories.map((c) {
                    final selected = _filter == c;
                    return k
                        ? KineticFilterChip(
                            label: c,
                            selected: selected,
                            onSelected: (_) {
                              Navigator.pop(ctx);
                              setState(() => _filter = c);
                              _load();
                            },
                          )
                        : FilterChip(
                            label: Text(c),
                            selected: selected,
                            onSelected: (_) {
                              Navigator.pop(ctx);
                              setState(() => _filter = c);
                              _load();
                            },
                          );
                  }).toList(),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final palette = _palette;
    final k = isKineticDark(context);
    final total = _learnings?.length ?? 0;
    final app = context.watch<AppState>();

    if (k && _brainMap) {
      return Scaffold(
        backgroundColor: KineticTokens.background,
        body: Stack(
          fit: StackFit.expand,
          children: [
            if (_loading)
              const Center(child: CircularProgressIndicator(color: KineticTokens.primaryContainer))
            else
              LearningsConstellationView(
                items: _learnings ?? const [],
                apiConnected: app.server != null,
                daemonReachable: app.daemonAvailable,
              ),
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 2),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    IconButton(
                      icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
                      color: KineticTokens.primaryContainer,
                      tooltip: 'Fechar mapa',
                      onPressed: () => setState(() => _brainMap = false),
                    ),
                    Padding(
                      padding: const EdgeInsets.only(top: 10),
                      child: Text(
                        'BRAIN MAP${total > 0 ? " · $total" : ""}',
                        style: GoogleFonts.spaceGrotesk(
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                          letterSpacing: 0.8,
                          color: KineticTokens.primaryFixedDim,
                        ),
                      ),
                    ),
                    const Spacer(),
                    IconButton(
                      icon: const Icon(Icons.tune),
                      tooltip: 'Filtro de categoria',
                      color: KineticTokens.onSurfaceVariant,
                      onPressed: () => _openCategorySheet(context),
                    ),
                    if (_extracting)
                      const Padding(
                        padding: EdgeInsets.all(12),
                        child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
                      )
                    else
                      IconButton(
                        icon: const Icon(Icons.psychology_outlined),
                        tooltip: 'Extract learnings',
                        color: KineticTokens.onSurfaceVariant,
                        onPressed: _extract,
                      ),
                    IconButton(
                      icon: const Icon(Icons.refresh),
                      tooltip: 'Refresh',
                      color: KineticTokens.primaryFixedDim,
                      onPressed: _load,
                    ),
                    IconButton(
                      icon: const Icon(Icons.view_list_rounded),
                      tooltip: 'Vista em lista',
                      color: KineticTokens.primaryContainer,
                      onPressed: () => setState(() => _brainMap = false),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      );
    }

    return Scaffold(
      backgroundColor: k ? KineticTokens.background : palette.backgroundBase,
      appBar: AppBar(
        backgroundColor: k ? KineticTokens.headerBar : palette.backgroundBase,
        foregroundColor: k ? KineticTokens.onSurface : palette.textStrong,
        title: Text(
          k ? 'LEARNINGS${total > 0 ? " ($total)" : ""}' : 'Learnings${total > 0 ? " ($total)" : ""}',
          style: k
              ? GoogleFonts.spaceGrotesk(fontWeight: FontWeight.w700, fontSize: 15, letterSpacing: 0.5)
              : null,
        ),
        actions: [
          if (k)
            IconButton(
              icon: const Icon(Icons.hub_outlined),
              tooltip: 'Mapa (tela cheia)',
              onPressed: () => setState(() => _brainMap = true),
            ),
          if (_extracting)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16),
              child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)),
            )
          else
            IconButton(
              icon: const Icon(Icons.psychology),
              tooltip: 'Extract learnings',
              onPressed: _extract,
            ),
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh',
            onPressed: _load,
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: _categories.map((c) {
                  final selected = _filter == c;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: k
                        ? KineticFilterChip(
                            label: c,
                            selected: selected,
                            onSelected: (_) {
                              setState(() => _filter = c);
                              _load();
                            },
                          )
                        : FilterChip(
                            label: Text(c),
                            selected: selected,
                            onSelected: (_) {
                              setState(() => _filter = c);
                              _load();
                            },
                          ),
                  );
                }).toList(),
              ),
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : (_learnings == null || _learnings!.isEmpty)
                    ? Center(
                        child: Text(
                          'Nenhum learning',
                          style: k
                              ? GoogleFonts.inter(color: KineticTokens.onSurfaceVariant, fontSize: 14)
                              : TextStyle(color: palette.textWeak),
                        ),
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _learnings!.length,
                        itemBuilder: (ctx, i) => _buildCard(context, palette, _learnings![i]),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildCard(BuildContext context, Oc2Palette palette, Map<String, dynamic> l) {
    final k = isKineticDark(context);
    final category = l['category'] as String? ?? 'learning';
    final title = l['title'] as String? ?? l['key'] as String? ?? '';
    final body = l['body'] as String? ?? '';
    final confidence = (l['confidence'] as num?)?.toDouble() ?? 0.0;
    final source = l['source'] as String?;
    final updatedAt = l['updatedAt'];
    final upvotes = (l['positiveCount'] as num?)?.toInt() ?? 0;
    final downvotes = (l['negativeCount'] as num?)?.toInt() ?? 0;
    // tags is stored as JSON text string in the DB
    final tagsRaw = l['tags'];
    List<String> tagList = [];
    if (tagsRaw is String && tagsRaw.isNotEmpty) {
      try {
        final parsed = tagsRaw.startsWith('[') ? (tagsRaw.replaceAll(RegExp(r'[\[\]"]'), '').split(',')) : <String>[];
        tagList = parsed.map((t) => t.trim()).where((t) => t.isNotEmpty).toList();
      } catch (_) {}
    } else if (tagsRaw is List) {
      tagList = tagsRaw.map((t) => t.toString()).toList();
    }

    final catColor = _categoryColor(category);
    final confColor = _confidenceColor(confidence);

    final column = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: catColor.withValues(alpha: k ? 0.12 : 0.15),
                borderRadius: BorderRadius.circular(8),
                border: k ? Border.all(color: catColor.withValues(alpha: 0.45)) : null,
              ),
              child: Text(
                k ? category.toUpperCase() : category,
                style: k
                    ? GoogleFonts.jetBrainsMono(fontSize: 10, color: catColor, fontWeight: FontWeight.w600)
                    : TextStyle(fontSize: 11, color: catColor, fontWeight: FontWeight.w600),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                title,
                style: k
                    ? GoogleFonts.spaceGrotesk(fontWeight: FontWeight.w600, fontSize: 13, color: KineticTokens.onSurface)
                    : const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: confidence,
            backgroundColor: k ? KineticTokens.surfaceContainer : palette.backgroundWeak,
            color: confColor,
            minHeight: 4,
          ),
        ),
        const SizedBox(height: 6),
        if (body.isNotEmpty)
          Text(
            body.length > 200 ? '${body.substring(0, 200)}…' : body,
            style: k
                ? GoogleFonts.inter(fontSize: 12, color: KineticTokens.onSurfaceVariant, height: 1.4)
                : TextStyle(fontSize: 12, color: palette.textWeak),
          ),
        if (tagList.isNotEmpty) ...[
          const SizedBox(height: 6),
          Wrap(
            spacing: 4,
            children: tagList
                .take(5)
                .map((t) => Chip(
                      label: Text(
                        t,
                        style: TextStyle(
                          fontSize: 10,
                          color: k ? KineticTokens.primaryFixedDim : null,
                        ),
                      ),
                      padding: EdgeInsets.zero,
                      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      visualDensity: VisualDensity.compact,
                      backgroundColor: k ? KineticTokens.surfaceContainerHigh.withValues(alpha: 0.6) : null,
                      side: k ? BorderSide(color: KineticTokens.outlineVariant.withValues(alpha: 0.35)) : null,
                    ))
                .toList(),
          ),
        ],
        const SizedBox(height: 6),
        Text(
          [
            if (source != null) 'source: $source',
            '+$upvotes / -$downvotes',
            if (updatedAt != null) _formatDate(updatedAt),
          ].join('  ·  '),
          style: k
              ? GoogleFonts.jetBrainsMono(fontSize: 10, color: KineticTokens.onSurfaceVariant)
              : TextStyle(fontSize: 11, color: palette.textWeak),
        ),
      ],
    );

    if (k) {
      return KineticGlassCard(marginBottom: 12, child: column);
    }
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: column,
      ),
    );
  }
}
