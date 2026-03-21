import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../theme/oc2_colors.dart';

/// Screen showing the Agent → Issues → PR pipeline job progress.
class RepoJobsScreen extends StatefulWidget {
  const RepoJobsScreen({super.key});

  @override
  State<RepoJobsScreen> createState() => _RepoJobsScreenState();
}

class _RepoJobsScreenState extends State<RepoJobsScreen> {
  List<Map<String, dynamic>>? _jobs;
  bool _loading = true;
  String? _filterStatus;

  static const _steps = ['pending', 'spec', 'tests', 'implementing', 'docs', 'pr-open', 'completed'];
  static const _stepLabels = ['Queued', 'Spec', 'Tests', 'Code', 'Docs', 'PR', 'Done'];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final srv = context.read<AppState>().server;
    if (srv == null) return;
    setState(() => _loading = true);
    final jobs = await srv.repoIssueJobs(status: _filterStatus, limit: 60);
    if (!mounted) return;
    setState(() {
      _jobs = jobs;
      _loading = false;
    });
  }

  void _showDetail(Map<String, dynamic> job) {
    final palette = Theme.of(context).brightness == Brightness.dark ? Oc2Colors.dark : Oc2Colors.light;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => DraggableScrollableSheet(
        initialChildSize: 0.75,
        maxChildSize: 0.95,
        minChildSize: 0.4,
        expand: false,
        builder: (_, scroll) => _JobDetailSheet(job: job, palette: palette, scrollController: scroll),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).brightness == Brightness.dark ? Oc2Colors.dark : Oc2Colors.light;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Repo Issue Jobs'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load, tooltip: 'Refresh'),
        ],
      ),
      body: Column(
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                _filterChip('All', null, palette),
                ..._steps.map((s) => _filterChip(_labelFor(s), s, palette)),
                _filterChip('Failed', 'failed', palette),
              ],
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : (_jobs == null || _jobs!.isEmpty)
                    ? Center(child: Text('No jobs found', style: TextStyle(color: palette.textWeak)))
                    : RefreshIndicator(
                        onRefresh: _load,
                        child: ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: _jobs!.length,
                          itemBuilder: (_, i) => _buildJobCard(_jobs![i], palette),
                        ),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _filterChip(String label, String? value, Oc2Palette palette) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: FilterChip(
          label: Text(label, style: const TextStyle(fontSize: 12)),
          selected: _filterStatus == value,
          onSelected: (_) {
            setState(() => _filterStatus = value);
            _load();
          },
        ),
      );

  Widget _buildJobCard(Map<String, dynamic> job, Oc2Palette palette) {
    final repo = job['repoFullName'] as String? ?? job['repo_full_name'] as String? ?? '-';
    final issueNum = job['issueNumber'] ?? job['issue_number'];
    final title = job['issueTitle'] as String? ?? job['issue_title'] as String? ?? '-';
    final status = job['status'] as String? ?? 'pending';
    final prUrl = job['prUrl'] as String? ?? job['pr_url'];
    final failed = status == 'failed';

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: failed ? BorderSide(color: Colors.red.withOpacity(0.4)) : BorderSide.none,
      ),
      child: InkWell(
        onTap: () => _showDetail(job),
        borderRadius: BorderRadius.circular(12),
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
                        Text(
                          '$repo${issueNum != null ? " #$issueNum" : ""}',
                          style: TextStyle(fontSize: 12, color: palette.textWeak),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          title,
                          style: const TextStyle(fontWeight: FontWeight.w500),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  _statusBadge(status, context),
                ],
              ),
              const SizedBox(height: 12),
              _StepProgress(status: status, steps: _steps, stepLabels: _stepLabels),
              if (prUrl != null) ...[
                const SizedBox(height: 8),
                Text(prUrl, style: TextStyle(fontSize: 11, color: palette.textWeak), overflow: TextOverflow.ellipsis),
              ],
              if (failed) ...[
                const SizedBox(height: 8),
                Row(children: [
                  Icon(Icons.error_outline, size: 14, color: Colors.red.withOpacity(0.7)),
                  const SizedBox(width: 6),
                  Text(
                    'Tap to inspect error',
                    style: TextStyle(fontSize: 11, color: Colors.red.withOpacity(0.7), fontStyle: FontStyle.italic),
                  ),
                ]),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _statusBadge(String status, BuildContext context) {
    Color color;
    switch (status) {
      case 'completed':
        color = Colors.green;
      case 'failed':
        color = Colors.red;
      case 'pr-open':
        color = Colors.purple;
      case 'pending':
        color = Colors.grey;
      default:
        color = Theme.of(context).colorScheme.primary;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.15),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.4)),
      ),
      child: Text(status, style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w600)),
    );
  }

  String _labelFor(String status) {
    switch (status) {
      case 'implementing':
        return 'Code';
      case 'pr-open':
        return 'PR Open';
      case 'completed':
        return 'Done';
      default:
        return status[0].toUpperCase() + status.substring(1);
    }
  }
}

