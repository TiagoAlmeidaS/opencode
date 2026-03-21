import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../theme/button_style.dart';
import '../theme/oc2_colors.dart';
import '../widgets/opencode_button.dart';
import 'repo_jobs_screen.dart';

// Cron presets for the pipeline form — user picks a label, we store the expression.
const _cronPresets = <({String label, String cron})>[
  (label: '3×/day (8h, 14h, 20h)', cron: '0 8,14,20 * * *'),
  (label: '2×/day (9h, 18h)', cron: '0 9,18 * * *'),
  (label: 'Every 8 hours', cron: '0 */8 * * *'),
  (label: 'Every 6 hours', cron: '0 */6 * * *'),
  (label: 'Daily (08:00 UTC)', cron: '0 8 * * *'),
  (label: 'Weekdays 09:00', cron: '0 9 * * 1-5'),
  (label: 'Every 12 hours', cron: '0 0,12 * * *'),
];

const _maxDayOptions = [1, 2, 3, 5, 8, 10, 0];
const _issuesRunOptions = [1, 2, 3, 5, 8, 10];

class ServerDashboardScreen extends StatefulWidget {
  const ServerDashboardScreen({super.key});

  @override
  State<ServerDashboardScreen> createState() => _ServerDashboardScreenState();
}

class _ServerDashboardScreenState extends State<ServerDashboardScreen> {
  List<Map<String, dynamic>>? _pipelines;
  List<Map<String, dynamic>>? _repoJobs;
  List<Map<String, dynamic>>? _chunks;
  List<Map<String, dynamic>>? _discovery;

  final _memQ = TextEditingController();
  final _idea = TextEditingController();

  // New pipeline form
  final _repoName = TextEditingController();
  final _repoFull = TextEditingController();
  final _repoLabel = TextEditingController(text: 'agent');
  String _selectedCron = _cronPresets[0].cron;
  int _maxDay = 3;
  int _issuesRun = 3;
  bool _requireTests = true;

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
    _repoName.dispose();
    _repoFull.dispose();
    _repoLabel.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final srv = context.read<AppState>().server;
    if (srv == null) {
      setState(() => _loading = false);
      return;
    }

    final r = await Future.wait([
      srv.pipelines(),
      srv.repoIssueJobs(limit: 6),
      srv.discovery(limit: 15),
    ]);
    if (!mounted) return;

