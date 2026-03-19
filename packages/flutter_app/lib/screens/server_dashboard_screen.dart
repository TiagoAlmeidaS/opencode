import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../theme/button_style.dart';
import '../theme/oc2_colors.dart';
import '../widgets/opencode_button.dart';
import 'repo_jobs_screen.dart';

class ServerDashboardScreen extends StatefulWidget {
  const ServerDashboardScreen({super.key});

  @override
  State<ServerDashboardScreen> createState() => _ServerDashboardScreenState();
}

class _ServerDashboardScreenState extends State<ServerDashboardScreen> {
  List<Map<String, dynamic>>? _pipelines;
  List<Map<String, dynamic>>? _jobs;
  List<Map<String, dynamic>>? _goals;
  List<Map<String, dynamic>>? _proposals;
  Map<String, dynamic>? _metrics;
  List<Map<String, dynamic>>? _discovery;
  List<Map<String, dynamic>>? _repoJobs;
  List<Map<String, dynamic>>? _chunks;

  final _memQ = TextEditingController();
  final _idea = TextEditingController();
  final _repoIssueName = TextEditingController();
  final _repoFull = TextEditingController();
  final _repoLabel = TextEditingController(text: 'agent');
  final _repoCron = TextEditingController(text: '0 8,14,20 * * *');
  final _repoMaxDay = TextEditingController(text: '3');
  final _repoMaxIssues = TextEditingController(text: '3');
  bool _repoRequirePassTests = true;
  bool _loading = true;
  bool _memBusy = false;
  bool _discBusy = false;

  Oc2Palette get _palette =>
      Theme.of(context).brightness == Brightness.dark ? Oc2Colors.dark : Oc2Colors.light;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _memQ.dispose();
    _idea.dispose();
    _repoIssueName.dispose();
    _repoFull.dispose();
    _repoLabel.dispose();
    _repoCron.dispose();
    _repoMaxDay.dispose();
    _repoMaxIssues.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final srv = context.read<AppState>().server;
    if (srv == null) { setState(() => _loading = false); return; }

    final results = await Future.wait([
      srv.pipelines(),
      srv.jobs(),
      srv.goals(),
      srv.proposals(),
      srv.dashboard(),
      srv.discovery(limit: 20),
      srv.repoIssueJobs(limit: 8),
    ]);
    if (!mounted) return;

