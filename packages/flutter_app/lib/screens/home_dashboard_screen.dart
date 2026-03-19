import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/models.dart';
import '../state/app_state.dart';
import '../theme/button_style.dart';
import '../theme/oc2_colors.dart';
import '../widgets/opencode_button.dart';
import 'learnings_screen.dart';
import 'opportunities_screen.dart';
import 'reports_screen.dart';

class HomeDashboardScreen extends StatefulWidget {
  const HomeDashboardScreen({super.key});

  @override
  State<HomeDashboardScreen> createState() => _HomeDashboardScreenState();
}

class _HomeDashboardScreenState extends State<HomeDashboardScreen> {
  ServerStatus? _status;
  List<Map<String, dynamic>>? _reports;
  List<Map<String, dynamic>>? _learnings;
  Map<String, dynamic>? _oppStats;
  List<Map<String, dynamic>>? _pendingProposals;
  List<Map<String, dynamic>>? _pendingSubmissions;
  bool _loading = true;

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
      srv.status(),
      srv.reports(limit: 5),
      srv.learnings(limit: 5),
      srv.opportunitiesStats(),
      srv.proposals(),
      srv.submissions(status: 'pending-approval', limit: 5),
    ]);

    if (!mounted) return;

    final proposals = results[4] as List<Map<String, dynamic>>?;
    final pending = proposals?.where((p) => p['status'] == 'pending').toList();

    setState(() {
      _status = results[0] as ServerStatus?;
      _reports = results[1] as List<Map<String, dynamic>>?;
      _learnings = results[2] as List<Map<String, dynamic>>?;
      _oppStats = results[3] as Map<String, dynamic>?;
      _pendingProposals = pending;
      _pendingSubmissions = results[5] as List<Map<String, dynamic>>?;
      _loading = false;
    });
  }

  Future<void> _proposalAction(String id, bool approve) async {
    final srv = context.read<AppState>().server;
    if (srv == null) return;
    final ok = approve ? await srv.proposalApprove(id) : await srv.proposalReject(id);
    if (!mounted) return;
    if (ok) await _load();
  }

  Future<void> _submissionAction(String id, bool approve) async {
    final srv = context.read<AppState>().server;
    if (srv == null) return;
    final ok = approve ? await srv.submissionApprove(id) : await srv.submissionReject(id);
    if (!mounted) return;
    if (ok) await _load();
  }

  @override
  Widget build(BuildContext context) {
    final palette = _palette;

    if (_loading) {
      return Container(
        color: palette.backgroundBase,
        child: const Center(child: CircularProgressIndicator()),
      );
    }

    return Container(
      color: palette.backgroundBase,
      child: SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text('Home', style: Theme.of(context).textTheme.headlineMedium),
              ),
              OpenCodeButton(
                onPressed: _load,
                variant: OpenCodeButtonVariant.secondary,
                icon: Icons.refresh,
                child: const Text('Refresh'),
              ),
            ],
          ),
          const SizedBox(height: 20),
          _MetricsRow(status: _status, palette: palette),
          const SizedBox(height: 20),
          _PendingActionsSection(
            proposals: _pendingProposals,
            submissions: _pendingSubmissions,
            palette: palette,
            onProposalAction: _proposalAction,
            onSubmissionAction: _submissionAction,
          ),
          const SizedBox(height: 20),
          _ReportsSection(reports: _reports, palette: palette),
          const SizedBox(height: 20),
          _LearningsSection(learnings: _learnings, palette: palette),
          const SizedBox(height: 20),
          _OpportunityFunnelSection(stats: _oppStats, palette: palette),
          const SizedBox(height: 24),
        ],
      ),
    ));
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Metrics row
// ──────────────────────────────────────────────────────────────────────────────

class _MetricsRow extends StatelessWidget {
  const _MetricsRow({required this.status, required this.palette});
  final ServerStatus? status;
  final Oc2Palette palette;

