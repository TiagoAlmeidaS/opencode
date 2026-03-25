import 'dart:math' show exp, min, max;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import '../api/models.dart';
import '../state/app_state.dart';
import '../theme/button_style.dart';
import '../theme/kinetic_tokens.dart';
import '../theme/oc2_colors.dart';
import '../widgets/kinetic_button.dart';
import '../widgets/kinetic_glass_panel.dart';
import '../widgets/kinetic_log_row.dart';
import '../widgets/kinetic_ui.dart';
import '../widgets/opencode_button.dart';
import 'learnings_screen.dart';
import 'llm_settings_screen.dart';
import 'logs_screen.dart';
import 'opportunities_screen.dart';
import 'queue_monitor_screen.dart';
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
  List<Map<String, dynamic>>? _daemonLogs;
  bool _loading = true;
  bool _syncing = false;
  int? _latencyMs;

  Oc2Palette get _oc2 =>
      Theme.of(context).brightness == Brightness.dark ? Oc2Colors.dark : Oc2Colors.light;

  bool get _kinetic => Theme.of(context).brightness == Brightness.dark;

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

    final sw = Stopwatch()..start();
    final status = await srv.status();
    sw.stop();
    _latencyMs = sw.elapsedMilliseconds;

    final results = await Future.wait([
      Future.value(status),
      srv.reports(limit: 5),
      srv.learnings(limit: 5),
      srv.opportunitiesStats(),
      srv.proposals(),
      srv.submissions(status: 'pending-approval', limit: 5),
      srv.logs(limit: 8),
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
      _daemonLogs = results[6] as List<Map<String, dynamic>>?;
      _loading = false;
    });
  }

  Future<void> _syncAll() async {
    final srv = context.read<AppState>().server;
    if (srv == null) return;
    setState(() => _syncing = true);
    await srv.pipelinesRunAllEnabled();
    if (!mounted) return;
    setState(() => _syncing = false);
    await _load();
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

  double? _uptimeSla(ServerStatus? s) {
    final t = s?.serverStartedAt;
    if (t == null) return null;
    final elapsed = DateTime.now().millisecondsSinceEpoch ~/ 1000 - t;
    if (elapsed < 30) return null;
    return min(99.999, 99.0 + (1 - exp(-elapsed / (14.0 * 86400))) * 0.999);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final bg = _kinetic ? KineticTokens.background : _oc2.backgroundBase;

    if (_loading) {
      return Container(
        color: bg,
        child: Center(child: CircularProgressIndicator(color: scheme.primary)),
      );
    }

    if (_kinetic) {
      return Container(
        color: bg,
        child: Stack(
          children: [
            Positioned(
              top: -80,
              left: -60,
              child: IgnorePointer(
                child: Container(
                  width: 200,
                  height: 200,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: KineticTokens.primaryContainer.withValues(alpha: 0.05),
                  ),
                ),
              ),
            ),
            Positioned(
              bottom: -40,
              right: -40,
              child: IgnorePointer(
                child: Container(
                  width: 180,
                  height: 180,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: KineticTokens.secondaryContainer.withValues(alpha: 0.05),
                  ),
                ),
              ),
            ),
            SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          'OpenCode',
                          style: GoogleFonts.spaceGrotesk(
                            fontSize: 22,
                            fontWeight: FontWeight.w700,
                            color: KineticTokens.primary,
                          ),
                        ),
                      ),
                      OpenCodeButton(
                        onPressed: _load,
                        variant: OpenCodeButtonVariant.ghost,
                        icon: Icons.refresh,
                        child: const Text('Refresh'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  _KineticHero(
                    status: _status,
                    latencyMs: _latencyMs,
                    uptimePercent: _uptimeSla(_status),
                    onSync: _syncing ? null : _syncAll,
                    syncing: _syncing,
                  ),
                  const SizedBox(height: 20),
                  _KineticQuickGrid(
                    onQueue: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(builder: (_) => const QueueMonitorScreen()),
                    ),
                    onVault: () {
                      final dir = context.read<AppState>().activeDirectory;
                      if (dir == null) return;
                      Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => LlmSettingsScreen(catalogDirectory: dir),
                        ),
                      );
                    },
                  ),
                  const SizedBox(height: 24),
                  _KineticLogsSection(logs: _daemonLogs),
                  const SizedBox(height: 20),
                  _PendingActionsSection(
                    proposals: _pendingProposals,
                    submissions: _pendingSubmissions,
                    palette: _oc2,
                    kinetic: true,
                    onProposalAction: _proposalAction,
                    onSubmissionAction: _submissionAction,
                  ),
                  const SizedBox(height: 20),
                  _ReportsSection(reports: _reports, palette: _oc2, kinetic: true),
                  const SizedBox(height: 20),
                  _LearningsSection(learnings: _learnings, palette: _oc2, kinetic: true),
                  const SizedBox(height: 20),
                  _OpportunityFunnelSection(stats: _oppStats, palette: _oc2, kinetic: true),
                  const SizedBox(height: 24),
                ],
              ),
            ),
          ],
        ),
      );
    }

    return Container(
      color: bg,
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
            _MetricsRow(status: _status, palette: _oc2),
            const SizedBox(height: 20),
            _PendingActionsSection(
              proposals: _pendingProposals,
              submissions: _pendingSubmissions,
              palette: _oc2,
              kinetic: false,
              onProposalAction: _proposalAction,
              onSubmissionAction: _submissionAction,
            ),
            const SizedBox(height: 20),
            _ReportsSection(reports: _reports, palette: _oc2, kinetic: false),
            const SizedBox(height: 20),
            _LearningsSection(learnings: _learnings, palette: _oc2, kinetic: false),
            const SizedBox(height: 20),
            _OpportunityFunnelSection(stats: _oppStats, palette: _oc2, kinetic: false),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}

