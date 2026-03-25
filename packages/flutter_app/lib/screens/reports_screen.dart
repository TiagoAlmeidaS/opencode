import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../theme/kinetic_tokens.dart';
import '../theme/oc2_colors.dart';
import '../widgets/kinetic_glass_panel.dart';
import '../widgets/kinetic_ui.dart';

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
    final srv = context.read<AppState>().server;
    if (srv == null) {
      setState(() => _loading = false);
      return;
    }
    final reports = await srv.reports(
      type: _filter == 'all' ? null : _filter,
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
    // Server returns Unix timestamp in seconds (int)
    if (raw is int) {
      final dt = DateTime.fromMillisecondsSinceEpoch(raw * 1000).toLocal();
      return '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    }
    try {
      final dt = DateTime.parse(raw.toString()).toLocal();
      return '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return '-';
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
    final k = isKineticDark(context);
    return Scaffold(
      backgroundColor: k ? KineticTokens.background : palette.backgroundBase,
      appBar: AppBar(
        backgroundColor: k ? KineticTokens.headerBar : palette.backgroundBase,
        foregroundColor: k ? KineticTokens.onSurface : palette.textStrong,
        title: Text(
          k ? 'RELATÓRIOS' : 'Relatórios',
          style: k ? GoogleFonts.spaceGrotesk(fontWeight: FontWeight.w700, fontSize: 15, letterSpacing: 0.5) : null,
        ),
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
                    child: k
                        ? KineticFilterChip(
                            label: t,
                            selected: selected,
                            onSelected: (_) {
                              setState(() => _filter = t);
                              _load();
                            },
                          )
                        : FilterChip(
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
                    ? Center(
                        child: Text(
                          'Nenhum relatório',
                          style: k
                              ? GoogleFonts.inter(color: KineticTokens.onSurfaceVariant, fontSize: 14)
                              : TextStyle(color: palette.textWeak),
                        ),
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _reports!.length,
                        itemBuilder: (ctx, i) => _buildCard(context, palette, _reports![i]),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildCard(BuildContext context, Oc2Palette palette, Map<String, dynamic> r) {
    final k = isKineticDark(context);
    final type = r['reportType'] as String? ?? 'report';
    final createdAt = r['createdAt'];
    final digest = r['digest'] as String? ?? '';
    final oppCount = r['oppCount'];
    final activeCount = r['marketCount'];
    final durationMs = r['durationMs'] as int?;
    final sentAt = r['sentAt'];
    final sentTelegram = sentAt != null;
    final color = _typeColor(type);

    final tile = ExpansionTile(
      tilePadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      collapsedIconColor: k ? KineticTokens.onSurfaceVariant : null,
      iconColor: k ? KineticTokens.primaryContainer : null,
      leading: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: color.withValues(alpha: k ? 0.12 : 0.15),
          borderRadius: BorderRadius.circular(8),
          border: k ? Border.all(color: color.withValues(alpha: 0.45)) : null,
        ),
        child: Text(
          k ? type.toUpperCase() : type,
          style: k
              ? GoogleFonts.jetBrainsMono(fontSize: 10, color: color, fontWeight: FontWeight.w600)
              : TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w600),
        ),
      ),
      title: Row(
        children: [
          Text(
            _formatDate(createdAt),
            style: k
                ? GoogleFonts.jetBrainsMono(fontSize: 12, color: KineticTokens.onSurface)
                : const TextStyle(fontSize: 13),
          ),
          if (sentTelegram) ...[
            const SizedBox(width: 8),
            Icon(Icons.send, size: 14, color: k ? KineticTokens.onSurfaceVariant : palette.textWeak),
          ],
        ],
      ),
      subtitle: Text(
        [
          if (oppCount != null) '$oppCount opps',
          if (activeCount != null) '$activeCount ativos',
          if (durationMs != null) 'Duração: ${(durationMs / 1000).toStringAsFixed(1)}s',
        ].join(' · '),
        style: k
            ? GoogleFonts.inter(fontSize: 11, color: KineticTokens.onSurfaceVariant)
            : TextStyle(fontSize: 12, color: palette.textWeak),
      ),
      children: [
        if (digest.isNotEmpty)
          Text(
            digest,
            style: k
                ? GoogleFonts.inter(fontSize: 12, height: 1.45, color: KineticTokens.onSurfaceVariant)
                : TextStyle(fontSize: 12, color: palette.textWeak),
          )
        else
          Text(
            'Sem digest disponível',
            style: k
                ? GoogleFonts.inter(fontSize: 12, color: KineticTokens.onSurfaceVariant)
                : TextStyle(fontSize: 12, color: palette.textWeak),
          ),
      ],
    );

    if (k) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: KineticGlassPanel(
          padding: EdgeInsets.zero,
          child: tile,
        ),
      );
    }
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: tile,
    );
  }
}