  @override
  Widget build(BuildContext context) {
    if (status == null) return const SizedBox.shrink();
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            _chip(context, 'Pipelines', '${status!.pipelinesEnabled ?? 0} on', Colors.green),
            _chip(context, 'Jobs', '${status!.jobsRunning ?? 0} running', Colors.blue),
            _chip(context, 'Proposals', '${status!.proposalsPending ?? 0} pending', Colors.orange),
          ],
        ),
      ),
    );
  }

  Widget _chip(BuildContext context, String label, String value, Color color) {
    return Column(
      children: [
        Text(value, style: TextStyle(fontWeight: FontWeight.bold, color: color, fontSize: 15)),
        Text(label, style: TextStyle(fontSize: 11, color: palette.textWeak)),
      ],
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Pending actions
// ──────────────────────────────────────────────────────────────────────────────

class _PendingActionsSection extends StatelessWidget {
  const _PendingActionsSection({
    required this.proposals,
    required this.submissions,
    required this.palette,
    required this.onProposalAction,
    required this.onSubmissionAction,
  });
  final List<Map<String, dynamic>>? proposals;
  final List<Map<String, dynamic>>? submissions;
  final Oc2Palette palette;
  final Future<void> Function(String id, bool approve) onProposalAction;
  final Future<void> Function(String id, bool approve) onSubmissionAction;

  bool get _hasItems =>
      (proposals != null && proposals!.isNotEmpty) ||
      (submissions != null && submissions!.isNotEmpty);

  @override
  Widget build(BuildContext context) {
    if (!_hasItems) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.hourglass_empty, size: 18),
            const SizedBox(width: 6),
            Text('Ações Pendentes', style: Theme.of(context).textTheme.titleMedium),
          ],
        ),
        const SizedBox(height: 8),
        if (proposals != null)
          ...proposals!.map((p) => _buildProposalRow(context, p)),
        if (submissions != null)
          ...submissions!.map((s) => _buildSubmissionRow(context, s)),
      ],
    );
  }

  Widget _buildProposalRow(BuildContext context, Map<String, dynamic> p) {
    final id = p['id'] as String? ?? '';
    final title = p['title'] as String? ?? id.substring(0, id.length.clamp(0, 8));
    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: ListTile(
        dense: true,
        leading: Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(color: Colors.orange.withOpacity(0.15), borderRadius: BorderRadius.circular(6)),
          child: const Text('Proposal', style: TextStyle(fontSize: 10, color: Colors.orange)),
        ),
        title: Text(title, style: const TextStyle(fontSize: 13), overflow: TextOverflow.ellipsis),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(icon: const Icon(Icons.check, color: Colors.green, size: 20), onPressed: () => onProposalAction(id, true), tooltip: 'Approve'),
            IconButton(icon: const Icon(Icons.close, color: Colors.red, size: 20), onPressed: () => onProposalAction(id, false), tooltip: 'Reject'),
          ],
        ),
      ),
    );
  }

  Widget _buildSubmissionRow(BuildContext context, Map<String, dynamic> s) {
    final id = s['id'] as String? ?? '';
    final title = s['externalUrl'] as String? ?? s['repoUrl'] as String? ?? s['submissionType'] as String? ?? id.substring(0, id.length.clamp(0, 8));
    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: ListTile(
        dense: true,
        leading: Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(color: Colors.blue.withOpacity(0.15), borderRadius: BorderRadius.circular(6)),
          child: const Text('PR', style: TextStyle(fontSize: 10, color: Colors.blue)),
        ),
        title: Text(title, style: const TextStyle(fontSize: 13), overflow: TextOverflow.ellipsis),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(icon: const Icon(Icons.check, color: Colors.green, size: 20), onPressed: () => onSubmissionAction(id, true), tooltip: 'Approve'),
            IconButton(icon: const Icon(Icons.close, color: Colors.red, size: 20), onPressed: () => onSubmissionAction(id, false), tooltip: 'Reject'),
          ],
        ),
      ),
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Reports section
// ──────────────────────────────────────────────────────────────────────────────