String _kineticLoadLine(ServerStatus? s) {
  final avg = s?.jobsPerHourAvg12h;
  final li = s?.loadIndex;
  if (avg != null) return '${avg.toStringAsFixed(1)} jobs/h';
  if (li != null) return '${li.toStringAsFixed(2)} load';
  final r = s?.jobsRunning ?? 0;
  if (r > 0) return '$r running';
  return '—';
}

class _KineticHero extends StatelessWidget {
  const _KineticHero({
    required this.status,
    required this.latencyMs,
    required this.uptimePercent,
    required this.onSync,
    required this.syncing,
  });

  final ServerStatus? status;
  final int? latencyMs;
  final double? uptimePercent;
  final VoidCallback? onSync;
  final bool syncing;

  @override
  Widget build(BuildContext context) {
    final raw = status?.jobsCompletedLast12h ?? const <int>[];
    final buckets = List<int>.generate(12, (i) => i < raw.length ? raw[i] : 0);
    final mx = buckets.isEmpty ? 1 : max(1, buckets.reduce(max));
    final slot = buckets.isEmpty
        ? 0
        : min(
            max(status?.chartHighlightSlot ?? buckets.length - 1, 0),
            buckets.length - 1,
          );
    final loadStr = _kineticLoadLine(status);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'SYSTEM CORE',
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 10,
                      color: KineticTokens.primaryFixedDim.withValues(alpha: 0.7),
                      letterSpacing: 2,
                    ),
                  ),
                  Text(
                    'OPERATIONAL',
                    style: GoogleFonts.spaceGrotesk(
                      fontSize: 28,
                      fontWeight: FontWeight.w700,
                      color: KineticTokens.primaryContainer,
                      shadows: [
                        Shadow(
                          color: KineticTokens.primaryContainer.withValues(alpha: 0.35),
                          blurRadius: 8,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  'UPTIME',
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 10,
                    color: KineticTokens.onSurfaceVariant,
                    letterSpacing: 1,
                  ),
                ),
                Text(
                  uptimePercent != null ? '${uptimePercent!.toStringAsFixed(3)}%' : '—',
                  style: GoogleFonts.spaceGrotesk(
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                    color: KineticTokens.onSurface,
                  ),
                ),
              ],
            ),
          ],
        ),
        const SizedBox(height: 12),
        KineticGlassPanel(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: KineticTokens.primaryContainer,
                      boxShadow: [
                        BoxShadow(
                          color: KineticTokens.primaryContainer.withValues(alpha: 0.5),
                          blurRadius: 6,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              SizedBox(
                height: 120,
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: buckets.asMap().entries.map((e) {
                    final i = e.key;
                    final n = e.value;
                    final h = 0.15 + 0.85 * (n / mx);
                    final cur = i == slot;
                    final base = cur
                        ? KineticTokens.primaryContainer
                        : KineticTokens.primaryContainer.withValues(alpha: 0.45);
                    return Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 1),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          height: 110 * h,
                          decoration: BoxDecoration(
                            color: cur
                                ? base.withValues(alpha: 0.55 + 0.45 * (n / mx))
                                : base.withValues(alpha: 0.06 + 0.2 * (n / mx)),
                            borderRadius: const BorderRadius.vertical(top: Radius.circular(3)),
                            boxShadow: cur
                                ? [
                                    BoxShadow(
                                      color: KineticTokens.primaryContainer.withValues(alpha: 0.25),
                                      blurRadius: 8,
                                      spreadRadius: 0,
                                    ),
                                  ]
                                : null,
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ),
              const SizedBox(height: 16),
              Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'LOAD',
                            style: GoogleFonts.jetBrainsMono(
                              fontSize: 10,
                              color: KineticTokens.onSurfaceVariant,
                              letterSpacing: 1,
                            ),
                          ),
                          Text(
                            loadStr,
                            style: GoogleFonts.spaceGrotesk(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: KineticTokens.primary,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(width: 20),
                      Container(width: 1, height: 32, color: KineticTokens.outlineVariant.withValues(alpha: 0.35)),
                      const SizedBox(width: 16),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'LATENCY',
                            style: GoogleFonts.jetBrainsMono(
                              fontSize: 10,
                              color: KineticTokens.onSurfaceVariant,
                              letterSpacing: 1,
                            ),
                          ),
                          Text(
                            latencyMs != null ? '${latencyMs}ms' : '—',
                            style: GoogleFonts.spaceGrotesk(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: KineticTokens.primary,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Align(
                    alignment: Alignment.centerRight,
                    child: KineticPrimaryButton(
                      label: syncing ? 'SYNCING…' : 'RE-SYNC ALL NODES',
                      onPressed: onSync,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _KineticQuickGrid extends StatelessWidget {
  const _KineticQuickGrid({required this.onQueue, required this.onVault});

  final VoidCallback onQueue;
  final VoidCallback onVault;

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 14,
      crossAxisSpacing: 14,
      childAspectRatio: 1,
      children: [
        _tile(Icons.account_tree, 'NODE CLUSTER', 'Pipelines & queue', onQueue),
        _tile(Icons.security, 'VAULT AUTH', 'LLM & secrets', onVault),
      ],
    );
  }

  Widget _tile(IconData icon, String title, String subtitle, VoidCallback onTap) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(KineticTokens.radiusLg),
        child: KineticGlassPanel(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Icon(icon, size: 32, color: KineticTokens.primaryContainer),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: GoogleFonts.spaceGrotesk(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: KineticTokens.onSurface,
                    ),
                  ),
                  Text(
                    subtitle,
                    style: GoogleFonts.inter(fontSize: 11, color: KineticTokens.onSurfaceVariant),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _KineticLogsSection extends StatelessWidget {
  const _KineticLogsSection({required this.logs});

  final List<Map<String, dynamic>>? logs;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'SYSTEM LOGS',
              style: GoogleFonts.spaceGrotesk(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: KineticTokens.onSurface,
                letterSpacing: 0.5,
              ),
            ),
            TextButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => const LogsScreen()),
              ),
              child: Text(
                'View All',
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 10,
                  color: KineticTokens.primaryContainer,
                  decoration: TextDecoration.underline,
                  decorationColor: KineticTokens.primaryContainer.withValues(alpha: 0.35),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        if (logs == null || logs!.isEmpty)
          Text(
            'No daemon logs yet.',
            style: GoogleFonts.inter(fontSize: 13, color: KineticTokens.onSurfaceVariant),
          )
        else
          ...logs!.map((row) {
            final level = row['level'] as String? ?? 'info';
            final msg = row['message'] as String? ?? '';
            final created = row['createdAt'] ?? row['created_at'];
            final ts = created is num ? created.toInt() : 0;
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: KineticLogRow.fromLevel(level: level, createdAtUnix: ts, message: msg),
            );
          }),
      ],
    );
  }
}

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

class _PendingActionsSection extends StatelessWidget {
  const _PendingActionsSection({
    required this.proposals,
    required this.submissions,
    required this.palette,
    required this.kinetic,
    required this.onProposalAction,
    required this.onSubmissionAction,
  });
  final List<Map<String, dynamic>>? proposals;
  final List<Map<String, dynamic>>? submissions;
  final Oc2Palette palette;
  final bool kinetic;
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
            Icon(Icons.hourglass_empty, size: 18, color: kinetic ? KineticTokens.onSurfaceVariant : null),
            const SizedBox(width: 6),
            Text(
              'Ações Pendentes',
              style: kinetic
                  ? GoogleFonts.spaceGrotesk(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: KineticTokens.onSurface,
                    )
                  : Theme.of(context).textTheme.titleMedium,
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (proposals != null) ...proposals!.map((p) => _buildProposalRow(context, p)),
        if (submissions != null) ...submissions!.map((s) => _buildSubmissionRow(context, s)),
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
          decoration: BoxDecoration(color: Colors.orange.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(6)),
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
          decoration: BoxDecoration(color: Colors.blue.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(6)),
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

class _ReportsSection extends StatelessWidget {
  const _ReportsSection({required this.reports, required this.palette, required this.kinetic});
  final List<Map<String, dynamic>>? reports;
  final Oc2Palette palette;
  final bool kinetic;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.bar_chart, size: 18, color: kinetic ? KineticTokens.onSurfaceVariant : null),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                kinetic ? 'RELATÓRIOS RECENTES' : 'Relatórios Recentes',
                style: kinetic
                    ? GoogleFonts.spaceGrotesk(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: KineticTokens.onSurface,
                        letterSpacing: 0.6,
                      )
                    : Theme.of(context).textTheme.titleMedium,
              ),
            ),
            TextButton(
              onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const ReportsScreen())),
              child: kinetic
                  ? Text(
                      'VIEW ALL',
                      style: GoogleFonts.jetBrainsMono(
                        fontSize: 10,
                        color: KineticTokens.primaryContainer,
                        decoration: TextDecoration.underline,
                        decorationColor: KineticTokens.primaryContainer.withValues(alpha: 0.35),
                      ),
                    )
                  : const Text('View all →'),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (reports == null || reports!.isEmpty)
          Text(
            'Nenhum relatório',
            style: kinetic
                ? GoogleFonts.inter(fontSize: 13, color: KineticTokens.onSurfaceVariant)
                : TextStyle(color: palette.textWeak, fontSize: 13),
          )
        else
          ...reports!.map((r) => _buildRow(context, r, kinetic)),
      ],
    );
  }

  Widget _buildRow(BuildContext context, Map<String, dynamic> r, bool kinetic) {
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

    final inner = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: kinetic
                    ? KineticTokens.primaryContainer.withValues(alpha: 0.12)
                    : Colors.blue.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(6),
                border: kinetic ? Border.all(color: KineticTokens.primaryContainer.withValues(alpha: 0.35)) : null,
              ),
              child: Text(
                type.toUpperCase(),
                style: kinetic
                    ? GoogleFonts.jetBrainsMono(
                        fontSize: 10,
                        color: KineticTokens.primaryFixedDim,
                        fontWeight: FontWeight.w600,
                      )
                    : const TextStyle(fontSize: 10, color: Colors.blue, fontWeight: FontWeight.w600),
              ),
            ),
            const SizedBox(width: 8),
            Text(
              dateStr,
              style: kinetic
                  ? GoogleFonts.jetBrainsMono(fontSize: 11, color: KineticTokens.onSurfaceVariant)
                  : const TextStyle(fontSize: 13),
            ),
            if (oppCount != null) ...[
              const SizedBox(width: 8),
              Text(
                '$oppCount opps',
                style: TextStyle(
                  fontSize: 12,
                  color: kinetic ? KineticTokens.onSurfaceVariant : palette.textWeak,
                ),
              ),
            ],
          ],
        ),
        if (preview.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(
            preview,
            style: kinetic
                ? GoogleFonts.inter(fontSize: 12, height: 1.4, color: KineticTokens.onSurfaceVariant)
                : TextStyle(fontSize: 12, color: palette.textWeak),
          ),
        ],
      ],
    );

    if (kinetic) {
      return KineticGlassCard(marginBottom: 10, child: inner);
    }
    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: inner,
      ),
    );
  }
}