class _StepProgress extends StatelessWidget {
  const _StepProgress({
    required this.status,
    required this.steps,
    required this.stepLabels,
  });

  final String status;
  final List<String> steps;
  final List<String> stepLabels;

  @override
  Widget build(BuildContext context) {
    final failed = status == 'failed';
    final idx = failed ? -1 : steps.indexOf(status);

    return Row(
      children: List.generate(steps.length, (i) {
        Color color;
        if (failed) {
          color = Colors.grey.withOpacity(0.3);
        } else if (i < idx) {
          color = Colors.green;
        } else if (i == idx) {
          color = Theme.of(context).colorScheme.primary;
        } else {
          color = Colors.grey.withOpacity(0.3);
        }

        return Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 1),
            child: Column(
              children: [
                Container(height: 4, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2))),
                const SizedBox(height: 3),
                Text(
                  stepLabels[i],
                  style: TextStyle(
                    fontSize: 8,
                    color: (!failed && (i <= idx)) ? color : Colors.grey.withOpacity(0.5),
                    fontWeight: i == idx ? FontWeight.bold : FontWeight.normal,
                  ),
                  textAlign: TextAlign.center,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        );
      }),
    );
  }
}

class _JobDetailSheet extends StatefulWidget {
  const _JobDetailSheet({
    required this.job,
    required this.palette,
    required this.scrollController,
  });

  final Map<String, dynamic> job;
  final Oc2Palette palette;
  final ScrollController scrollController;

  @override
  State<_JobDetailSheet> createState() => _JobDetailSheetState();
}

class _JobDetailSheetState extends State<_JobDetailSheet> {
  List<Map<String, dynamic>>? _errors;
  bool _loadingErrors = false;
  List<Map<String, dynamic>>? _steps;
  bool _loadingSteps = false;
  bool _retrying = false;
  bool _cancelling = false;

  @override
  void initState() {
    super.initState();
    final status = widget.job['status'] as String? ?? '';
    if (status == 'failed') _fetchErrors();
    _fetchSteps();
  }

  Future<void> _fetchSteps() async {
    final id = widget.job['id'] as String?;
    if (id == null) return;
    final srv = context.read<AppState>().server;
    if (srv == null) return;
    setState(() => _loadingSteps = true);
    final steps = await srv.repoIssueJobSteps(id);
    if (!mounted) return;
    setState(() { _steps = steps; _loadingSteps = false; });
  }

  Future<void> _fetchErrors() async {
    final id = widget.job['id'] as String?;
    if (id == null) return;
    final srv = context.read<AppState>().server;
    if (srv == null) return;
    setState(() => _loadingErrors = true);
    final errs = await srv.repoIssueJobErrors(id);
    if (!mounted) return;
    setState(() {
      _errors = errs;
      _loadingErrors = false;
    });
  }

