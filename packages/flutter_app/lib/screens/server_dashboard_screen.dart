import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../theme/oc2_colors.dart';
import '../theme/button_style.dart';
import '../widgets/opencode_button.dart';

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
  bool _loading = true;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final state = context.read<AppState>();
    final client = state.client;
    if (client == null) return;

    final pipelines = await client.serverPipelines();
    final jobs = await client.serverJobs();
    final goals = await client.serverGoals();
    final proposals = await client.serverProposals();
    if (!mounted) return;

    setState(() {
      _pipelines = pipelines;
      _jobs = jobs;
      _goals = goals;
      _proposals = proposals;
      _loading = false;
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

    await client.serverPipelineRun(id);
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
                      Text(name, style: Theme.of(context).textTheme.titleSmall),
                      Text(strategy, style: TextStyle(fontSize: 12, color: palette.textWeak)),
                    ],
                  ),
                ),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    OpenCodeButton(
                      onPressed: () => _togglePipeline(id, !enabled),
                      variant: OpenCodeButtonVariant.secondary,
                      size: OpenCodeButtonSize.small,
                      child: Text(enabled ? 'Disable' : 'Enable'),
                    ),
                    const SizedBox(width: 8),
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
          ],
        ),
      ),
    );
  }

  Widget _buildProposalCard(BuildContext context, Oc2Palette palette, Map<String, dynamic> pr) {
    final id = pr['id'] as String? ?? '';
    final status = pr['status'] as String? ?? '-';

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Expanded(child: Text(id.substring(0, 8), style: const TextStyle(fontFamily: 'monospace'))),
            Text(status, style: TextStyle(color: palette.textWeak)),
            if (status == 'pending') ...[
              const SizedBox(width: 8),
              OpenCodeButton(
                onPressed: () => _proposalAction(id, true),
                variant: OpenCodeButtonVariant.primary,
                size: OpenCodeButtonSize.small,
                child: const Text('Approve'),
              ),
              const SizedBox(width: 8),
              OpenCodeButton(
                onPressed: () => _proposalAction(id, false),
                variant: OpenCodeButtonVariant.secondary,
                size: OpenCodeButtonSize.small,
                child: const Text('Reject'),
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
}
