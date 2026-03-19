import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../theme/oc2_colors.dart';

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
    final client = context.read<AppState>().client;
    if (client == null) {
      setState(() => _loading = false);
      return;
    }
    final learnings = await client.serverLearnings(
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
    final client = context.read<AppState>().client;
    if (client != null) {
      await client.serverLearningExtract();
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

  @override
  Widget build(BuildContext context) {
    final palette = _palette;
    final total = _learnings?.length ?? 0;
    return Scaffold(
      backgroundColor: palette.backgroundBase,
      appBar: AppBar(
        backgroundColor: palette.backgroundBase,
        foregroundColor: palette.textStrong,
        title: Text('Learnings${total > 0 ? " ($total)" : ""}'),
        actions: [
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
                    child: FilterChip(
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
                    ? Center(child: Text('Nenhum learning', style: TextStyle(color: palette.textWeak)))
                    : ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _learnings!.length,
                        itemBuilder: (ctx, i) => _buildCard(palette, _learnings![i]),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildCard(Oc2Palette palette, Map<String, dynamic> l) {
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

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: catColor.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(category, style: TextStyle(fontSize: 11, color: catColor, fontWeight: FontWeight.w600)),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    title,
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
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
                backgroundColor: palette.backgroundWeak,
                color: confColor,
                minHeight: 4,
              ),
            ),
            const SizedBox(height: 6),
            if (body.isNotEmpty)
              Text(
                body.length > 200 ? '${body.substring(0, 200)}…' : body,
                style: TextStyle(fontSize: 12, color: palette.textWeak),
              ),
            if (tagList.isNotEmpty) ...[
              const SizedBox(height: 6),
              Wrap(
                spacing: 4,
                children: tagList
                    .take(5)
                    .map((t) => Chip(
                          label: Text(t, style: const TextStyle(fontSize: 10)),
                          padding: EdgeInsets.zero,
                          materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          visualDensity: VisualDensity.compact,
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
              style: TextStyle(fontSize: 11, color: palette.textWeak),
            ),
          ],
        ),
      ),
    );
  }
}