    setState(() {
      _pipelines = r[0];
      _repoJobs = r[1];
      _discovery = r[2];
      _loading = false;
    });
  }

  // ── Pipeline actions ───────────────────────────────────────────────────────

  Future<void> _togglePipeline(String id, bool enable) async {
    final srv = context.read<AppState>().server;
    if (srv == null) return;
    final ok = enable ? await srv.pipelineEnable(id) : await srv.pipelineDisable(id);
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
        title: const Text('Max runs per day'),
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

  Future<void> _editPipeline(Map<String, dynamic> pipeline) async {
    final srv = context.read<AppState>().server;
    if (srv == null) return;
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _EditPipelineSheet(pipeline: pipeline, srv: srv, palette: _palette),
    );
    if (saved == true && mounted) await _load();
  }

  // ── Memory / Discovery ─────────────────────────────────────────────────────

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
    final disc = await srv.discovery(limit: 15);
    setState(() {
      _discBusy = false;
      _discovery = disc;
    });
  }

  // ── Create pipeline ────────────────────────────────────────────────────────

  Future<void> _createPipeline() async {
    final name = _repoName.text.trim();
    final repo = _repoFull.text.trim();
    if (name.isEmpty || repo.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Name and repository are required')),
      );
      return;
    }
    final srv = context.read<AppState>().server;
    if (srv == null) return;
    final row = await srv.pipelineCreate(
      name: name,
      strategy: 'repo-issue-worker',
      cron: _selectedCron,
      maxRuns: _maxDay.clamp(0, 500),
      config: {
        'repo_full_name': repo,
        'label': _repoLabel.text.trim().isEmpty ? 'agent' : _repoLabel.text.trim(),
        'max_issues_per_run': _issuesRun.clamp(1, 30),
        'require_passing_tests': _requireTests,
      },
    );
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(row != null ? 'Pipeline created' : 'Create failed')),
    );
    if (row != null) {
      _repoName.clear();
      _repoFull.clear();
      await _load();
    }
  }

  // ── Build ──────────────────────────────────────────────────────────────────

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
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Header ────────────────────────────────────────────────────
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Server', style: Theme.of(context).textTheme.headlineMedium),
                      Text(
                        'Pipelines · Automation · Tools',
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
            const SizedBox(height: 24),

            // ── Pipelines ─────────────────────────────────────────────────
            if (_pipelines != null && _pipelines!.isNotEmpty) ...[
              _sectionHeader('Pipelines', badge: _pipelines!.length),
              const SizedBox(height: 8),
              ..._pipelines!.map((p) => _PipelineCard(
                    pipeline: p,
                    palette: palette,
                    onToggle: _togglePipeline,
                    onRun: _runPipeline,
                    onEditCap: _editDailyCap,
                    onEdit: _editPipeline,
                  )),
              const SizedBox(height: 24),
            ],

            // ── Repo Jobs (preview) ───────────────────────────────────────
            if (_repoJobs != null && _repoJobs!.isNotEmpty) ...[
              Row(
                children: [
                  Expanded(child: _sectionHeader('Repo Jobs')),
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
              const SizedBox(height: 24),
            ],

            // ── Tools (collapsible) ───────────────────────────────────────
            Text('Tools', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Card(
              child: Column(
                children: [
                  _MemoryTile(
                    palette: palette,
                    ctrl: _memQ,
                    busy: _memBusy,
                    chunks: _chunks,
                    onSearch: _searchMem,
                  ),
                  const Divider(height: 1),
                  _DiscoveryTile(
                    palette: palette,
                    ctrl: _idea,
                    busy: _discBusy,
                    items: _discovery,
                    onEnqueue: _enqueueDiscovery,
                  ),
                  const Divider(height: 1),
                  _NewPipelineTile(
                    palette: palette,
                    name: _repoName,
                    repo: _repoFull,
                    label: _repoLabel,
                    cron: _selectedCron,
                    maxDay: _maxDay,
                    issuesRun: _issuesRun,
                    requireTests: _requireTests,
                    onCronChanged: (v) => setState(() => _selectedCron = v),
                    onMaxDayChanged: (v) => setState(() => _maxDay = v),
                    onIssuesRunChanged: (v) => setState(() => _issuesRun = v),
                    onRequireTestsChanged: (v) => setState(() => _requireTests = v),
                    onCreate: _createPipeline,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  Widget _sectionHeader(String title, {int? badge}) {
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
// Pipeline card
// ─────────────────────────────────────────────────────────────────────────────

class _PipelineCard extends StatelessWidget {
  const _PipelineCard({
    required this.pipeline,
    required this.palette,
    required this.onToggle,
    required this.onRun,
    required this.onEditCap,
    required this.onEdit,
  });
  final Map<String, dynamic> pipeline;
  final Oc2Palette palette;
  final Future<void> Function(String id, bool enable) onToggle;
  final Future<void> Function(String id) onRun;
  final Future<void> Function(String id, int current) onEditCap;
  final Future<void> Function(Map<String, dynamic> pipeline) onEdit;

  @override
  Widget build(BuildContext context) {
    final id = pipeline['id'] as String? ?? '';
    final name = pipeline['name'] as String? ?? '-';
    final strategy = pipeline['strategy'] as String? ?? '-';
    final enabled = (pipeline['enabled'] as int?) == 1;
    final maxDay = pipeline['maxRunsPerDay'] ?? pipeline['max_runs_per_day'];
    final cap = maxDay is int ? maxDay : int.tryParse('$maxDay') ?? 0;
    final cron = pipeline['scheduleCron'] ?? pipeline['schedule_cron'];

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
                  width: 8,
                  height: 8,
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
                        [
                          strategy,
                          if (cap > 0) 'max $cap/day',
                          if (cron != null) _cronLabel(cron.toString()),
                        ].join(' · '),
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
                  onPressed: () => onEdit(pipeline),
                  variant: OpenCodeButtonVariant.secondary,
                  size: OpenCodeButtonSize.small,
                  icon: Icons.edit_outlined,
                  child: const Text('Edit'),
                ),
              ],
            ),

          ],
        ),
      ),
    );
  }

  static String _cronLabel(String cron) {
    for (final p in _cronPresets) {
      if (p.cron == cron) return p.label;
    }
    return cron;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Edit pipeline sheet
// ─────────────────────────────────────────────────────────────────────────────

class _EditPipelineSheet extends StatefulWidget {
  const _EditPipelineSheet({
    required this.pipeline,
    required this.srv,
    required this.palette,
  });
  final Map<String, dynamic> pipeline;
  final dynamic srv; // ServerApiClient
  final Oc2Palette palette;

  @override
  State<_EditPipelineSheet> createState() => _EditPipelineSheetState();
}

class _EditPipelineSheetState extends State<_EditPipelineSheet> {
  late final TextEditingController _name;
  late final TextEditingController _repoFull;
  late final TextEditingController _label;
  late final TextEditingController _customCron;
  late String _selectedCron;
  late int _maxDay;
  late int _issuesRun;
  late bool _requireTests;
  bool _useCustomCron = false;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final p = widget.pipeline;
    _name = TextEditingController(text: p['name'] as String? ?? '');
    final cron = (p['scheduleCron'] ?? p['schedule_cron'] ?? '0 8,14,20 * * *').toString();
    final knownCron = _cronPresets.any((e) => e.cron == cron);
    _selectedCron = knownCron ? cron : _cronPresets[0].cron;
    _useCustomCron = !knownCron;
    _customCron = TextEditingController(text: _useCustomCron ? cron : '');

    final maxDay = p['maxRunsPerDay'] ?? p['max_runs_per_day'];
    _maxDay = (maxDay is int ? maxDay : int.tryParse('$maxDay') ?? 0).clamp(0, 500);

    Map<String, dynamic> cfg = {};
    try {
      final raw = p['configJson'] ?? p['config_json'];
      if (raw is String && raw.isNotEmpty) cfg = Map<String, dynamic>.from(jsonDecode(raw) as Map);
    } catch (_) {}

    _repoFull = TextEditingController(text: cfg['repo_full_name'] as String? ?? '');
    _label = TextEditingController(text: cfg['label'] as String? ?? 'agent');
    _issuesRun = (cfg['max_issues_per_run'] as int?) ?? 3;
    final rt = cfg['require_passing_tests'];
    _requireTests = rt == null ? true : rt == true || rt == 1;
  }

  @override
  void dispose() {
    _name.dispose();
    _repoFull.dispose();
    _label.dispose();
    _customCron.dispose();
    super.dispose();
  }

  String get _effectiveCron => _useCustomCron ? _customCron.text.trim() : _selectedCron;

  Future<void> _save() async {
    final id = widget.pipeline['id'] as String?;
    if (id == null) return;
    setState(() => _saving = true);

    final strategy = widget.pipeline['strategy'] as String? ?? '';
    Map<String, dynamic>? config;
    if (strategy == 'repo-issue-worker') {
      config = {
        'repo_full_name': _repoFull.text.trim(),
        'label': _label.text.trim().isEmpty ? 'agent' : _label.text.trim(),
        'max_issues_per_run': _issuesRun.clamp(1, 30),
        'require_passing_tests': _requireTests,
      };
    }

    await widget.srv.pipelinePatch(
      id,
      name: _name.text.trim().isEmpty ? null : _name.text.trim(),
      cron: _effectiveCron.isEmpty ? null : _effectiveCron,
      maxRuns: _maxDay,
      config: config,
    );

    if (!mounted) return;
    setState(() => _saving = false);
    Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) {
    final palette = widget.palette;
    final strategy = widget.pipeline['strategy'] as String? ?? '';
    final isRepoWorker = strategy == 'repo-issue-worker';

    return DraggableScrollableSheet(
      initialChildSize: 0.75,
      maxChildSize: 0.95,
      minChildSize: 0.4,
      expand: false,
      builder: (_, scroll) => Container(
        decoration: BoxDecoration(
          color: palette.backgroundBase,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(
          children: [
            // Handle
            Container(
              margin: const EdgeInsets.only(top: 12, bottom: 4),
              width: 40, height: 4,
              decoration: BoxDecoration(color: palette.borderWeak, borderRadius: BorderRadius.circular(2)),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 4),
              child: Row(
                children: [
                  Expanded(child: Text('Edit Pipeline', style: Theme.of(context).textTheme.titleMedium)),
                  TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
                ],
              ),
            ),
            const Divider(height: 1),
            Expanded(
              child: ListView(
                controller: scroll,
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
                children: [
                  // Name
                  Text('Name', style: TextStyle(fontSize: 13, color: palette.textWeak, fontWeight: FontWeight.w500)),
                  const SizedBox(height: 6),
                  TextField(
                    controller: _name,
                    decoration: const InputDecoration(border: OutlineInputBorder(), isDense: true),
                  ),
                  const SizedBox(height: 20),

                  // Cron schedule
                  Text('Schedule', style: TextStyle(fontSize: 13, color: palette.textWeak, fontWeight: FontWeight.w500)),
                  const SizedBox(height: 6),
                  if (!_useCustomCron) ...[
                    DropdownButtonFormField<String>(
                      value: _selectedCron,
                      decoration: const InputDecoration(border: OutlineInputBorder(), isDense: true),
                      items: [
                        ..._cronPresets.map((p) => DropdownMenuItem(value: p.cron, child: Text(p.label))),
                        const DropdownMenuItem(value: '__custom', child: Text('Custom cron…')),
                      ],
                      onChanged: (v) {
                        if (v == '__custom') {
                          setState(() { _useCustomCron = true; _customCron.text = _selectedCron; });
                        } else if (v != null) {
                          setState(() => _selectedCron = v);
                        }
                      },
                    ),
                  ] else ...[
                    TextField(
                      controller: _customCron,
                      decoration: InputDecoration(
                        border: const OutlineInputBorder(),
                        isDense: true,
                        hintText: 'e.g. 0 8,14,20 * * *',
                        suffixIcon: IconButton(
                          icon: const Icon(Icons.list_alt, size: 18),
                          tooltip: 'Use preset',
                          onPressed: () => setState(() { _useCustomCron = false; }),
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 20),

                  // Max runs per day
                  Text('Max runs / day', style: TextStyle(fontSize: 13, color: palette.textWeak, fontWeight: FontWeight.w500)),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 8,
                    children: _maxDayOptions.map((opt) {
                      final label = opt == 0 ? '∞' : '$opt';
                      final selected = _maxDay == opt;
                      return ChoiceChip(
                        label: Text(label),
                        selected: selected,
                        onSelected: (_) => setState(() => _maxDay = opt),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 20),

                  // Repo-issue-worker config
                  if (isRepoWorker) ...[
                    const Divider(),
                    const SizedBox(height: 12),
                    Text('Repository', style: TextStyle(fontSize: 13, color: palette.textWeak, fontWeight: FontWeight.w500)),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _repoFull,
                      decoration: const InputDecoration(
                        border: OutlineInputBorder(),
                        isDense: true,
                        hintText: 'owner/repo or https://github.com/owner/repo',
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text('Issue label', style: TextStyle(fontSize: 13, color: palette.textWeak, fontWeight: FontWeight.w500)),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _label,
                      decoration: const InputDecoration(border: OutlineInputBorder(), isDense: true, hintText: 'agent'),
                    ),
                    const SizedBox(height: 16),
                    Text('Max issues per run', style: TextStyle(fontSize: 13, color: palette.textWeak, fontWeight: FontWeight.w500)),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 8,
                      children: _issuesRunOptions.map((opt) {
                        final selected = _issuesRun == opt;
                        return ChoiceChip(
                          label: Text('$opt'),
                          selected: selected,
                          onSelected: (_) => setState(() => _issuesRun = opt),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 16),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Require passing tests'),
                      subtitle: Text(
                        'Block PR until tests pass',
                        style: TextStyle(fontSize: 12, color: palette.textWeak),
                      ),
                      value: _requireTests,
                      onChanged: (v) => setState(() => _requireTests = v),
                    ),
                  ],

                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: _saving ? null : _save,
                      style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
                      child: _saving
                          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Text('Save changes'),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Repo job card (mini)
// ─────────────────────────────────────────────────────────────────────────────

class _RepoJobCard extends StatelessWidget {
  const _RepoJobCard({required this.job, required this.palette});
  final Map<String, dynamic> job;
  final Oc2Palette palette;

  static const _steps = ['pending', 'spec', 'tests', 'implementing', 'docs', 'pr-open', 'completed'];
  static const _labels = ['Q', 'Spec', 'Tests', 'Code', 'Docs', 'PR', 'Done'];

  @override
  Widget build(BuildContext context) {
    final repo = job['repoFullName'] as String? ?? job['repo_full_name'] as String? ?? '-';
    final num = job['issueNumber'] ?? job['issue_number'];
    final title = job['issueTitle'] as String? ?? job['issue_title'] as String? ?? '-';
    final status = job['status'] as String? ?? 'pending';
    final failed = status == 'failed';
    final idx = failed ? -1 : _steps.indexOf(status);

    final color = failed
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
                      '$repo${num != null ? " #$num" : ""} — $title',
                      style: const TextStyle(fontSize: 13),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 8),
                  _Badge(label: status, color: color),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: List.generate(_steps.length, (i) {
                  final c = failed
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
                          decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(2)),
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
// Badge pill
// ─────────────────────────────────────────────────────────────────────────────

class _Badge extends StatelessWidget {
  const _Badge({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(6)),
      child: Text(label, style: TextStyle(fontSize: 10, color: color, fontWeight: FontWeight.w600)),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Memory (RAG) tile
// ─────────────────────────────────────────────────────────────────────────────

class _MemoryTile extends StatelessWidget {
  const _MemoryTile({
    required this.palette,
    required this.ctrl,
    required this.busy,
    required this.chunks,
    required this.onSearch,
  });
  final Oc2Palette palette;
  final TextEditingController ctrl;
  final bool busy;
  final List<Map<String, dynamic>>? chunks;
  final VoidCallback onSearch;

  @override
  Widget build(BuildContext context) {
    return ExpansionTile(
      leading: const Icon(Icons.memory_outlined),
      title: const Text('Memory (RAG)', style: TextStyle(fontWeight: FontWeight.w600)),
      childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      children: [
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: ctrl,
                decoration: const InputDecoration(hintText: 'Search memory…', border: OutlineInputBorder(), isDense: true),
                onSubmitted: (_) => onSearch(),
              ),
            ),
            const SizedBox(width: 8),
            OpenCodeButton(
              onPressed: busy ? null : onSearch,
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
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Discovery tile
// ─────────────────────────────────────────────────────────────────────────────

class _DiscoveryTile extends StatelessWidget {
  const _DiscoveryTile({
    required this.palette,
    required this.ctrl,
    required this.busy,
    required this.items,
    required this.onEnqueue,
  });
  final Oc2Palette palette;
  final TextEditingController ctrl;
  final bool busy;
  final List<Map<String, dynamic>>? items;
  final VoidCallback onEnqueue;

  @override
  Widget build(BuildContext context) {
    return ExpansionTile(
      leading: const Icon(Icons.explore_outlined),
      title: const Text('Discovery', style: TextStyle(fontWeight: FontWeight.w600)),
      childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      children: [
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: ctrl,
                decoration: const InputDecoration(hintText: 'Idea text', border: OutlineInputBorder(), isDense: true),
              ),
            ),
            const SizedBox(width: 8),
            OpenCodeButton(
              onPressed: busy ? null : onEnqueue,
              variant: OpenCodeButtonVariant.primary,
              size: OpenCodeButtonSize.small,
              child: const Text('Enqueue'),
            ),
          ],
        ),
        if (items != null && items!.isNotEmpty) ...[
          const SizedBox(height: 10),
          ...items!.take(10).map((d) {
            final txt = d['idea_text']?.toString() ?? '-';
            final head = txt.length > 52 ? '${txt.substring(0, 52)}…' : txt;
            final st = d['status'] as String? ?? '-';
            final color = st == 'completed'
                ? Colors.green
                : st == 'pending'
                    ? Colors.orange
                    : Colors.grey;
            return Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(
                children: [
                  Expanded(child: Text(head, style: TextStyle(fontSize: 12, color: palette.textWeak))),
                  _Badge(label: st, color: color),
                ],
              ),
            );
          }),
        ],
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// New Pipeline tile — friendly form with dropdowns
// ─────────────────────────────────────────────────────────────────────────────

class _NewPipelineTile extends StatelessWidget {
  const _NewPipelineTile({
    required this.palette,
    required this.name,
    required this.repo,
    required this.label,
    required this.cron,
    required this.maxDay,
    required this.issuesRun,
    required this.requireTests,
    required this.onCronChanged,
    required this.onMaxDayChanged,
    required this.onIssuesRunChanged,
    required this.onRequireTestsChanged,
    required this.onCreate,
  });

  final Oc2Palette palette;
  final TextEditingController name, repo, label;
  final String cron;
  final int maxDay, issuesRun;
  final bool requireTests;
  final ValueChanged<String> onCronChanged;
  final ValueChanged<int> onMaxDayChanged;
  final ValueChanged<int> onIssuesRunChanged;
  final ValueChanged<bool> onRequireTestsChanged;
  final VoidCallback onCreate;

  @override
  Widget build(BuildContext context) {
    return ExpansionTile(
      leading: const Icon(Icons.add_circle_outline),
      title: const Text('New Repo Pipeline', style: TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Text('repo-issue-worker', style: TextStyle(fontSize: 12, color: palette.textWeak)),
      childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      children: [
        TextField(
          controller: name,
          decoration: const InputDecoration(labelText: 'Pipeline name', hintText: 'e.g. my-project-issues', border: OutlineInputBorder(), isDense: true),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: repo,
          decoration: const InputDecoration(labelText: 'Repository', hintText: 'owner/repo', border: OutlineInputBorder(), isDense: true),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: label,
          decoration: const InputDecoration(labelText: 'Issue label filter', hintText: 'agent', border: OutlineInputBorder(), isDense: true),
        ),
        const SizedBox(height: 16),

        // Schedule dropdown
        DropdownButtonFormField<String>(
          initialValue: _cronPresets.any((p) => p.cron == cron) ? cron : null,
          decoration: const InputDecoration(labelText: 'Schedule', border: OutlineInputBorder(), isDense: true),
          isExpanded: true,
          items: _cronPresets
              .map((p) => DropdownMenuItem(value: p.cron, child: Text(p.label, style: const TextStyle(fontSize: 13))))
              .toList(),
          onChanged: (v) {
            if (v != null) onCronChanged(v);
          },
        ),
        const SizedBox(height: 12),

        Row(
          children: [
            Expanded(
              child: DropdownButtonFormField<int>(
                initialValue: _maxDayOptions.contains(maxDay) ? maxDay : 3,
                decoration: const InputDecoration(labelText: 'Max runs/day', border: OutlineInputBorder(), isDense: true),
                items: _maxDayOptions
                    .map((n) => DropdownMenuItem(value: n, child: Text(n == 0 ? 'Unlimited' : '$n', style: const TextStyle(fontSize: 13))))
                    .toList(),
                onChanged: (v) {
                  if (v != null) onMaxDayChanged(v);
                },
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: DropdownButtonFormField<int>(
                initialValue: _issuesRunOptions.contains(issuesRun) ? issuesRun : 3,
                decoration: const InputDecoration(labelText: 'Issues per run', border: OutlineInputBorder(), isDense: true),
                items: _issuesRunOptions
                    .map((n) => DropdownMenuItem(value: n, child: Text('$n', style: const TextStyle(fontSize: 13))))
                    .toList(),
                onChanged: (v) {
                  if (v != null) onIssuesRunChanged(v);
                },
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),

        Row(
          children: [
            Switch(value: requireTests, onChanged: onRequireTestsChanged),
            const SizedBox(width: 4),
            Text('Require passing tests', style: TextStyle(fontSize: 13, color: palette.textBase)),
          ],
        ),
        const SizedBox(height: 12),

        Align(
          alignment: Alignment.centerLeft,
          child: OpenCodeButton(
            onPressed: onCreate,
            variant: OpenCodeButtonVariant.primary,
            size: OpenCodeButtonSize.small,
            icon: Icons.add,
            child: const Text('Create Pipeline'),
          ),
        ),
      ],
    );
  }
}