  Future<void> _cancelJob() async {
    final id = widget.job['id'] as String?;
    if (id == null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancel job?'),
        content: const Text('This will stop execution and cancel all pending steps. The job can be restarted later.'),
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
    final srv = context.read<AppState>().server;
    if (srv == null) return;
    setState(() => _cancelling = true);
    final result = await srv.repoIssueJobCancel(id);
    if (!mounted) return;
    setState(() => _cancelling = false);
    if (result != null) {
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Job cancelled'), duration: Duration(seconds: 3)),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Failed to cancel job'), backgroundColor: Colors.red),
      );
    }
  }

  Future<void> _retryJob() async {
    final id = widget.job['id'] as String?;
    if (id == null) return;
    final srv = context.read<AppState>().server;
    if (srv == null) return;
    setState(() => _retrying = true);
    final result = await srv.repoIssueJobRetry(id);
    if (!mounted) return;
    setState(() => _retrying = false);
    if (result != null) {
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Job restarted — check queue for progress'), duration: Duration(seconds: 3)),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Failed to restart job'), backgroundColor: Colors.red),
      );
    }
  }

  String _ago(dynamic raw) {
    if (raw is! int) return '-';
    final dt = DateTime.fromMillisecondsSinceEpoch(raw * 1000).toLocal();
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }

  String _duration(dynamic ms) {
    if (ms is! int || ms <= 0) return '-';
    if (ms < 1000) return '${ms}ms';
    final sec = ms ~/ 1000;
    if (sec < 60) return '${sec}s';
    return '${sec ~/ 60}m ${sec % 60}s';
  }

  @override
  Widget build(BuildContext context) {
    final job = widget.job;
    final palette = widget.palette;
    final title = job['issueTitle'] as String? ?? job['issue_title'] as String? ?? '-';
    final repo = job['repoFullName'] as String? ?? job['repo_full_name'] as String? ?? '-';
    final issueNum = job['issueNumber'] ?? job['issue_number'];
    final status = job['status'] as String? ?? '-';
    final prUrl = job['prUrl'] as String? ?? job['pr_url'];
    final prNumber = job['prNumber'] ?? job['pr_number'];
    final isDraft = (job['prDraft'] ?? job['pr_draft']) == 1;
    final branch = job['branchName'] as String? ?? job['branch_name'];
    final specStr = job['specJson'] as String? ?? job['spec_json'];
    final testStr = job['testFiles'] as String? ?? job['test_files'];
    final docs = job['docsMarkdown'] as String? ?? job['docs_markdown'];
    final body = job['issueBody'] as String? ?? job['issue_body'];
    final failed = status == 'failed';

    Map<String, dynamic>? spec;
    if (specStr != null && specStr.isNotEmpty) {
      try { spec = jsonDecode(specStr) as Map<String, dynamic>; } catch (_) {}
    }

    List<dynamic>? tests;
    if (testStr != null && testStr.isNotEmpty) {
      try { tests = jsonDecode(testStr) as List<dynamic>; } catch (_) {}
    }

    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).scaffoldBackgroundColor,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
      ),
      child: ListView(
        controller: widget.scrollController,
        padding: const EdgeInsets.all(24),
        children: [
          Center(
            child: Container(
              width: 40, height: 4,
              decoration: BoxDecoration(color: palette.borderWeak, borderRadius: BorderRadius.circular(2)),
            ),
          ),
          const SizedBox(height: 16),
          Text('$repo${issueNum != null ? " #$issueNum" : ""}', style: TextStyle(fontSize: 12, color: palette.textWeak)),
          const SizedBox(height: 4),
          Text(title, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 4, children: [
            _tag(status, context, color: failed ? Colors.red : null),
            if (branch != null) _tag(branch, context, icon: Icons.call_split),
            if (prNumber != null) _tag('PR #$prNumber${isDraft ? " (draft)" : ""}', context, icon: Icons.merge_type),
          ]),
          if (prUrl != null) ...[
            const SizedBox(height: 8),
            SelectableText(prUrl, style: TextStyle(fontSize: 12, color: palette.textWeak)),
          ],

          // ── Job actions ──
          if (!['completed', 'cancelled'].contains(status)) ...[
            const SizedBox(height: 16),
            Row(children: [
              // Restart — only for failed jobs
              if (failed) ...[
                Expanded(
                  child: FilledButton.icon(
                    onPressed: (_retrying || _cancelling) ? null : _retryJob,
                    icon: _retrying
                        ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Icon(Icons.restart_alt, size: 18),
                    label: Text(_retrying ? 'Restarting…' : 'Restart'),
                    style: FilledButton.styleFrom(
                      backgroundColor: Colors.orange.shade700,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
              ],
              // Cancel — visible for all non-terminal statuses
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: (_retrying || _cancelling) ? null : _cancelJob,
                  icon: _cancelling
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.red))
                      : const Icon(Icons.cancel_outlined, size: 18, color: Colors.red),
                  label: Text(_cancelling ? 'Cancelling…' : 'Cancel Job',
                      style: const TextStyle(color: Colors.red)),
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: Colors.red),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                ),
              ),
            ]),
          ],

          // ── Error section ──
          if (failed) ...[
            const SizedBox(height: 16),
            _buildErrorSection(palette),
          ],

          // ── Execution Chain ──
          const SizedBox(height: 16),
          _buildExecutionChainSection(palette),

          // ── CLI Output ──
          ..._buildCliOutputSection(job, palette),

          const SizedBox(height: 16),
          const Divider(),
          if (body != null && body.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('Issue', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(body, style: const TextStyle(fontSize: 13)),
            const SizedBox(height: 16),
            const Divider(),
          ],
          if (spec != null) ...[
            const SizedBox(height: 8),
            Text('Spec', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            if (spec['technical_approach'] != null) ...[
              Text('Technical approach', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: palette.textWeak)),
              const SizedBox(height: 4),
              Text(spec['technical_approach'].toString(), style: const TextStyle(fontSize: 13)),
              const SizedBox(height: 12),
            ],
            if (spec['acceptance_criteria'] is List) ...[
              Text('Acceptance criteria', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: palette.textWeak)),
              const SizedBox(height: 4),
              ...(spec['acceptance_criteria'] as List).map(
                (c) => Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('• ', style: TextStyle(fontSize: 13)),
                      Expanded(child: Text(c.toString(), style: const TextStyle(fontSize: 13))),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
            ],
            if (spec['files_to_touch'] is List) ...[
              Text('Files to touch', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: palette.textWeak)),
              const SizedBox(height: 4),
              Wrap(
                spacing: 8, runSpacing: 4,
                children: (spec['files_to_touch'] as List)
                    .map((f) => Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: palette.backgroundWeak,
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(color: palette.borderWeak),
                      ),
                      child: Text(f.toString(), style: const TextStyle(fontSize: 11, fontFamily: 'monospace')),
                    ))
                    .toList(),
              ),
              const SizedBox(height: 16),
            ],
            const Divider(),
          ],
          if (tests != null && tests.isNotEmpty) ...[
            const SizedBox(height: 8),
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
                      if (c != null)
                        Padding(
                          padding: const EdgeInsets.all(12),
                          child: SelectableText(c, style: const TextStyle(fontSize: 11, fontFamily: 'monospace')),
                        ),
                    ],
                  ),
                );
              }
              return Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text(f.toString(), style: const TextStyle(fontSize: 12, fontFamily: 'monospace')),
              );
            }),
            const SizedBox(height: 16),
            const Divider(),
          ],
          if (docs != null && docs.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('Documentation', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            SelectableText(docs, style: const TextStyle(fontSize: 13)),
            const SizedBox(height: 16),
          ],
        ],
      ),
    );
  }

  static const _activityHumanLabels = <String, String>{
    'implement-code': 'Implement Code',
    'generate-docs': 'Generate Docs',
    'open-pr': 'Open PR',
    'notify-pr-approval': 'PR Approval',
  };

  Color _stepColor(String status) {
    switch (status) {
      case 'completed': return Colors.green;
      case 'failed': return Colors.red;
      case 'running': return Colors.blue;
      default: return Colors.grey;
    }
  }

  IconData _stepIcon(String status) {
    switch (status) {
      case 'completed': return Icons.check_circle_outline;
      case 'failed': return Icons.error_outline;
      case 'running': return Icons.sync;
      default: return Icons.radio_button_unchecked;
    }
  }

  Widget _buildExecutionChainSection(Oc2Palette palette) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Execution Chain', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: palette.textWeak)),
        const SizedBox(height: 8),
        if (_loadingSteps)
          const Center(child: CircularProgressIndicator())
        else if (_steps == null || _steps!.isEmpty)
          Text('No execution steps recorded.', style: TextStyle(fontSize: 12, color: palette.textWeak))
        else
          ..._steps!.map((step) {
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
                title: Row(
                  children: [
                    Expanded(child: Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500))),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                      decoration: BoxDecoration(
                        color: color.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: color.withOpacity(0.4)),
                      ),
                      child: Text(stepStatus, style: TextStyle(fontSize: 10, color: color, fontWeight: FontWeight.w600)),
                    ),
                    if (dur != null) ...[
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                        decoration: BoxDecoration(
                          color: palette.backgroundWeak,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(_duration(dur), style: TextStyle(fontSize: 10, color: palette.textWeak)),
                      ),
                    ],
                  ],
                ),
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (createdAt != null)
                          Text(
                            'Started: ${_ago(createdAt)}${completedAt != null ? " · Duration: ${_duration(dur)}" : ""}',
                            style: TextStyle(fontSize: 11, color: palette.textWeak),
                          ),
                        if (summary != null) ...[
                          const SizedBox(height: 8),
                          Text('Progress note', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: palette.textWeak)),
                          const SizedBox(height: 4),
                          Text(summary, style: const TextStyle(fontSize: 12)),
                        ],
                        if (errorMsg != null) ...[
                          const SizedBox(height: 8),
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: Colors.red.withOpacity(0.08),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: Colors.red.withOpacity(0.3)),
                            ),
                            child: SelectableText(
                              errorMsg,
                              style: const TextStyle(fontSize: 11, fontFamily: 'monospace', color: Colors.red, height: 1.4),
                            ),
                          ),
                        ],
                        if (inputRaw != null && inputRaw.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          ExpansionTile(
                            tilePadding: EdgeInsets.zero,
                            title: Text('Raw input', style: TextStyle(fontSize: 11, color: palette.textWeak)),
                            children: [
                              Container(
                                width: double.infinity,
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(
                                  color: palette.backgroundWeak,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: SelectableText(
                                  inputRaw,
                                  style: const TextStyle(fontSize: 10, fontFamily: 'monospace', height: 1.4),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            );
          }),
      ],
    );
  }

  List<Widget> _buildCliOutputSection(Map<String, dynamic> job, Oc2Palette palette) {
    final cliOutput = job['cliOutput'] as String? ?? job['cli_output'] as String?;
    if (cliOutput == null || cliOutput.isEmpty) return [];
    return [
      const SizedBox(height: 8),
      Text('CLI Output', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: palette.textWeak)),
      const SizedBox(height: 8),
      Card(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        child: ExpansionTile(
          title: Text('Show output (${cliOutput.length} chars)', style: const TextStyle(fontSize: 12)),
          children: [
            Container(
              width: double.infinity,
              constraints: const BoxConstraints(maxHeight: 300),
              padding: const EdgeInsets.all(12),
              child: SingleChildScrollView(
                child: SelectableText(
                  cliOutput,
                  style: const TextStyle(fontSize: 11, fontFamily: 'monospace', height: 1.4),
                ),
              ),
            ),
          ],
        ),
      ),
    ];
  }

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

    if (_errors == null || _errors!.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.red.withOpacity(0.08),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.red.withOpacity(0.3)),
        ),
        child: Row(children: [
          const Icon(Icons.error_outline, color: Colors.red, size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              'This job failed but no detailed error was recorded.',
              style: TextStyle(fontSize: 13, color: Colors.red.shade700),
            ),
          ),
        ]),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: _errors!.asMap().entries.map((entry) {
        final i = entry.key;
        final err = entry.value;
        final activity = err['activityType'] as String? ?? err['activity_type'] as String? ?? '-';
        final msg = err['errorMessage'] as String? ?? err['error_message'] as String? ?? 'Unknown error';
        final completed = err['completedAt'] ?? err['completed_at'];
        final dur = err['durationMs'] ?? err['duration_ms'];
        final trigger = err['triggeredBy'] as String? ?? err['triggered_by'];

        return Container(
          margin: EdgeInsets.only(bottom: i < _errors!.length - 1 ? 8 : 0),
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
                Expanded(
                  child: Text(
                    _activityLabel(activity),
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.red),
                  ),
                ),
                if (completed != null)
                  Text(_ago(completed), style: TextStyle(fontSize: 11, color: palette.textWeak)),
              ]),
              const SizedBox(height: 10),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: palette.backgroundWeak,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: SelectableText(
                  msg,
                  style: const TextStyle(fontSize: 12, fontFamily: 'monospace', height: 1.5),
                ),
              ),
              const SizedBox(height: 8),
              Wrap(spacing: 16, runSpacing: 4, children: [
                if (dur != null) _meta(Icons.timer_outlined, _duration(dur), palette),
                if (trigger != null) _meta(Icons.play_arrow_outlined, trigger, palette),
              ]),
            ],
          ),
        );
      }).toList(),
    );
  }

  Widget _meta(IconData icon, String text, Oc2Palette palette) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: palette.textWeak),
          const SizedBox(width: 4),
          Text(text, style: TextStyle(fontSize: 11, color: palette.textWeak)),
        ],
      );

  String _activityLabel(String raw) {
    switch (raw) {
      case 'generate_spec': return 'Spec Generation';
      case 'generate_tdd_tests': return 'TDD Tests';
      case 'implement_code': return 'Code Implementation';
      case 'generate_docs': return 'Documentation';
      case 'open_pr': return 'PR Opening';
      case 'notify_pr_approval': return 'PR Approval';
      default: return raw.replaceAll('_', ' ');
    }
  }

  Widget _tag(String label, BuildContext context, {IconData? icon, Color? color}) {
    final c = color ?? Theme.of(context).colorScheme.primary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: c.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: c),
            const SizedBox(width: 4),
          ],
          Text(label, style: TextStyle(fontSize: 11, color: c)),
        ],
      ),
    );
  }
}
