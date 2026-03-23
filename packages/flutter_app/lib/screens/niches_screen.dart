import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../theme/oc2_colors.dart';

class NichesScreen extends StatefulWidget {
  const NichesScreen({super.key});

  @override
  State<NichesScreen> createState() => _NichesScreenState();
}

class _NichesScreenState extends State<NichesScreen> {
  List<Map<String, dynamic>>? _niches;
  bool _loading = true;
  String _filter = 'all';

  static const _statuses = ['all', 'active', 'emerging', 'inactive'];

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
    final results = await srv.niches();
    if (!mounted) return;
    setState(() {
      _niches = results;
      _loading = false;
    });
  }

  List<Map<String, dynamic>> get _filteredNiches {
    final niches = _niches ?? [];
    if (_filter == 'all') return niches;
    return niches.where((n) => (n['status'] as String?) == _filter).toList();
  }

  Color _statusColor(String? status) {
    switch (status) {
      case 'active':
        return Colors.green;
      case 'emerging':
        return Colors.blue;
      case 'inactive':
        return Colors.grey;
      default:
        return Colors.grey;
    }
  }

  Color _potentialColor(String? potential) {
    switch (potential) {
      case 'high':
        return Colors.green;
      case 'medium':
        return Colors.orange;
      case 'low':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  Color _scoreColor(double score) {
    if (score >= 70) return Colors.green;
    if (score >= 40) return Colors.orange;
    return Colors.red;
  }

  Future<void> _showDetailSheet(String id, String name) async {
    final palette = _palette;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: palette.backgroundBase,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => _NicheDetailSheet(id: id, name: name, palette: palette),
    );
  }

  @override
  Widget build(BuildContext context) {
    final palette = _palette;
    final filtered = _filteredNiches;

    return Scaffold(
      backgroundColor: palette.backgroundBase,
      appBar: AppBar(
        backgroundColor: palette.backgroundBase,
        foregroundColor: palette.textStrong,
        title: const Text('Nichos de Oportunidades'),
        actions: [
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
                children: _statuses.map((s) {
                  final selected = _filter == s;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: FilterChip(
                      label: Text(s[0].toUpperCase() + s.substring(1)),
                      selected: selected,
                      onSelected: (_) => setState(() => _filter = s),
                    ),
                  );
                }).toList(),
              ),
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : filtered.isEmpty
                    ? Center(
                        child: Text(
                          'No niches found',
                          style: TextStyle(color: palette.textWeak),
                        ),
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                        itemCount: filtered.length,
                        itemBuilder: (ctx, i) => _buildCard(palette, filtered[i]),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildCard(Oc2Palette palette, Map<String, dynamic> niche) {
    final id = niche['id'] as String? ?? '';
    final name = niche['name'] as String? ?? '-';
    final description = niche['description'] as String?;
    final scoreRaw = niche['score'] as num?;
    final score = scoreRaw?.toDouble() ?? 0.0;
    final potential = niche['potential'] as String?;
    final status = niche['status'] as String?;
    final relatedRaw = niche['related_niches'];
    final relatedNiches = relatedRaw is List
        ? relatedRaw.map((e) => e.toString()).toList()
        : <String>[];

    final statusColor = _statusColor(status);
    final potentialColor = _potentialColor(potential);
    final scoreColor = _scoreColor(score);

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => _showDetailSheet(id, name),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Title + status badge
              Row(
                children: [
                  Expanded(
                    child: Text(
                      name,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: palette.textStrong,
                      ),
                    ),
                  ),
                  if (status != null) ...[
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: statusColor.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        status,
                        style: TextStyle(
                          fontSize: 11,
                          color: statusColor,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 10),
              // Score bar
              Row(
                children: [
                  Text(
                    'Score: ${score.toStringAsFixed(0)}',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: scoreColor,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(
                        value: score / 100.0,
                        backgroundColor: palette.backgroundWeak,
                        color: scoreColor,
                        minHeight: 6,
                      ),
                    ),
                  ),
                ],
              ),
              if (potential != null) ...[
                const SizedBox(height: 8),
                Row(
                  children: [
                    Text(
                      'Potential: ',
                      style: TextStyle(fontSize: 12, color: palette.textWeak),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: potentialColor.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        potential,
                        style: TextStyle(
                          fontSize: 11,
                          color: potentialColor,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
              if (description != null && description.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  description,
                  style: TextStyle(fontSize: 12, color: palette.textWeak),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
              if (relatedNiches.isNotEmpty) ...[
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: relatedNiches.map((rn) {
                    return Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: Colors.grey.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        rn,
                        style: TextStyle(fontSize: 10, color: palette.textWeak),
                      ),
                    );
                  }).toList(),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _NicheDetailSheet extends StatefulWidget {
  final String id;
  final String name;
  final Oc2Palette palette;

  const _NicheDetailSheet({
    required this.id,
    required this.name,
    required this.palette,
  });

  @override
  State<_NicheDetailSheet> createState() => _NicheDetailSheetState();
}

class _NicheDetailSheetState extends State<_NicheDetailSheet> {
  Map<String, dynamic>? _detail;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadDetail();
  }

  Future<void> _loadDetail() async {
    final srv = context.read<AppState>().server;
    if (srv == null) {
      setState(() => _loading = false);
      return;
    }
    final result = await srv.niche(widget.id);
    if (!mounted) return;
    setState(() {
      _detail = result;
      _loading = false;
    });
  }

  Color _statusColor(String? status) {
    switch (status) {
      case 'active':
        return Colors.green;
      case 'emerging':
        return Colors.blue;
      case 'inactive':
        return Colors.grey;
      default:
        return Colors.grey;
    }
  }

  Color _potentialColor(String? potential) {
    switch (potential) {
      case 'high':
        return Colors.green;
      case 'medium':
        return Colors.orange;
      case 'low':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  Color _scoreColor(double score) {
    if (score >= 70) return Colors.green;
    if (score >= 40) return Colors.orange;
    return Colors.red;
  }

  @override
  Widget build(BuildContext context) {
    final palette = widget.palette;
    return DraggableScrollableSheet(
      initialChildSize: 0.65,
      maxChildSize: 0.95,
      minChildSize: 0.4,
      expand: false,
      builder: (ctx, scrollCtrl) => Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    widget.name,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: palette.textStrong,
                    ),
                  ),
                ),
                IconButton(
                  icon: Icon(Icons.close, color: palette.iconBase),
                  onPressed: () => Navigator.pop(ctx),
                ),
              ],
            ),
          ),
          Divider(height: 1, color: palette.borderWeak),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _detail == null
                    ? Center(
                        child: Text(
                          'Failed to load details',
                          style: TextStyle(color: palette.textWeak),
                        ),
                      )
                    : _buildDetail(ctx, scrollCtrl, palette, _detail!),
          ),
        ],
      ),
    );
  }

  Widget _buildDetail(
    BuildContext ctx,
    ScrollController scrollCtrl,
    Oc2Palette palette,
    Map<String, dynamic> detail,
  ) {
    final description = detail['description'] as String?;
    final scoreRaw = detail['score'] as num?;
    final score = scoreRaw?.toDouble() ?? 0.0;
    final potential = detail['potential'] as String?;
    final status = detail['status'] as String?;
    final relatedRaw = detail['related_niches'];
    final relatedNiches = relatedRaw is List
        ? relatedRaw.map((e) => e.toString()).toList()
        : <String>[];

    final statusColor = _statusColor(status);
    final potentialColor = _potentialColor(potential);
    final scoreColor = _scoreColor(score);

    return ListView(
      controller: scrollCtrl,
      padding: const EdgeInsets.all(16),
      children: [
        // Status + potential row
        Wrap(
          spacing: 10,
          runSpacing: 8,
          children: [
            if (status != null)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  status,
                  style: TextStyle(
                    fontSize: 12,
                    color: statusColor,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            if (potential != null)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: potentialColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  'Potential: $potential',
                  style: TextStyle(
                    fontSize: 12,
                    color: potentialColor,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 16),
        // Score
        Row(
          children: [
            Text(
              'Score: ${score.toStringAsFixed(0)}',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: scoreColor,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: score / 100.0,
                  backgroundColor: palette.backgroundWeak,
                  color: scoreColor,
                  minHeight: 8,
                ),
              ),
            ),
          ],
        ),
        if (description != null && description.isNotEmpty) ...[
          const SizedBox(height: 16),
          Text(
            'Description',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: palette.textWeak,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            description,
            style: TextStyle(fontSize: 13, color: palette.textStrong, height: 1.5),
          ),
        ],
        if (relatedNiches.isNotEmpty) ...[
          const SizedBox(height: 16),
          Text(
            'Related Niches',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: palette.textWeak,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: relatedNiches.map((rn) {
              return Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: Colors.grey.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  rn,
                  style: TextStyle(fontSize: 12, color: palette.textWeak),
                ),
              );
            }).toList(),
          ),
        ],
        const SizedBox(height: 24),
      ],
    );
  }
}
