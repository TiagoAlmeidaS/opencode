import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../theme/button_style.dart';
import '../theme/oc2_colors.dart';
import '../widgets/opencode_button.dart';

class OpportunitiesScreen extends StatefulWidget {
  const OpportunitiesScreen({super.key});

  @override
  State<OpportunitiesScreen> createState() => _OpportunitiesScreenState();
}

class _OpportunitiesScreenState extends State<OpportunitiesScreen> {
  List<Map<String, dynamic>>? _opportunities;
  Map<String, dynamic>? _stats;
  bool _loading = true;
  String _filter = 'all';

  static const _statuses = ['all', 'new', 'scored', 'shortlisted', 'applied', 'won', 'ignored'];

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
    final results = await Future.wait([
      srv.opportunitiesStats(),
      srv.opportunities(
        status: _filter == 'all' ? null : _filter,
        limit: 100,
      ),
    ]);
    if (!mounted) return;
    setState(() {
      _stats = results[0] as Map<String, dynamic>?;
      _opportunities = results[1] as List<Map<String, dynamic>>?;
      _loading = false;
    });
  }

  Future<void> _shortlist(String id) async {
    final srv = context.read<AppState>().server;
    if (srv == null) return;
    final ok = await srv.opportunityShortlist(id);
    if (!mounted) return;
    if (ok) await _load();
  }

  Future<void> _ignore(String id) async {
    final srv = context.read<AppState>().server;
    if (srv == null) return;
    final ok = await srv.opportunityIgnore(id);
    if (!mounted) return;
    if (ok) await _load();
  }

  Future<void> _execute(String id, String title) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Launch dev cycle?'),
        content: Text('This will create a job and start the full implementation pipeline for:\n\n"$title"'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Launch'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    final srv = context.read<AppState>().server;
    if (srv == null) return;
    final result = await srv.opportunityExecute(id);
    if (!mounted) return;
    if (result != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Dev cycle launched — check Repo Jobs tab for progress'),
          duration: Duration(seconds: 4),
        ),
      );
      await _load();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Failed to launch dev cycle'), backgroundColor: Colors.red),
      );
    }
  }

  Color _scoreColor(double score) {
    if (score >= 70) return Colors.green;
    if (score >= 40) return Colors.orange;
    return Colors.red;
  }

  Color _typeColor(String type) {
    switch (type) {
      case 'bug-bounty':
        return Colors.red;
      case 'freelance':
        return Colors.blue;
      case 'grant':
        return Colors.green;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = _palette;
    final stats = _stats;
    return Scaffold(
      backgroundColor: palette.backgroundBase,
      appBar: AppBar(
        backgroundColor: palette.backgroundBase,
        foregroundColor: palette.textStrong,
        title: const Text('Oportunidades'),
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
          if (stats != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              color: palette.backgroundWeak,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  _statChip('new', _byStatus(stats, 'new'), Colors.blue),
                  _statChip('scored', _byStatus(stats, 'scored'), Colors.orange),
                  _statChip('shortlisted', _byStatus(stats, 'shortlisted'), Colors.purple),
                  _statChip('applied', _byStatus(stats, 'applied'), Colors.teal),
                  _statChip('won', _byStatus(stats, 'won'), Colors.green),
                ],
              ),
            ),
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
                      label: Text(s),
                      selected: selected,
                      onSelected: (_) {
                        setState(() => _filter = s);
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
                : (_opportunities == null || _opportunities!.isEmpty)
                    ? Center(child: Text('Nenhuma oportunidade', style: TextStyle(color: palette.textWeak)))
                    : ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _opportunities!.length,
                        itemBuilder: (ctx, i) => _buildCard(palette, _opportunities![i]),
                      ),
          ),
        ],
      ),
    );
  }

  static int _byStatus(Map<String, dynamic> stats, String status) {
    final m = stats['by_status'];
    if (m is Map) return (m[status] as num?)?.toInt() ?? 0;
    return 0;
  }

  Widget _statChip(String label, dynamic count, Color color) {
    return Column(
      children: [
        Text('$count', style: TextStyle(fontWeight: FontWeight.bold, color: color, fontSize: 16)),
        Text(label, style: TextStyle(fontSize: 10, color: _palette.textWeak)),
      ],
    );
  }

  Widget _buildCard(Oc2Palette palette, Map<String, dynamic> opp) {
    final id = opp['id'] as String? ?? '';
    final title = opp['title'] as String? ?? '-';
    final type = opp['type'] as String? ?? opp['opportunity_type'] as String? ?? 'unknown';
    final platform = opp['platform'] as String?;
    final status = opp['status'] as String? ?? 'new';
    final scoreRaw = opp['score'] ?? opp['fit_score'];
    final score = (scoreRaw as num?)?.toDouble() ?? 0.0;
    final rewardMin = opp['reward_min'] ?? opp['rewardMin'];
    final rewardMax = opp['reward_max'] ?? opp['rewardMax'];
    final currency = opp['reward_currency'] ?? opp['rewardCurrency'] ?? 'USD';

    final typeColor = _typeColor(type);
    final scoreColor = _scoreColor(score);
    final showActions = status == 'new' || status == 'scored';
    final showExecute = status == 'shortlisted';

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
                    color: typeColor.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(type, style: TextStyle(fontSize: 11, color: typeColor, fontWeight: FontWeight.w600)),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500), overflow: TextOverflow.ellipsis),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                if (platform != null) ...[
                  Icon(Icons.public, size: 12, color: palette.textWeak),
                  const SizedBox(width: 4),
                  Text(platform, style: TextStyle(fontSize: 12, color: palette.textWeak)),
                  const SizedBox(width: 12),
                ],
                if (rewardMin != null || rewardMax != null) ...[
                  Icon(Icons.attach_money, size: 12, color: palette.textWeak),
                  Text(
                    '${rewardMin ?? '?'} – ${rewardMax ?? '?'} $currency',
                    style: TextStyle(fontSize: 12, color: palette.textWeak),
                  ),
                ],
                const Spacer(),
                Text(score.toStringAsFixed(0), style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: scoreColor)),
              ],
            ),
            const SizedBox(height: 6),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: score / 100.0,
                backgroundColor: palette.backgroundWeak,
                color: scoreColor,
                minHeight: 4,
              ),
            ),
            if (showActions) ...[
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                children: [
                  OpenCodeButton(
                    onPressed: () => _shortlist(id),
                    variant: OpenCodeButtonVariant.primary,
                    size: OpenCodeButtonSize.small,
                    icon: Icons.star_outline,
                    child: const Text('Shortlist'),
                  ),
                  OpenCodeButton(
                    onPressed: () => _ignore(id),
                    variant: OpenCodeButtonVariant.secondary,
                    size: OpenCodeButtonSize.small,
                    child: const Text('Ignore'),
                  ),
                ],
              ),
            ],
            if (showExecute) ...[
              const SizedBox(height: 10),
              OpenCodeButton(
                onPressed: () => _execute(id, title),
                variant: OpenCodeButtonVariant.primary,
                size: OpenCodeButtonSize.small,
                icon: Icons.rocket_launch_outlined,
                child: const Text('Launch Dev Cycle'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