class _LearningsSection extends StatelessWidget {
  const _LearningsSection({required this.learnings, required this.palette, required this.kinetic});
  final List<Map<String, dynamic>>? learnings;
  final Oc2Palette palette;
  final bool kinetic;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.psychology, size: 18, color: kinetic ? KineticTokens.onSurfaceVariant : null),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                kinetic ? 'LEARNINGS' : 'Learnings',
                style: kinetic
                    ? GoogleFonts.spaceGrotesk(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: KineticTokens.onSurface,
                        letterSpacing: 0.6,
                      )
                    : Theme.of(context).textTheme.titleMedium,
              ),
            ),
            TextButton(
              onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const LearningsScreen())),
              child: kinetic
                  ? Text(
                      'VIEW ALL',
                      style: GoogleFonts.jetBrainsMono(
                        fontSize: 10,
                        color: KineticTokens.primaryContainer,
                        decoration: TextDecoration.underline,
                        decorationColor: KineticTokens.primaryContainer.withValues(alpha: 0.35),
                      ),
                    )
                  : const Text('View all →'),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (learnings == null || learnings!.isEmpty)
          Text(
            'Nenhum learning',
            style: kinetic
                ? GoogleFonts.inter(fontSize: 13, color: KineticTokens.onSurfaceVariant)
                : TextStyle(color: palette.textWeak, fontSize: 13),
          )
        else
          ...learnings!.map((l) => _buildRow(context, l, kinetic)),
      ],
    );
  }

  Widget _buildRow(BuildContext context, Map<String, dynamic> l, bool kinetic) {
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

    if (kinetic) {
      return KineticGlassCard(
        marginBottom: 10,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: catColor.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: catColor.withValues(alpha: 0.45)),
              ),
              child: Text(
                category.toUpperCase(),
                style: GoogleFonts.jetBrainsMono(fontSize: 10, color: catColor, fontWeight: FontWeight.w600),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                title,
                style: GoogleFonts.spaceGrotesk(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: KineticTokens.onSurface,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      );
    }
    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: ListTile(
        dense: true,
        leading: Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(color: catColor.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(6)),
          child: Text(category, style: TextStyle(fontSize: 10, color: catColor, fontWeight: FontWeight.w600)),
        ),
        title: Text(title, style: const TextStyle(fontSize: 13), overflow: TextOverflow.ellipsis),
      ),
    );
  }
}

