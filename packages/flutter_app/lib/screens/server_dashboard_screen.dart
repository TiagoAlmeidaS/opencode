import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../theme/oc2_colors.dart';
import '../theme/button_style.dart';
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
  List<Map<String, dynamic>>? _chunks;
  List<Map<String, dynamic>>? _repoJobs;
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
    final state = context.read<AppState>();
    final client = state.client;
    if (client == null) return;

    final pipelines = await client.serverPipelines();
    final jobs = await client.serverJobs();
    final goals = await client.serverGoals();
    final proposals = await client.serverProposals();
    final metrics = await client.serverDashboard();
    final disc = await client.serverDiscoveryList(limit: 30);
    final repoJobs = await client.serverRepoIssueJobs(limit: 10);
    if (!mounted) return;

    setState(() {
      _pipelines = pipelines;
      _jobs = jobs;
      _goals = goals;
      _proposals = proposals;
      _metrics = metrics;
      _discovery = disc;
      _repoJobs = repoJobs;
      _loading = false;
    });
  }

  Future<void> _searchMem() async {
    final q = _memQ.text.trim();
    if (q.isEmpty) return;
    final client = context.read<AppState>().client;
    if (client == null) return;
    setState(() => _memBusy = true);
    final raw = await client.serverMemoryRetrieve(q, limit: 8);
    if (!mounted) return;
    final list = raw?['chunks'];
    final out = list is List
        ? list.map((e) => e is Map ? Map<String, dynamic>.from(e) : <String, dynamic>{}).toList()
        : <Map<String, dynamic>>[];
    setState(() {
      _memBusy = false;
      _chunks = out;
    });
  }

  Future<void> _enqueueDiscovery() async {
    final t = _idea.text.trim();
    if (t.isEmpty) return;
    final client = context.read<AppState>().client;
    if (client == null) return;
    setState(() => _discBusy = true);
    await client.serverDiscoveryEnqueue(t, triggerPipeline: false);
    _idea.clear();
    if (!mounted) return;
    final disc = await client.serverDiscoveryList(limit: 30);
    setState(() {
      _discBusy = false;
      _discovery = disc;
    });
  }

  Future<void> _refreshStatus() async {
    final state = context.read<AppState>();
    if (!mounted) return;
    await state.refreshServerStatus();
  }

  Future<void> _togglePipeline(String id, bool enabled) async {
    final state = context.read<AppState>();
    final client = state.client;
    if (client == null) return;

    final ok = enabled ? await client.serverPipelineEnable(id) : await client.serverPipelineDisable(id);
    if (!mounted) return;
    if (ok) {
      await _load();
      await _refreshStatus();
    }
  }

  Future<void> _runPipeline(String id) async {
    final state = context.read<AppState>();
    final client = state.client;
    if (client == null) return;

    final r = await client.serverPipelineRun(id);
    if (!mounted) return;
    final msg = r == null
        ? 'Run failed (HTTP)'
        : (r['ok'] == true)
            ? 'Started job ${r['jobId'] ?? ''}'
            : (r['error']?.toString() ?? 'Run failed');
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
    await _load();
  }

  Future<void> _createRepoIssuePipeline() async {
    final name = _repoIssueName.text.trim();
    final repo = _repoFull.text.trim();
    if (name.isEmpty || repo.isEmpty) return;
    final client = context.read<AppState>().client;
    if (client == null) return;
    final maxDay = int.tryParse(_repoMaxDay.text.trim()) ?? 0;
    final maxIssues = int.tryParse(_repoMaxIssues.text.trim()) ?? 3;
    final row = await client.serverPipelineCreate(
      name: name,
      strategy: 'repo-issue-worker',
      scheduleCron: _repoCron.text.trim().isEmpty ? '0 8 * * *' : _repoCron.text.trim(),
      maxRunsPerDay: maxDay.clamp(0, 500),
      configJson: {
        'repo_full_name': repo,
        'label': _repoLabel.text.trim().isEmpty ? 'agent' : _repoLabel.text.trim(),
        'max_issues_per_run': maxIssues.clamp(1, 30),
        'require_passing_tests': _repoRequirePassTests,
      },
    );
    if (!mounted) return;
    if (row != null) {
      _repoIssueName.clear();
      _repoFull.clear();
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Pipeline created')));
      await _load();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Create failed')));
    }
  }

  Future<void> _editPipelineDailyCap(String id, int current) async {
    final ctrl = TextEditingController(text: current > 0 ? '$current' : '0');
    if (!mounted) return;
    final n = await showDialog<int?>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Max runs per day (UTC)'),
        content: TextField(
          controller: ctrl,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(hintText: '0 = unlimited'),
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
    final client = context.read<AppState>().client;
    if (client == null) return;
    await client.serverPipelinePatch(id, maxRunsPerDay: n.clamp(0, 500));
    if (!mounted) return;
    await _load();
  }

  Future<void> _proposalAction(String id, bool approve) async {
    final state = context.read<AppState>();
    final client = state.client;
    if (client == null) return;

    final ok = approve ? await client.serverProposalApprove(id) : await client.serverProposalReject(id);
    if (!mounted) return;
    if (ok) await _load();
  }

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).brightness == Brightness.dark ? Oc2Colors.dark : Oc2Colors.light;
    final state = context.watch<AppState>();
    final status = state.serverStatus;

    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Server Dashboard', style: Theme.of(context).textTheme.headlineMedium),
                    const SizedBox(height: 8),
                    Text(
                      'Daemon status and pipelines',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: palette.textWeak),
                    ),
                  ],
                ),
              ),
              OpenCodeButton(
                onPressed: _load,
                variant: OpenCodeButtonVariant.secondary,
                icon: Icons.refresh,
                child: const Text('Refresh'),
              ),
            ],
          ),
          const SizedBox(height: 24),
          if (status != null) ...[
            _buildCard(
              context,
              'Status',
              [
                _row('Pipelines total', status.pipelinesTotal?.toString() ?? '-'),
                _row('Pipelines enabled', status.pipelinesEnabled?.toString() ?? '-'),
                _row('Jobs running', status.jobsRunning?.toString() ?? '-'),
                _row('Proposals pending', status.proposalsPending?.toString() ?? '-'),
              ],
            ),
            const SizedBox(height: 16),
          ],
          if (_metrics != null) ...[
            Text('Dashboard (period)', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            _buildCard(
              context,
              '',
              [
                _row('Revenue USD', _dashRevenue(_metrics!)),
                _row('Health', _metrics!['health']?.toString() ?? '-'),
              ],
            ),
            const SizedBox(height: 24),
          ],
          Text('Memory (RAG)', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _memQ,
                  decoration: const InputDecoration(
                    hintText: 'Search query',
                    border: OutlineInputBorder(),
                  ),
                  onSubmitted: (_) => _searchMem(),
                ),
              ),
              const SizedBox(width: 8),
              OpenCodeButton(
                onPressed: _memBusy ? null : _searchMem,
                variant: OpenCodeButtonVariant.primary,
                icon: Icons.search,
                child: const Text('Search'),
              ),
            ],
          ),
          if (_chunks != null && _chunks!.isNotEmpty) ...[
            const SizedBox(height: 8),
            ..._chunks!.map(
              (c) {
                final tx = c['text']?.toString() ?? '';
                final short = tx.length > 200 ? '${tx.substring(0, 200)}…' : tx;
                return Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    title: Text(short, style: TextStyle(fontSize: 12, color: palette.textWeak)),
                    subtitle: Text('score: ${c['score']}  ${c['source'] ?? ''}', style: const TextStyle(fontSize: 11)),
                  ),
                );
              },
            ),
          ],
          const SizedBox(height: 24),
          Text('Discovery', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _idea,
                  decoration: const InputDecoration(
                    hintText: 'Idea text',
                    border: OutlineInputBorder(),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              OpenCodeButton(
                onPressed: _discBusy ? null : _enqueueDiscovery,
                variant: OpenCodeButtonVariant.primary,
                child: const Text('Enqueue'),
              ),
            ],
          ),
          if (_discovery != null && _discovery!.isNotEmpty) ...[
            const SizedBox(height: 8),
            _buildCard(
              context,
              '',
              _discovery!.take(20).map((d) {
                final idea = d['idea_text']?.toString() ?? '-';
                final head = idea.length > 48 ? '${idea.substring(0, 48)}…' : idea;
                return _row(head, d['status'] as String? ?? '-');
              }).toList(),
            ),
            const SizedBox(height: 16),
          ],
          Text('Repo issue worker (new)', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Text(
            'Choose repo, label (e.g. agent), cron windows, and max runs per UTC day.',
            style: TextStyle(fontSize: 12, color: palette.textWeak),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              SizedBox(
                width: 160,
                child: TextField(
                  controller: _repoIssueName,
                  decoration: const InputDecoration(labelText: 'Name', border: OutlineInputBorder()),
                ),
              ),
              SizedBox(
                width: 200,
                child: TextField(
                  controller: _repoFull,
                  decoration: const InputDecoration(
                    labelText: 'owner/repo',
                    border: OutlineInputBorder(),
                  ),
                ),
              ),
              SizedBox(
                width: 100,
                child: TextField(
                  controller: _repoLabel,
                  decoration: const InputDecoration(labelText: 'Label', border: OutlineInputBorder()),
                ),
              ),
              SizedBox(
                width: 140,
                child: TextField(
                  controller: _repoCron,
                  decoration: const InputDecoration(labelText: 'Cron', border: OutlineInputBorder()),
                ),
              ),
              SizedBox(
                width: 100,
                child: TextField(
                  controller: _repoMaxDay,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Max/day UTC',
                    border: OutlineInputBorder(),
                  ),
                ),
              ),
              SizedBox(
                width: 100,
                child: TextField(
                  controller: _repoMaxIssues,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Issues/run',
                    border: OutlineInputBorder(),
                  ),
                ),
              ),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Switch(
                    value: _repoRequirePassTests,
                    onChanged: (v) => setState(() => _repoRequirePassTests = v),
                  ),
                  Text(
                    'Require passing tests',
                    style: TextStyle(fontSize: 12, color: palette.textWeak),
                  ),
                ],
              ),
              OpenCodeButton(
                onPressed: _createRepoIssuePipeline,
                variant: OpenCodeButtonVariant.primary,
                child: const Text('Create'),
              ),
            ],
          ),
          const SizedBox(height: 24),
          if (_repoJobs != null && _repoJobs!.isNotEmpty) ...[
            Row(
              children: [
                Expanded(child: Text('Recent repo jobs', style: Theme.of(context).textTheme.titleMedium)),
                TextButton(
                  onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const RepoJobsScreen())),
                  child: const Text('View all'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            ..._repoJobs!.take(5).map((j) => _buildRepoJobCard(context, palette, j)),
            const SizedBox(height: 24),
          ],
          if (_pipelines != null && _pipelines!.isNotEmpty) ...[
            Text('Pipelines', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            ..._pipelines!.map((p) => _buildPipelineCard(context, palette, p)),
            const SizedBox(height: 24),
          ],
          if (_jobs != null && _jobs!.isNotEmpty) ...[
            Text('Recent jobs', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            _buildCard(
              context,
              '',
              _jobs!.take(15).map((j) => _row(j['id']?.toString().substring(0, 8) ?? '-', j['status'] as String? ?? '-')).toList(),
            ),
            const SizedBox(height: 24),
          ],
          if (_goals != null && _goals!.isNotEmpty) ...[
            Text('Goals', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            _buildCard(
              context,
              '',
              _goals!.take(10).map((g) => _row(g['name'] as String? ?? '-', g['status'] as String? ?? '-')).toList(),
            ),
            const SizedBox(height: 24),
          ],
          if (_proposals != null && _proposals!.isNotEmpty) ...[
            Text('Proposals', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            ..._proposals!.take(10).map((pr) => _buildProposalCard(context, palette, pr)),
          ],
        ],
      ),
    );
  }

  Widget _buildPipelineCard(BuildContext context, Oc2Palette palette, Map<String, dynamic> p) {
    final id = p['id'] as String? ?? '';
    final name = p['name'] as String? ?? '-';
    final strategy = p['strategy'] as String? ?? '-';
    final enabled = (p['enabled'] as int?) == 1;
    final maxDay = p['maxRunsPerDay'] ?? p['max_runs_per_day'];
    final cap = maxDay is int ? maxDay : int.tryParse('$maxDay') ?? 0;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              spacing: 8,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                SizedBox(
                  width: 200,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(name, style: Theme.of(context).textTheme.titleSmall),
                      Text(strategy, style: TextStyle(fontSize: 12, color: palette.textWeak)),
                      if (cap > 0)
                        Text('Max $cap runs/day (UTC)', style: TextStyle(fontSize: 11, color: palette.textWeak)),
                    ],
                  ),
                ),
                OpenCodeButton(
                  onPressed: () => _editPipelineDailyCap(id, cap),
                  variant: OpenCodeButtonVariant.secondary,
                  size: OpenCodeButtonSize.small,
                  child: const Text('Daily cap'),
                ),
                OpenCodeButton(
                  onPressed: () => _togglePipeline(id, !enabled),
                  variant: OpenCodeButtonVariant.secondary,
                  size: OpenCodeButtonSize.small,
                  child: Text(enabled ? 'Disable' : 'Enable'),
                ),
                OpenCodeButton(
                  onPressed: () => _runPipeline(id),
                  variant: OpenCodeButtonVariant.primary,
                  size: OpenCodeButtonSize.small,
                  icon: Icons.play_arrow,
                  child: const Text('Run'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRepoJobCard(BuildContext context, Oc2Palette palette, Map<String, dynamic> job) {
    final repo = job['repoFullName'] as String? ?? job['repo_full_name'] as String? ?? '-';
    final issueNum = job['issueNumber'] ?? job['issue_number'];
    final title = job['issueTitle'] as String? ?? job['issue_title'] as String? ?? '-';
    final status = job['status'] as String? ?? 'pending';

    const steps = ['pending', 'spec', 'tests', 'implementing', 'docs', 'pr-open', 'completed'];
    const labels = ['Q', 'Spec', 'Tests', 'Code', 'Docs', 'PR', 'Done'];
    final failed = status == 'failed';
    final idx = failed ? -1 : steps.indexOf(status);

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const RepoJobsScreen())),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
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
                      color: (failed ? Colors.red : (status == 'completed' ? Colors.green : Theme.of(context).colorScheme.primary)).withOpacity(0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      status,
                      style: TextStyle(
                        fontSize: 10,
                        color: failed ? Colors.red : (status == 'completed' ? Colors.green : Theme.of(context).colorScheme.primary),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: List.generate(steps.length, (i) {
                  Color color;
                  if (failed) {
                    color = Colors.grey.withOpacity(0.3);
                  } else if (i < idx) {
                    color = Colors.green;
                  } else if (i == idx) {
                    color = Theme.of(context).colorScheme.primary;
                  } else {
                    color = Colors.grey.withOpacity(0.25);
                  }
                  return Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 1),
                      child: Tooltip(
                        message: labels[i],
                        child: Container(height: 4, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2))),
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

  Widget _buildProposalCard(BuildContext context, Oc2Palette palette, Map<String, dynamic> pr) {
    final id = pr['id'] as String? ?? '';
    final status = pr['status'] as String? ?? '-';
    final title = pr['title'] as String? ?? '';
    final description = pr['description'] as String? ?? '';
    final riskLevel = pr['riskLevel'] as String? ?? pr['risk_level'] as String? ?? '';
    final confidence = pr['confidence'];
    final confidencePct = confidence is num ? '${(confidence * 100).toStringAsFixed(0)}%' : null;

    Color riskColor;
    switch (riskLevel) {
      case 'high':
        riskColor = Colors.red;
      case 'medium':
        riskColor = Colors.orange;
      default:
        riskColor = Colors.green;
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (title.isNotEmpty)
                        Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                      Text(
                        id.substring(0, id.length >= 8 ? 8 : id.length),
                        style: TextStyle(fontFamily: 'monospace', fontSize: 11, color: palette.textWeak),
                      ),
                    ],
                  ),
                ),
                Wrap(
                  spacing: 6,
                  children: [
                    if (riskLevel.isNotEmpty)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: riskColor.withOpacity(0.15),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text('risk: $riskLevel', style: TextStyle(fontSize: 10, color: riskColor)),
                      ),
                    if (confidencePct != null)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: palette.backgroundWeak,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text('conf: $confidencePct', style: TextStyle(fontSize: 10, color: palette.textWeak)),
                      ),
                    Text(status, style: TextStyle(color: palette.textWeak, fontSize: 12)),
                  ],
                ),
              ],
            ),
            if (description.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                description.length > 180 ? '${description.substring(0, 180)}…' : description,
                style: TextStyle(fontSize: 12, color: palette.textWeak),
              ),
            ],
            if (status == 'pending') ...[
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                children: [
                  OpenCodeButton(
                    onPressed: () => _proposalAction(id, true),
                    variant: OpenCodeButtonVariant.primary,
                    size: OpenCodeButtonSize.small,
                    child: const Text('Approve'),
                  ),
                  OpenCodeButton(
                    onPressed: () => _proposalAction(id, false),
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

  Widget _buildCard(BuildContext context, String title, List<Widget> children) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (title.isNotEmpty) ...[
              Text(title, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 12),
            ],
            ...children,
          ],
        ),
      ),
    );
  }

  Widget _row(String a, String b) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [Text(a), Text(b)],
        ),
      );

  static String _dashRevenue(Map<String, dynamic> m) {
    final met = m['metrics'];
    if (met is! Map) return '-';
    final rev = met['revenue'];
    if (rev is! Map) return '-';
    return rev['total_usd']?.toString() ?? '-';
  }
}
