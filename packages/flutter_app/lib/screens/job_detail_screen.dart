import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/server_api_client.dart';
import '../state/app_state.dart';
import '../theme/oc2_colors.dart';

/// Full-screen Job Detail page.
///
/// Receives either an initial [job] map (from the list screen) plus a [jobId]
/// for refresh, or just [jobId] to load from scratch.
class JobDetailScreen extends StatefulWidget {
  const JobDetailScreen({
    super.key,
    required this.jobId,
    this.initialJob,
  });

  final String jobId;
  final Map<String, dynamic>? initialJob;

  @override
  State<JobDetailScreen> createState() => _JobDetailScreenState();
}

class _JobDetailScreenState extends State<JobDetailScreen> with SingleTickerProviderStateMixin {
  late TabController _tabs;
  Timer? _timer;

  Map<String, dynamic>? _job;
  bool _loadingJob = true;

  List<Map<String, dynamic>>? _steps;
  bool _loadingSteps = true;

  List<Map<String, dynamic>>? _errors;
  bool _loadingErrors = false;

  bool _retrying = false;
  bool _cancelling = false;

  static const _tabLabels = ['Overview', 'Steps', 'Spec', 'CLI Output', 'Docs'];

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: _tabLabels.length, vsync: this);
    if (widget.initialJob != null) {
      _job = widget.initialJob;
      _loadingJob = false;
    }
    _fetchJob();
    _fetchSteps();
    _timer = Timer.periodic(const Duration(seconds: 15), (_) {
      _fetchJob();
      _fetchSteps();
    });
  }

  @override
  void dispose() {
    _tabs.dispose();
    _timer?.cancel();
    super.dispose();
  }

  ServerApiClient? get _srv => context.read<AppState>().server;

  Future<void> _fetchJob() async {
    final srv = _srv;
    if (srv == null) return;
    final data = await srv.repoIssueJob(widget.jobId);
    if (!mounted) return;
    setState(() {
      if (data != null) _job = data;
      _loadingJob = false;
    });
    final status = _job?['status'] as String?;
    if (status == 'failed' && (_errors == null)) _fetchErrors();
  }

  Future<void> _fetchSteps() async {
    final srv = _srv;
    if (srv == null) return;
    final steps = await srv.repoIssueJobSteps(widget.jobId);
    if (!mounted) return;
    setState(() {
      _steps = steps;
      _loadingSteps = false;
    });
  }

  Future<void> _fetchErrors() async {
    final srv = _srv;
    if (srv == null) return;
    setState(() => _loadingErrors = true);
    final errs = await srv.repoIssueJobErrors(widget.jobId);
    if (!mounted) return;
    setState(() {
      _errors = errs;
      _loadingErrors = false;
    });
  }

  Future<void> _retryJob() async {
    final srv = _srv;
    if (srv == null) return;
    setState(() => _retrying = true);
    final result = await srv.repoIssueJobRetry(widget.jobId);
    if (!mounted) return;
    setState(() => _retrying = false);
    if (result != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Job restarted — check queue for progress'), duration: Duration(seconds: 3)),
      );
      _fetchJob();
      _fetchSteps();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Failed to restart job'), backgroundColor: Colors.red),
      );
    }
  }

  Future<void> _cancelJob() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancel job?'),
        content: const Text('This will stop execution and cancel all pending steps.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Keep')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Cancel job'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    final srv = _srv;
    if (srv == null) return;
    setState(() => _cancelling = true);
    final result = await srv.repoIssueJobCancel(widget.jobId);
    if (!mounted) return;
    setState(() => _cancelling = false);
    if (result != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Job cancelled'), duration: Duration(seconds: 3)),
      );
      _fetchJob();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Failed to cancel job'), backgroundColor: Colors.red),
      );
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  String _ago(dynamic raw) {
    if (raw is! int) return '-';
    final dt = DateTime.fromMillisecondsSinceEpoch(raw * 1000).toLocal();
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }

  String _ts(dynamic raw) {
    if (raw is! int) return '-';
    return DateTime.fromMillisecondsSinceEpoch(raw * 1000).toLocal().toString().substring(0, 16);
  }

  String _duration(dynamic ms) {
    if (ms is! int || ms <= 0) return '-';
    if (ms < 1000) return '${ms}ms';
    final sec = ms ~/ 1000;
    if (sec < 60) return '${sec}s';
    return '${sec ~/ 60}m ${sec % 60}s';
  }

  Color _stepColor(String status) {
    switch (status) {
      case 'completed': return Colors.green;
      case 'failed':    return Colors.red;
      case 'running':   return Colors.blue;
      default:          return Colors.grey;
    }
  }

  IconData _stepIcon(String status) {
    switch (status) {
      case 'completed': return Icons.check_circle_outline;
      case 'failed':    return Icons.error_outline;
      case 'running':   return Icons.sync;
      default:          return Icons.radio_button_unchecked;
    }
  }

  static const _activityHumanLabels = <String, String>{
    'implement-code':    'Implement Code',
    'generate-docs':     'Generate Docs',
    'open-pr':           'Open PR',
    'notify-pr-approval':'PR Approval',
  };

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).brightness == Brightness.dark ? Oc2Colors.dark : Oc2Colors.light;
    final job = _job;
    final status = job?['status'] as String? ?? '';
    final title = job?['issueTitle'] as String? ?? job?['issue_title'] as String? ?? 'Job Detail';
    final issueNum = job?['issueNumber'] ?? job?['issue_number'];
    final repo = job?['repoFullName'] as String? ?? job?['repo_full_name'] as String? ?? '-';
    final isLoading = _loadingJob && job == null;

    return Scaffold(
      appBar: AppBar(
        title: isLoading
            ? const Text('Loading…')
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '$repo${issueNum != null ? " #$issueNum" : ""}',
                    style: TextStyle(fontSize: 11, color: palette.textWeak),
                  ),
                  Text(
                    title,
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
        actions: [
          if (!isLoading && status != 'completed') ...[
            if (status == 'failed' || status == 'cancelled')
              IconButton(
                icon: _retrying
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.restart_alt),
                tooltip: 'Retry',
                onPressed: (_retrying || _cancelling) ? null : _retryJob,
              ),
            if (status != 'cancelled')
              IconButton(
                icon: _cancelling
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.cancel_outlined, color: Colors.red),
                tooltip: 'Cancel',
                onPressed: (_retrying || _cancelling) ? null : _cancelJob,
              ),
          ],
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh',
            onPressed: () { _fetchJob(); _fetchSteps(); },
          ),
        ],
        bottom: TabBar(
          controller: _tabs,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          tabs: _tabLabels.map((l) => Tab(text: l)).toList(),
        ),
      ),
      body: isLoading
          ? const Center(child: CircularProgressIndicator())
          : TabBarView(
              controller: _tabs,
              children: [
                _buildOverview(job!, palette),
                _buildSteps(palette),
                _buildSpec(job, palette),
                _buildCli(job, palette),
                _buildDocs(job, palette),
              ],
            ),
    );
  }

  // ── Overview tab ─────────────────────────────────────────────────────────

  Widget _buildOverview(Map<String, dynamic> job, Oc2Palette palette) {
    final status = job['status'] as String? ?? '-';
    final retryCount = job['retryCount'] ?? job['retry_count'] ?? 0;
    final createdAt = job['createdAt'] ?? job['created_at'];
    final updatedAt = job['updatedAt'] ?? job['updated_at'];
    final branch = job['branchName'] as String? ?? job['branch_name'];
    final fork = job['forkRepoFullName'] as String? ?? job['fork_repo_full_name'];
    final sessionId = job['sessionId'] as String? ?? job['session_id'];
    final prUrl = job['prUrl'] as String? ?? job['pr_url'];
    final prNumber = job['prNumber'] ?? job['pr_number'];
    final isDraft = (job['prDraft'] ?? job['pr_draft']) == 1;
    final body = job['issueBody'] as String? ?? job['issue_body'];
    final failed = status == 'failed';

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Status card row
        Row(children: [
          Expanded(child: _infoCard('Status', status, palette,
              valueColor: failed ? Colors.red : status == 'completed' ? Colors.green : null)),
          const SizedBox(width: 8),
          Expanded(child: _infoCard('Retries', retryCount.toString(), palette)),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: _infoCard('Created', _ts(createdAt), palette)),
          const SizedBox(width: 8),
          Expanded(child: _infoCard('Updated', _ago(updatedAt), palette)),
        ]),
        if (branch != null) ...[
          const SizedBox(height: 8),
          _infoCard('Branch', branch, palette, monospace: true),
        ],
        if (fork != null) ...[
          const SizedBox(height: 8),
          _infoCard('Fork repo', fork, palette, monospace: true),
        ],
        if (prNumber != null) ...[
          const SizedBox(height: 8),
          _infoCard('Pull Request', 'PR #$prNumber${isDraft ? " (draft)" : ""}', palette),
        ],
        if (prUrl != null) ...[
          const SizedBox(height: 4),
          SelectableText(prUrl, style: TextStyle(fontSize: 12, color: palette.textWeak)),
        ],
        if (sessionId != null) ...[
          const SizedBox(height: 8),
          _infoCard('Session ID', sessionId, palette, monospace: true),
        ],
        if (failed) ...[
          const SizedBox(height: 16),
          _buildErrorSection(palette),
        ],
        if (body != null && body.isNotEmpty) ...[
          const SizedBox(height: 16),
          Text('Issue Description', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Theme.of(context).cardColor,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: Theme.of(context).dividerColor),
            ),
            child: SelectableText(body, style: const TextStyle(fontSize: 13, height: 1.5)),
          ),
        ],
      ],
    );
  }

  Widget _infoCard(String label, String value, Oc2Palette palette,
      {bool monospace = false, Color? valueColor}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Theme.of(context).dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(fontSize: 10, color: palette.textWeak)),
          const SizedBox(height: 2),
          Text(
            value,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              fontFamily: monospace ? 'monospace' : null,
              color: valueColor,
            ),
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }

  // ── Steps tab ─────────────────────────────────────────────────────────────

  Widget _buildSteps(Oc2Palette palette) {
    if (_loadingSteps && _steps == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_steps == null || _steps!.isEmpty) {
      return Center(child: Text('No execution steps recorded.', style: TextStyle(color: palette.textWeak)));
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _steps!.length,
      itemBuilder: (_, i) => _buildStepCard(_steps![i], palette),
    );
  }

  Widget _buildStepCard(Map<String, dynamic> step, Oc2Palette palette) {
    final activity = step['activityType'] as String? ?? step['activity_type'] as String? ?? '-';
    final stepStatus = step['status'] as String? ?? 'pending';
    final createdAt = step['createdAt'] ?? step['created_at'];
    final completedAt = step['completedAt'] ?? step['completed_at'];
    final dur = step['durationMs'] ?? step['duration_ms'];
    final errorMsg = step['errorMessage'] as String? ?? step['error_message'];
    final outputRaw = step['outputJson'] as String? ?? step['output_json'];
    final inputRaw = step['inputJson'] as String? ?? step['input_json'];
    final label = _activityHumanLabels[activity] ?? activity.replaceAll('-', ' ').replaceAll('_', ' ');
    final color = _stepColor(stepStatus);

    Map<String, dynamic>? outputMap;
    if (outputRaw != null && outputRaw.isNotEmpty) {
      try { outputMap = jsonDecode(outputRaw) as Map<String, dynamic>; } catch (_) {}
    }
    final summary = outputMap?['summary'] as String?;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: BorderSide(color: color.withOpacity(0.3)),
      ),
      child: ExpansionTile(
        leading: Icon(_stepIcon(stepStatus), color: color, size: 20),
        title: Row(children: [
          Expanded(child: Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500))),
          const SizedBox(width: 8),
          _pill(stepStatus, color),
          if (dur != null) ...[
            const SizedBox(width: 6),
            _pill(_duration(dur), null, palette: palette),
          ],
        ]),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (createdAt != null)
                  Text(
                    'Started: ${_ago(createdAt)}${completedAt != null ? "  ·  Duration: ${_duration(dur)}" : ""}',
                    style: TextStyle(fontSize: 11, color: palette.textWeak),
                  ),
                if (summary != null) ...[
                  const SizedBox(height: 8),
                  Text('Progress', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: palette.textWeak)),
                  const SizedBox(height: 4),
                  Text(summary, style: const TextStyle(fontSize: 12)),
                ],
                if (errorMsg != null) ...[
                  const SizedBox(height: 8),
                  _codeBlock(errorMsg, palette, color: Colors.red),
                ],
                if (inputRaw != null && inputRaw.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  ExpansionTile(
                    tilePadding: EdgeInsets.zero,
                    title: Text('Raw input', style: TextStyle(fontSize: 11, color: palette.textWeak)),
                    children: [
                      _codeBlock(inputRaw, palette),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ── Spec tab ──────────────────────────────────────────────────────────────

  Widget _buildSpec(Map<String, dynamic> job, Oc2Palette palette) {
    final specStr = job['specJson'] as String? ?? job['spec_json'];
    final testStr = job['testFiles'] as String? ?? job['test_files'];

    if ((specStr == null || specStr.isEmpty) && (testStr == null || testStr.isEmpty)) {
      return Center(child: Text('Spec not generated yet.', style: TextStyle(color: palette.textWeak)));
    }

    Map<String, dynamic>? spec;
    if (specStr != null && specStr.isNotEmpty) {
      try { spec = jsonDecode(specStr) as Map<String, dynamic>; } catch (_) {}
    }

    List<dynamic>? tests;
    if (testStr != null && testStr.isNotEmpty) {
      try { tests = jsonDecode(testStr) as List<dynamic>; } catch (_) {}
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (spec != null) ...[
          Text('Spec', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          if (spec['technical_approach'] != null) ...[
            Text('Technical approach', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: palette.textWeak)),
            const SizedBox(height: 4),
            Text(spec['technical_approach'].toString(), style: const TextStyle(fontSize: 13)),
            const SizedBox(height: 12),
          ],
          if (spec['acceptance_criteria'] is List) ...[
            Text('Acceptance criteria', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: palette.textWeak)),
            const SizedBox(height: 4),
            ...(spec['acceptance_criteria'] as List).map((c) => Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('• ', style: TextStyle(fontSize: 13)),
                  Expanded(child: Text(c.toString(), style: const TextStyle(fontSize: 13))),
                ],
              ),
            )),
            const SizedBox(height: 12),
          ],
          if (spec['files_to_touch'] is List) ...[
            Text('Files to touch', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: palette.textWeak)),
            const SizedBox(height: 4),
            Wrap(
              spacing: 8, runSpacing: 4,
              children: (spec['files_to_touch'] as List).map((f) => Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: palette.backgroundWeak,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: palette.borderWeak),
                ),
                child: Text(f.toString(), style: const TextStyle(fontSize: 11, fontFamily: 'monospace')),
              )).toList(),
            ),
            const SizedBox(height: 16),
          ],
          // Raw JSON fallback
          ExpansionTile(
            tilePadding: EdgeInsets.zero,
            title: Text('Raw JSON', style: TextStyle(fontSize: 12, color: palette.textWeak)),
            children: [
              _codeBlock(const JsonEncoder.withIndent('  ').convert(spec), palette),
            ],
          ),
          const Divider(height: 24),
        ],
        if (tests != null && tests.isNotEmpty) ...[
          Text('Test files (${tests.length})', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          ...tests.map((f) {
            if (f is Map) {
              final p = f['path']?.toString() ?? f['file']?.toString() ?? '-';
              final c = f['content']?.toString();
              return Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ExpansionTile(
                  title: Text(p, style: const TextStyle(fontSize: 12, fontFamily: 'monospace')),
                  children: [
                    if (c != null) _codeBlock(c, palette),
                  ],
                ),
              );
            }
            return Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(f.toString(), style: const TextStyle(fontSize: 12, fontFamily: 'monospace')),
            );
          }),
        ],
      ],
    );
  }

  // ── CLI Output tab ────────────────────────────────────────────────────────

  Widget _buildCli(Map<String, dynamic> job, Oc2Palette palette) {
    final cliOutput = job['cliOutput'] as String? ?? job['cli_output'] as String?;
    final sessionId = job['sessionId'] as String? ?? job['session_id'];

    if (cliOutput == null || cliOutput.isEmpty) {
      return Center(child: Text('CLI output not available.', style: TextStyle(color: palette.textWeak)));
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (sessionId != null) ...[
          Row(children: [
            Text('Session: ', style: TextStyle(fontSize: 12, color: palette.textWeak)),
            Expanded(
              child: SelectableText(
                sessionId,
                style: const TextStyle(fontSize: 12, fontFamily: 'monospace'),
              ),
            ),
          ]),
          const SizedBox(height: 12),
        ],
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFF0D1117),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: Colors.white12),
          ),
          child: SelectableText(
            cliOutput,
            style: const TextStyle(
              fontSize: 11,
              fontFamily: 'monospace',
              height: 1.5,
              color: Color(0xFFE6EDF3),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          '${cliOutput.length} characters',
          style: TextStyle(fontSize: 11, color: palette.textWeak),
          textAlign: TextAlign.right,
        ),
      ],
    );
  }

  // ── Docs tab ──────────────────────────────────────────────────────────────

  Widget _buildDocs(Map<String, dynamic> job, Oc2Palette palette) {
    final docs = job['docsMarkdown'] as String? ?? job['docs_markdown'];
    if (docs == null || docs.isEmpty) {
      return Center(child: Text('Documentation not generated yet.', style: TextStyle(color: palette.textWeak)));
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        SelectableText(docs, style: const TextStyle(fontSize: 13, height: 1.6)),
      ],
    );
  }

  // ── Error section (used in Overview) ─────────────────────────────────────

  Widget _buildErrorSection(Oc2Palette palette) {
    if (_loadingErrors) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.red.withOpacity(0.08),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.red.withOpacity(0.3)),
        ),
        child: const Row(children: [
          SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.red)),
          SizedBox(width: 12),
          Text('Loading error details…', style: TextStyle(fontSize: 13, color: Colors.red)),
        ]),
      );
    }

    final errors = _errors;
    if (errors == null || errors.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.red.withOpacity(0.08),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.red.withOpacity(0.3)),
        ),
        child: const Row(children: [
          Icon(Icons.error_outline, color: Colors.red, size: 20),
          SizedBox(width: 12),
          Expanded(child: Text('This job failed but no detailed error was recorded.', style: TextStyle(fontSize: 13, color: Colors.red))),
        ]),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: errors.asMap().entries.map((entry) {
        final err = entry.value;
        final activity = err['activityType'] as String? ?? err['activity_type'] as String? ?? '-';
        final msg = err['errorMessage'] as String? ?? err['error_message'] as String? ?? 'Unknown error';
        final completed = err['completedAt'] ?? err['completed_at'];
        final dur = err['durationMs'] ?? err['duration_ms'];

        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.red.withOpacity(0.08),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.red.withOpacity(0.3)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                const Icon(Icons.error_outline, color: Colors.red, size: 18),
                const SizedBox(width: 8),
                Expanded(child: Text(_activityLabel(activity), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.red))),
                if (completed != null)
                  Text(_ago(completed), style: TextStyle(fontSize: 11, color: palette.textWeak)),
              ]),
              const SizedBox(height: 10),
              _codeBlock(msg, palette, color: Colors.red),
              if (dur != null) ...[
                const SizedBox(height: 8),
                Text(_duration(dur), style: TextStyle(fontSize: 11, color: palette.textWeak)),
              ],
            ],
          ),
        );
      }).toList(),
    );
  }

  // ── Small shared widgets ──────────────────────────────────────────────────

  Widget _pill(String label, Color? color, {Oc2Palette? palette}) {
    final c = color ?? Theme.of(context).colorScheme.outline;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: c.withOpacity(0.12),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: c.withOpacity(0.4)),
      ),
      child: Text(label, style: TextStyle(fontSize: 10, color: palette != null ? palette.textWeak : c, fontWeight: FontWeight.w600)),
    );
  }

  Widget _codeBlock(String content, Oc2Palette palette, {Color? color}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: (color ?? Colors.transparent).withOpacity(color != null ? 0.06 : 0),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: (color ?? palette.borderWeak).withOpacity(color != null ? 0.3 : 1)),
      ),
      child: SelectableText(
        content,
        style: TextStyle(fontSize: 11, fontFamily: 'monospace', color: color, height: 1.4),
      ),
    );
  }

  String _activityLabel(String raw) {
    switch (raw) {
      case 'generate_spec':       return 'Spec Generation';
      case 'generate_tdd_tests':  return 'TDD Tests';
      case 'implement_code':      return 'Code Implementation';
      case 'implement-code':      return 'Code Implementation';
      case 'generate-docs':       return 'Documentation';
      case 'generate_docs':       return 'Documentation';
      case 'open-pr':             return 'PR Opening';
      case 'open_pr':             return 'PR Opening';
      case 'notify-pr-approval':  return 'PR Approval';
      case 'notify_pr_approval':  return 'PR Approval';
      default: return raw.replaceAll('_', ' ').replaceAll('-', ' ');
    }
  }
}