class _ReportsSection extends StatelessWidget {
  const _ReportsSection({required this.reports, required this.palette});
  final List<Map<String, dynamic>>? reports;
  final Oc2Palette palette;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.bar_chart, size: 18),
            const SizedBox(width: 6),
            Expanded(child: Text('Relatórios Recentes', style: Theme.of(context).textTheme.titleMedium)),
            TextButton(
              onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const ReportsScreen())),
              child: const Text('View all →'),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (reports == null || reports!.isEmpty)
          Text('Nenhum relatório', style: TextStyle(color: palette.textWeak, fontSize: 13))
        else
          ...reports!.map((r) => _buildRow(context, r)),
      ],
    );
  }

  Widget _buildRow(BuildContext context, Map<String, dynamic> r) {
    final type = r['reportType'] as String? ?? 'report';
    final createdAt = r['createdAt'];
    final digest = r['digest'] as String? ?? '';
    final oppCount = r['oppCount'];
    final preview = digest.length > 120 ? '${digest.substring(0, 120)}…' : digest;

    String dateStr = '-';
    if (createdAt is int) {
      final dt = DateTime.fromMillisecondsSinceEpoch(createdAt * 1000).toLocal();
      dateStr = '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')}';
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(color: Colors.blue.withOpacity(0.15), borderRadius: BorderRadius.circular(6)),
                  child: Text(type, style: const TextStyle(fontSize: 10, color: Colors.blue, fontWeight: FontWeight.w600)),
                ),
                const SizedBox(width: 8),
                Text(dateStr, style: const TextStyle(fontSize: 13)),
                if (oppCount != null) ...[
                  const SizedBox(width: 8),
                  Text('$oppCount opps', style: TextStyle(fontSize: 12, color: palette.textWeak)),
                ],
              ],
            ),
            if (preview.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(preview, style: TextStyle(fontSize: 12, color: palette.textWeak)),
            ],
          ],
        ),
      ),
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Learnings section
// ──────────────────────────────────────────────────────────────────────────────

class _LearningsSection extends StatelessWidget {
  const _LearningsSection({required this.learnings, required this.palette});
  final List<Map<String, dynamic>>? learnings;
  final Oc2Palette palette;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.psychology, size: 18),
            const SizedBox(width: 6),
            Expanded(child: Text('Learnings', style: Theme.of(context).textTheme.titleMedium)),
            TextButton(
              onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const LearningsScreen())),
              child: const Text('View all →'),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (learnings == null || learnings!.isEmpty)
          Text('Nenhum learning', style: TextStyle(color: palette.textWeak, fontSize: 13))
        else
          ...learnings!.map((l) => _buildRow(context, l)),
      ],
    );
  }

  Widget _buildRow(BuildContext context, Map<String, dynamic> l) {
    final category = l['category'] as String? ?? 'learning';
    final title = l['title'] as String? ?? l['key'] as String? ?? '';

    Color catColor;
    switch (category) {
      case 'skill':
        catColor = Colors.blue;
      case 'niche':
        catColor = Colors.purple;
      case 'pattern':
        catColor = Colors.orange;
      default:
        catColor = Colors.teal;
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: ListTile(
        dense: true,
        leading: Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(color: catColor.withOpacity(0.15), borderRadius: BorderRadius.circular(6)),
          child: Text(category, style: TextStyle(fontSize: 10, color: catColor, fontWeight: FontWeight.w600)),
        ),
        title: Text(title, style: const TextStyle(fontSize: 13), overflow: TextOverflow.ellipsis),
      ),
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Opportunity funnel section
// ──────────────────────────────────────────────────────────────────────────────

class _OpportunityFunnelSection extends StatelessWidget {
  const _OpportunityFunnelSection({required this.stats, required this.palette});
  final Map<String, dynamic>? stats;
  final Oc2Palette palette;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.filter_alt, size: 18),
            const SizedBox(width: 6),
            Expanded(child: Text('Funil de Oportunidades', style: Theme.of(context).textTheme.titleMedium)),
            TextButton(
              onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const OpportunitiesScreen())),
              child: const Text('View all →'),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (stats == null)
          Text('Sem dados', style: TextStyle(color: palette.textWeak, fontSize: 13))
        else
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _funnelChip('new', _byStatus('new'), Colors.blue),
                      _funnelChip('scored', _byStatus('scored'), Colors.orange),
                      _funnelChip('shortlisted', _byStatus('shortlisted'), Colors.purple),
                      _funnelChip('applied', _byStatus('applied'), Colors.teal),
                      _funnelChip('won', _byStatus('won'), Colors.green),
                    ],
                  ),
                  if (stats!['avg_score'] != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      'avg score: ${stats!['avg_score']}',
                      style: TextStyle(fontSize: 12, color: palette.textWeak),
                    ),
                  ],
                ],
              ),
            ),
          ),
      ],
    );
  }

  int _byStatus(String status) {
    final m = stats!['by_status'];
    if (m is Map) return (m[status] as num?)?.toInt() ?? 0;
    return 0;
  }

  Widget _funnelChip(String label, dynamic count, Color color) {
    return Column(
      children: [
        Text('$count', style: TextStyle(fontWeight: FontWeight.bold, color: color, fontSize: 16)),
        Text(label, style: TextStyle(fontSize: 10, color: palette.textWeak)),
      ],
    );
  }
}
