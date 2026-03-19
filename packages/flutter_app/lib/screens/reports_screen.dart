import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../theme/oc2_colors.dart';

class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  List<Map<String, dynamic>>? _reports;
  bool _loading = true;
  String _filter = 'all';

  static const _types = ['all', 'daily', 'weekly', 'alert', 'digest'];

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
    final reports = await client.serverReports(
      reportType: _filter == 'all' ? null : _filter,
      limit: 50,
    );
    if (!mounted) return;
    setState(() {
      _reports = reports;
      _loading = false;
    });
  }

  String _formatDate(dynamic raw) {
    if (raw == null) return '-';
    try {
      final dt = DateTime.parse(raw.toString()).toLocal();
      return '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return raw.toString().substring(0, raw.toString().length.clamp(0, 16));
    }
  }

  Color _typeColor(String type) {
    switch (type) {
      case 'daily':
        return Colors.blue;
      case 'weekly':
        return Colors.purple;
      case 'alert':
        return Colors.red;
      case 'digest':
        return Colors.teal;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = _palette;
    return Scaffold(
      backgroundColor: palette.backgroundBase,
      appBar: AppBar(
        backgroundColor: palette.backgroundBase,
        foregroundColor: palette.textStrong,
        title: const Text('Relatórios'),
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
                children: _types.map((t) {
                  final selected = _filter == t;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: FilterChip(
                      label: Text(t),
                      selected: selected,
                      onSelected: (_) {
                        setState(() => _filter = t);
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
                : (_reports == null || _reports!.isEmpty)
                    ? Center(child: Text('Nenhum relatório', style: TextStyle(color: palette.textWeak)))
                    : ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _reports!.length,
                        itemBuilder: (ctx, i) => _buildCard(palette, _reports![i]),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildCard(Oc2Palette palette, Map<String, dynamic> r) {
    final type = r['report_type'] as String? ?? r['type'] as String? ?? 'report';
    final createdAt = r['created_at'] ?? r['createdAt'];
    final digest = r['digest'] as String? ?? '';
    final oppCount = r['opportunity_count'] ?? r['opportunityCount'];
    final activeCount = r['active_market_count'] ?? r['activeMarketCount'];
    final duration = r['pipeline_duration_s'] ?? r['pipelineDurationS'];
    final sentTelegram = r['sent_telegram'] as bool? ?? r['sentTelegram'] as bool? ?? false;
    final color = _typeColor(type);

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ExpansionTile(
        tilePadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        leading: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: color.withOpacity(0.15),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(type, style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w600)),
        ),
        title: Row(
          children: [
            Text(_formatDate(createdAt), style: const TextStyle(fontSize: 13)),
            if (sentTelegram) ...[
              const SizedBox(width: 8),
              Icon(Icons.send, size: 14, color: palette.textWeak),
            ],
          ],
        ),
        subtitle: Text(
          [
            if (oppCount != null) '$oppCount opps',
            if (activeCount != null) '$activeCount ativos',
            if (duration != null) 'Duração: ${duration}s',
          ].join(' · '),
          style: TextStyle(fontSize: 12, color: palette.textWeak),
        ),
        children: [
          if (digest.isNotEmpty)
            Text(digest, style: TextStyle(fontSize: 12, color: palette.textWeak))
          else
            Text('Sem digest disponível', style: TextStyle(fontSize: 12, color: palette.textWeak)),
        ],
      ),
    );
  }
}