    setState(() {
      _pipelines  = results[0] as List<Map<String, dynamic>>?;
      _jobs       = results[1] as List<Map<String, dynamic>>?;
      _goals      = results[2] as List<Map<String, dynamic>>?;
      _proposals  = results[3] as List<Map<String, dynamic>>?;
      _metrics    = results[4] as Map<String, dynamic>?;
      _discovery  = results[5] as List<Map<String, dynamic>>?;
      _repoJobs   = results[6] as List<Map<String, dynamic>>?;
      _loading    = false;
    });
  }

  Future<void> _togglePipeline(String id, bool enable) async {
    final srv = context.read<AppState>().server;
    if (srv == null) return;
    final ok = enable
        ? await srv.pipelineEnable(id)
        : await srv.pipelineDisable(id);
    if (!mounted) return;
    if (ok) {
      await _load();
      await context.read<AppState>().refreshServerStatus();
    }
  }

  Future<void> _runPipeline(String id) async {
    final srv = context.read<AppState>().server;
    if (srv == null) return;
    final r = await srv.pipelineRun(id);
    if (!mounted) return;
    final msg = r == null
        ? 'Run failed (HTTP)'
        : r['ok'] == true
            ? 'Started job ${r['jobId'] ?? ''}'
            : (r['error']?.toString() ?? 'Run failed');
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
    await _load();
  }

  Future<void> _editDailyCap(String id, int current) async {
    final ctrl = TextEditingController(text: '$current');
    final n = await showDialog<int?>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Max runs per day (UTC)'),
        content: TextField(
          controller: ctrl,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(hintText: '0 = unlimited'),
          autofocus: true,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, int.tryParse(ctrl.text.trim()) ?? 0),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    ctrl.dispose();
    if (n == null || !mounted) return;
    await context.read<AppState>().server?.pipelinePatch(id, maxRuns: n.clamp(0, 500));
    if (mounted) await _load();
  }

  Future<void> _proposalAction(String id, bool approve) async {
    final srv = context.read<AppState>().server;
    if (srv == null) return;
    final ok = approve
        ? await srv.proposalApprove(id)
        : await srv.proposalReject(id);
    if (mounted && ok) await _load();
  }

  Future<void> _searchMem() async {
    final q = _memQ.text.trim();
    if (q.isEmpty) return;
    final srv = context.read<AppState>().server;
    if (srv == null) return;
    setState(() => _memBusy = true);
    final raw = await srv.memory(q, limit: 8);
    if (!mounted) return;
    final list = raw?['chunks'];
    setState(() {
      _memBusy = false;
      _chunks = list is List
          ? list.map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{}).toList()
          : [];
    });
  }

  Future<void> _enqueueDiscovery() async {
    final t = _idea.text.trim();
    if (t.isEmpty) return;
    final srv = context.read<AppState>().server;
    if (srv == null) return;
    setState(() => _discBusy = true);
    await srv.discoveryEnqueue(t, trigger: false);
    _idea.clear();
    if (!mounted) return;
    final disc = await srv.discovery(limit: 20);
    setState(() { _discBusy = false; _discovery = disc; });
  }

  Future<void> _createRepoIssuePipeline() async {
    final name = _repoIssueName.text.trim();
    final repo = _repoFull.text.trim();
    if (name.isEmpty || repo.isEmpty) return;
    final srv = context.read<AppState>().server;
    if (srv == null) return;
    final maxDay    = int.tryParse(_repoMaxDay.text.trim()) ?? 0;
    final maxIssues = int.tryParse(_repoMaxIssues.text.trim()) ?? 3;
    final row = await srv.pipelineCreate(
      name: name,
      strategy: 'repo-issue-worker',
      cron: _repoCron.text.trim().isEmpty ? '0 8 * * *' : _repoCron.text.trim(),
      maxRuns: maxDay.clamp(0, 500),
      config: {
        'repo_full_name': repo,
        'label': _repoLabel.text.trim().isEmpty ? 'agent' : _repoLabel.text.trim(),
        'max_issues_per_run': maxIssues.clamp(1, 30),
        'require_passing_tests': _repoRequirePassTests,
      },
    );
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(row != null ? 'Pipeline created' : 'Create failed')),
    );
    if (row != null) {
      _repoIssueName.clear();
      _repoFull.clear();
      await _load();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Build
  // ─────────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final palette = _palette;
    final status  = context.watch<AppState>().serverStatus;

    if (_loading) {
      return Container(
        color: palette.backgroundBase,
        child: const Center(child: CircularProgressIndicator()),
      );
    }

    return Container(
      color: palette.backgroundBase,
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Header ──────────────────────────────────────────────────────
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Server', style: Theme.of(context).textTheme.headlineMedium),
                      Text(
                        'Daemon · Pipelines · Proposals',
                        style: TextStyle(fontSize: 13, color: palette.textWeak),
                      ),
                    ],
                  ),
                ),
                OpenCodeButton(
                  onPressed: _load,
                  variant: OpenCodeButtonVariant.secondary,
                  size: OpenCodeButtonSize.small,
                  icon: Icons.refresh,
                  child: const Text('Refresh'),
                ),
              ],
            ),
            const SizedBox(height: 20),

            // ── Status chips ─────────────────────────────────────────────────
            if (status != null) ...[
              _StatusRow(status: status, metrics: _metrics, palette: palette),
              const SizedBox(height: 20),
            ],

            // ── Proposals ────────────────────────────────────────────────────
            if (_proposals != null && _proposals!.isNotEmpty) ...[
              _sectionHeader(context, 'Proposals', badge: _proposals!.length),
              const SizedBox(height: 8),
              ..._proposals!.map((p) => _ProposalCard(
                    proposal: p,
                    palette: palette,
                    onAction: _proposalAction,
                  )),
              const SizedBox(height: 20),
            ],

            // ── Pipelines ────────────────────────────────────────────────────
            if (_pipelines != null && _pipelines!.isNotEmpty) ...[
              _sectionHeader(context, 'Pipelines', badge: _pipelines!.length),
              const SizedBox(height: 8),
              ..._pipelines!.map((p) => _PipelineCard(
                    pipeline: p,
                    palette: palette,
                    onToggle: _togglePipeline,
                    onRun: _runPipeline,
                    onEditCap: _editDailyCap,
                  )),
              const SizedBox(height: 20),
            ],

            // ── Repo jobs ────────────────────────────────────────────────────
            if (_repoJobs != null && _repoJobs!.isNotEmpty) ...[
              Row(
                children: [
                  Expanded(child: _sectionHeader(context, 'Repo Jobs')),
                  TextButton(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(builder: (_) => const RepoJobsScreen()),
                    ),
                    child: const Text('View all →'),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              ..._repoJobs!.map((j) => _RepoJobCard(job: j, palette: palette)),
              const SizedBox(height: 20),
            ],

            // ── Goals ────────────────────────────────────────────────────────
            if (_goals != null && _goals!.isNotEmpty) ...[
              _sectionHeader(context, 'Goals'),
              const SizedBox(height: 8),
              Card(
                child: Column(
                  children: _goals!.take(10).map((g) {
                    final st = g['status'] as String? ?? '-';
                    return ListTile(
                      dense: true,
                      title: Text(g['name'] as String? ?? '-', style: const TextStyle(fontSize: 13)),
                      trailing: _StatusBadge(status: st),
                    );
                  }).toList(),
                ),
              ),
              const SizedBox(height: 20),
            ],

            // ── Recent jobs ──────────────────────────────────────────────────
            if (_jobs != null && _jobs!.isNotEmpty) ...[
              _sectionHeader(context, 'Recent Jobs'),
              const SizedBox(height: 8),
              Card(
                child: Column(
                  children: _jobs!.take(12).map((j) {
                    final st = j['status'] as String? ?? '-';
                    final shortId = (j['id']?.toString() ?? '-').substring(0, 8);
                    return ListTile(
                      dense: true,
                      title: Text(shortId, style: TextStyle(fontSize: 12, fontFamily: 'monospace', color: palette.textWeak)),
                      trailing: _StatusBadge(status: st),
                    );
                  }).toList(),
                ),
              ),
              const SizedBox(height: 20),
            ],

            // ── Tools (collapsible) ──────────────────────────────────────────
            _ToolsSection(
              palette: palette,
              memQ: _memQ,
              idea: _idea,
              chunks: _chunks,
              discovery: _discovery,
              memBusy: _memBusy,
              discBusy: _discBusy,
              repoIssueName: _repoIssueName,
              repoFull: _repoFull,
              repoLabel: _repoLabel,
              repoCron: _repoCron,
              repoMaxDay: _repoMaxDay,
              repoMaxIssues: _repoMaxIssues,
              repoRequirePassTests: _repoRequirePassTests,
              onRepoRequirePassTestsChanged: (v) => setState(() => _repoRequirePassTests = v),
              onSearchMem: _searchMem,
              onEnqueueDiscovery: _enqueueDiscovery,
              onCreateRepoIssuePipeline: _createRepoIssuePipeline,
            ),

            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  Widget _sectionHeader(BuildContext context, String title, {int? badge}) {
    return Row(
      children: [
        Text(title, style: Theme.of(context).textTheme.titleMedium),
        if (badge != null) ...[
          const SizedBox(width: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
            decoration: BoxDecoration(
              color: _palette.backgroundWeak,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text('$badge', style: TextStyle(fontSize: 11, color: _palette.textWeak)),
          ),
        ],
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Status row
// ─────────────────────────────────────────────────────────────────────────────

class _StatusRow extends StatelessWidget {
  const _StatusRow({required this.status, required this.metrics, required this.palette});
  final dynamic status;
  final Map<String, dynamic>? metrics;
  final Oc2Palette palette;

  @override
  Widget build(BuildContext context) {
    final revenue = _revenue(metrics);
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            _chip('${status.pipelinesEnabled ?? 0}/${status.pipelinesTotal ?? 0}', 'Pipelines', Colors.green),
            _chip('${status.jobsRunning ?? 0}', 'Running', Colors.blue),
            _chip('${status.proposalsPending ?? 0}', 'Proposals', Colors.orange),
            if (revenue != null) _chip(revenue, 'Revenue', Colors.teal),
          ],
        ),
      ),
    );
  }

  Widget _chip(String value, String label, Color color) => Column(
        children: [
          Text(value, style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: color)),
          const SizedBox(height: 2),
          Text(label, style: TextStyle(fontSize: 11, color: palette.textWeak)),
        ],
      );

  static String? _revenue(Map<String, dynamic>? m) {
    final met = m?['metrics'];
    if (met is! Map) return null;
    final rev = met['revenue'];
    if (rev is! Map) return null;
    final v = rev['total_usd'];
    return v != null ? '\$$v' : null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline card
// ─────────────────────────────────────────────────────────────────────────────

class _PipelineCard extends StatelessWidget {
  const _PipelineCard({
    required this.pipeline,
    required this.palette,
    required this.onToggle,
    required this.onRun,
    required this.onEditCap,
  });
  final Map<String, dynamic> pipeline;
  final Oc2Palette palette;
  final Future<void> Function(String id, bool enable) onToggle;
  final Future<void> Function(String id) onRun;
  final Future<void> Function(String id, int current) onEditCap;

  @override
  Widget build(BuildContext context) {
    final id       = pipeline['id'] as String? ?? '';
    final name     = pipeline['name'] as String? ?? '-';
    final strategy = pipeline['strategy'] as String? ?? '-';
    final enabled  = (pipeline['enabled'] as int?) == 1;
    final maxDay   = pipeline['maxRunsPerDay'] ?? pipeline['max_runs_per_day'];
    final cap      = maxDay is int ? maxDay : int.tryParse('$maxDay') ?? 0;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 8, height: 8,
                  margin: const EdgeInsets.only(right: 8, top: 2),
                  decoration: BoxDecoration(
                    color: enabled ? Colors.green : palette.textWeak,
                    shape: BoxShape.circle,
                  ),
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                      Text(
                        strategy + (cap > 0 ? ' · max $cap/day' : ''),
                        style: TextStyle(fontSize: 12, color: palette.textWeak),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                OpenCodeButton(
                  onPressed: () => onRun(id),
                  variant: OpenCodeButtonVariant.primary,
                  size: OpenCodeButtonSize.small,
                  icon: Icons.play_arrow,
                  child: const Text('Run'),
                ),
                OpenCodeButton(
                  onPressed: () => onToggle(id, !enabled),
                  variant: OpenCodeButtonVariant.secondary,
                  size: OpenCodeButtonSize.small,
                  child: Text(enabled ? 'Disable' : 'Enable'),
                ),
                OpenCodeButton(
                  onPressed: () => onEditCap(id, cap),
                  variant: OpenCodeButtonVariant.secondary,
                  size: OpenCodeButtonSize.small,
                  child: const Text('Cap'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Proposal card
// ─────────────────────────────────────────────────────────────────────────────

class _ProposalCard extends StatelessWidget {
  const _ProposalCard({required this.proposal, required this.palette, required this.onAction});
  final Map<String, dynamic> proposal;
  final Oc2Palette palette;
  final Future<void> Function(String id, bool approve) onAction;

  @override
  Widget build(BuildContext context) {
    final id          = proposal['id'] as String? ?? '';
    final title       = proposal['title'] as String? ?? '';
    final description = proposal['description'] as String? ?? '';
    final status      = proposal['status'] as String? ?? '-';
    final riskLevel   = proposal['riskLevel'] as String? ?? '';
    final confidence  = proposal['confidence'];
    final confPct     = confidence is num ? '${(confidence * 100).toStringAsFixed(0)}%' : null;

    final riskColor = riskLevel == 'high'
        ? Colors.red
        : riskLevel == 'medium'
            ? Colors.orange
            : Colors.green;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (title.isNotEmpty)
                        Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                      Text(
                        id.substring(0, id.length.clamp(0, 8)),
                        style: TextStyle(fontSize: 11, color: palette.textWeak, fontFamily: 'monospace'),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Wrap(
                  spacing: 4,
                  children: [
                    if (riskLevel.isNotEmpty)
                      _badge('risk: $riskLevel', riskColor),
                    if (confPct != null)
                      _badge('conf: $confPct', palette.textWeak),
                    _badge(status, palette.textWeak),
                  ],
                ),
              ],
            ),
            if (description.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                description.length > 160 ? '${description.substring(0, 160)}…' : description,
                style: TextStyle(fontSize: 12, color: palette.textWeak),
              ),
            ],
            if (status == 'pending') ...[
              const SizedBox(height: 10),
              Row(
                children: [
                  OpenCodeButton(
                    onPressed: () => onAction(id, true),
                    variant: OpenCodeButtonVariant.primary,
                    size: OpenCodeButtonSize.small,
                    icon: Icons.check,
                    child: const Text('Approve'),
                  ),
                  const SizedBox(width: 8),
                  OpenCodeButton(
                    onPressed: () => onAction(id, false),
                    variant: OpenCodeButtonVariant.secondary,
                    size: OpenCodeButtonSize.small,
                    child: const Text('Reject'),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _badge(String label, Color color) => Container(
        margin: const EdgeInsets.only(bottom: 2),
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: color.withOpacity(0.12),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Text(label, style: TextStyle(fontSize: 10, color: color, fontWeight: FontWeight.w500)),
      );
}

// ─────────────────────────────────────────────────────────────────────────────
// Repo job card (mini — summary only, tap goes to full screen)
// ─────────────────────────────────────────────────────────────────────────────

class _RepoJobCard extends StatelessWidget {
  const _RepoJobCard({required this.job, required this.palette});
  final Map<String, dynamic> job;
  final Oc2Palette palette;

  static const _steps  = ['pending', 'spec', 'tests', 'implementing', 'docs', 'pr-open', 'completed'];
  static const _labels = ['Q', 'Spec', 'Tests', 'Code', 'Docs', 'PR', 'Done'];

  @override
  Widget build(BuildContext context) {
    final repo     = job['repoFullName'] as String? ?? job['repo_full_name'] as String? ?? '-';
    final issueNum = job['issueNumber'] ?? job['issue_number'];
    final title    = job['issueTitle'] as String? ?? job['issue_title'] as String? ?? '-';
    final status   = job['status'] as String? ?? 'pending';
    final failed   = status == 'failed';
    final idx      = failed ? -1 : _steps.indexOf(status);

    final statusColor = failed
        ? Colors.red
        : status == 'completed'
            ? Colors.green
            : Theme.of(context).colorScheme.primary;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute<void>(builder: (_) => const RepoJobsScreen()),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      '$repo${issueNum != null ? " #$issueNum" : ""} — $title',
                      style: const TextStyle(fontSize: 13),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: statusColor.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(status, style: TextStyle(fontSize: 10, color: statusColor, fontWeight: FontWeight.w600)),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: List.generate(_steps.length, (i) {
                  final color = failed
                      ? Colors.grey.withOpacity(0.3)
                      : i < idx
                          ? Colors.green
                          : i == idx
                              ? Theme.of(context).colorScheme.primary
                              : Colors.grey.withOpacity(0.22);
                  return Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 1),
                      child: Tooltip(
                        message: _labels[i],
                        child: Container(
                          height: 4,
                          decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2)),
                        ),
                      ),
                    ),
                  );
                }),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Status badge (small pill)
// ─────────────────────────────────────────────────────────────────────────────

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});
  final String status;

  Color _color() {
    switch (status) {
      case 'completed': case 'done': case 'active':
        return Colors.green;
      case 'running': case 'implementing': case 'spec': case 'tests':
        return Colors.blue;
      case 'failed': case 'error':
        return Colors.red;
      case 'pending': case 'queued':
        return Colors.orange;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = _color();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(color: c.withOpacity(0.12), borderRadius: BorderRadius.circular(6)),
      child: Text(status, style: TextStyle(fontSize: 10, color: c, fontWeight: FontWeight.w600)),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tools section (collapsible)
// ─────────────────────────────────────────────────────────────────────────────

class _ToolsSection extends StatelessWidget {
  const _ToolsSection({
    required this.palette,
    required this.memQ,
    required this.idea,
    required this.chunks,
    required this.discovery,
    required this.memBusy,
    required this.discBusy,
    required this.repoIssueName,
    required this.repoFull,
    required this.repoLabel,
    required this.repoCron,
    required this.repoMaxDay,
    required this.repoMaxIssues,
    required this.repoRequirePassTests,
    required this.onRepoRequirePassTestsChanged,
    required this.onSearchMem,
    required this.onEnqueueDiscovery,
    required this.onCreateRepoIssuePipeline,
  });

  final Oc2Palette palette;
  final TextEditingController memQ, idea;
  final TextEditingController repoIssueName, repoFull, repoLabel, repoCron, repoMaxDay, repoMaxIssues;
  final List<Map<String, dynamic>>? chunks;
  final List<Map<String, dynamic>>? discovery;
  final bool memBusy, discBusy, repoRequirePassTests;
  final ValueChanged<bool> onRepoRequirePassTestsChanged;
  final VoidCallback onSearchMem, onEnqueueDiscovery, onCreateRepoIssuePipeline;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Column(
        children: [
          // Memory RAG
          ExpansionTile(
            leading: const Icon(Icons.memory_outlined),
            title: const Text('Memory (RAG)', style: TextStyle(fontWeight: FontWeight.w600)),
            childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            children: [
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: memQ,
                      decoration: const InputDecoration(hintText: 'Search query', border: OutlineInputBorder(), isDense: true),
                      onSubmitted: (_) => onSearchMem(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  OpenCodeButton(
                    onPressed: memBusy ? null : onSearchMem,
                    variant: OpenCodeButtonVariant.primary,
                    size: OpenCodeButtonSize.small,
                    icon: Icons.search,
                    child: const Text('Search'),
                  ),
                ],
              ),
              if (chunks != null && chunks!.isNotEmpty) ...[
                const SizedBox(height: 10),
                ...chunks!.map((c) {
                  final tx = c['text']?.toString() ?? '';
                  return Card(
                    margin: const EdgeInsets.only(bottom: 6),
                    color: palette.backgroundWeak,
                    child: Padding(
                      padding: const EdgeInsets.all(10),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            tx.length > 180 ? '${tx.substring(0, 180)}…' : tx,
                            style: TextStyle(fontSize: 12, color: palette.textWeak),
                          ),
                          const SizedBox(height: 4),
                          Text('score: ${c['score']}  ${c['source'] ?? ''}', style: TextStyle(fontSize: 11, color: palette.textWeak)),
                        ],
                      ),
                    ),
                  );
                }),
              ],
            ],
          ),
          const Divider(height: 1),

          // Discovery
          ExpansionTile(
            leading: const Icon(Icons.explore_outlined),
            title: const Text('Discovery', style: TextStyle(fontWeight: FontWeight.w600)),
            childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            children: [
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: idea,
                      decoration: const InputDecoration(hintText: 'Idea text', border: OutlineInputBorder(), isDense: true),
                    ),
                  ),
                  const SizedBox(width: 8),
                  OpenCodeButton(
                    onPressed: discBusy ? null : onEnqueueDiscovery,
                    variant: OpenCodeButtonVariant.primary,
                    size: OpenCodeButtonSize.small,
                    child: const Text('Enqueue'),
                  ),
                ],
              ),
              if (discovery != null && discovery!.isNotEmpty) ...[
                const SizedBox(height: 10),
                ...discovery!.take(15).map((d) {
                  final txt = d['idea_text']?.toString() ?? '-';
                  final head = txt.length > 52 ? '${txt.substring(0, 52)}…' : txt;
                  final st   = d['status'] as String? ?? '-';
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Row(
                      children: [
                        Expanded(child: Text(head, style: TextStyle(fontSize: 12, color: palette.textWeak))),
                        _StatusBadge(status: st),
                      ],
                    ),
                  );
                }),
              ],
            ],
          ),
          const Divider(height: 1),

          // New repo-issue pipeline
          ExpansionTile(
            leading: const Icon(Icons.add_circle_outline),
            title: const Text('New Repo Pipeline', style: TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text('repo-issue-worker strategy', style: TextStyle(fontSize: 12, color: palette.textWeak)),
            childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            children: [
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _field(repoIssueName, 'Name', 150),
                  _field(repoFull, 'owner/repo', 190),
                  _field(repoLabel, 'Label', 90),
                  _field(repoCron, 'Cron', 160),
                  _field(repoMaxDay, 'Max/day', 90, numeric: true),
                  _field(repoMaxIssues, 'Issues/run', 90, numeric: true),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Switch(value: repoRequirePassTests, onChanged: onRepoRequirePassTestsChanged),
                      Text('Require passing tests', style: TextStyle(fontSize: 12, color: palette.textWeak)),
                    ],
                  ),
                  OpenCodeButton(
                    onPressed: onCreateRepoIssuePipeline,
                    variant: OpenCodeButtonVariant.primary,
                    size: OpenCodeButtonSize.small,
                    icon: Icons.add,
                    child: const Text('Create'),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _field(TextEditingController ctrl, String label, double w, {bool numeric = false}) =>
      SizedBox(
        width: w,
        child: TextField(
          controller: ctrl,
          keyboardType: numeric ? TextInputType.number : TextInputType.text,
          decoration: InputDecoration(labelText: label, border: const OutlineInputBorder(), isDense: true),
        ),
      );
}