class _OpportunityFunnelSection extends StatelessWidget {
  const _OpportunityFunnelSection({required this.stats, required this.palette, required this.kinetic});
  final Map<String, dynamic>? stats;
  final Oc2Palette palette;
  final bool kinetic;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.filter_alt, size: 18, color: kinetic ? KineticTokens.onSurfaceVariant : null),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                kinetic ? 'FUNIL DE OPORTUNIDADES' : 'Funil de Oportunidades',
                style: kinetic
                    ? GoogleFonts.spaceGrotesk(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: KineticTokens.onSurface,
                        letterSpacing: 0.5,
                      )
                    : Theme.of(context).textTheme.titleMedium,
              ),
            ),
            TextButton(
              onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const OpportunitiesScreen())),
              child: kinetic
                  ? Text(
                      'VIEW ALL',
                      style: GoogleFonts.jetBrainsMono(
                        fontSize: 10,
                        color: KineticTokens.primaryContainer,
                        decoration: TextDecoration.underline,
                        decorationColor: KineticTokens.primaryContainer.withValues(alpha: 0.35),
                      ),
                    )
                  : const Text('View all →'),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (stats == null)
          Text(
            'Sem dados',
            style: kinetic
                ? GoogleFonts.inter(fontSize: 13, color: KineticTokens.onSurfaceVariant)
                : TextStyle(color: palette.textWeak, fontSize: 13),
          )
        else
          kinetic
              ? KineticGlassPanel(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceAround,
                        children: [
                          _funnelChip('new', _byStatus('new'), Colors.blue, kinetic),
                          _funnelChip('scored', _byStatus('scored'), Colors.orange, kinetic),
                          _funnelChip('shortlisted', _byStatus('shortlisted'), Colors.purple, kinetic),
                          _funnelChip('applied', _byStatus('applied'), Colors.teal, kinetic),
                          _funnelChip('won', _byStatus('won'), Colors.green, kinetic),
                        ],
                      ),
                      if (stats!['avg_score'] != null) ...[
                        const SizedBox(height: 10),
                        Text(
                          'avg score: ${stats!['avg_score']}',
                          style: GoogleFonts.jetBrainsMono(fontSize: 11, color: KineticTokens.onSurfaceVariant),
                        ),
                      ],
                    ],
                  ),
                )
              : Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceAround,
                          children: [
                            _funnelChip('new', _byStatus('new'), Colors.blue, false),
                            _funnelChip('scored', _byStatus('scored'), Colors.orange, false),
                            _funnelChip('shortlisted', _byStatus('shortlisted'), Colors.purple, false),
                            _funnelChip('applied', _byStatus('applied'), Colors.teal, false),
                            _funnelChip('won', _byStatus('won'), Colors.green, false),
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

  Widget _funnelChip(String label, dynamic count, Color color, bool kinetic) {
    return Column(
      children: [
        Text(
          '$count',
          style: kinetic
              ? GoogleFonts.spaceGrotesk(fontWeight: FontWeight.w700, color: color, fontSize: 17)
              : TextStyle(fontWeight: FontWeight.bold, color: color, fontSize: 16),
        ),
        Text(
          label,
          style: kinetic
              ? GoogleFonts.jetBrainsMono(fontSize: 9, color: KineticTokens.onSurfaceVariant, letterSpacing: 0.5)
              : TextStyle(fontSize: 10, color: palette.textWeak),
        ),
      ],
    );
  }
}
