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
    final client = context.read<AppState>().client;
    if (client == null) return;
    setState(() => _loading = true);
    final jobs = await client.serverRepoIssueJobs(status: _filterStatus, limit: 60);
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

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
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
                Text(
                  prUrl,
                  style: TextStyle(fontSize: 11, color: palette.textWeak),
                  overflow: TextOverflow.ellipsis,
                ),
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

class _JobDetailSheet extends StatelessWidget {
  const _JobDetailSheet({
    required this.job,
    required this.palette,
    required this.scrollController,
  });

  final Map<String, dynamic> job;
  final Oc2Palette palette;
  final ScrollController scrollController;

  @override
  Widget build(BuildContext context) {
    final title = job['issueTitle'] as String? ?? job['issue_title'] as String? ?? '-';
    final repo = job['repoFullName'] as String? ?? job['repo_full_name'] as String? ?? '-';
    final issueNum = job['issueNumber'] ?? job['issue_number'];
    final status = job['status'] as String? ?? '-';
    final prUrl = job['prUrl'] as String? ?? job['pr_url'];
    final prNumber = job['prNumber'] ?? job['pr_number'];
    final isDraft = (job['prDraft'] ?? job['pr_draft']) == 1;
    final branchName = job['branchName'] as String? ?? job['branch_name'];
    final specJsonStr = job['specJson'] as String? ?? job['spec_json'];
    final testFilesStr = job['testFiles'] as String? ?? job['test_files'];
    final docsMarkdown = job['docsMarkdown'] as String? ?? job['docs_markdown'];
    final issueBody = job['issueBody'] as String? ?? job['issue_body'];

    Map<String, dynamic>? spec;
    if (specJsonStr != null && specJsonStr.isNotEmpty) {
      try {
        spec = jsonDecode(specJsonStr) as Map<String, dynamic>;
      } catch (_) {}
    }

    List<dynamic>? testFiles;
    if (testFilesStr != null && testFilesStr.isNotEmpty) {
      try {
        testFiles = jsonDecode(testFilesStr) as List<dynamic>;
      } catch (_) {}
    }

    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).scaffoldBackgroundColor,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
      ),
      child: ListView(
        controller: scrollController,
        padding: const EdgeInsets.all(24),
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(color: palette.borderWeak, borderRadius: BorderRadius.circular(2)),
            ),
          ),
          const SizedBox(height: 16),
          Text('$repo${issueNum != null ? " #$issueNum" : ""}', style: TextStyle(fontSize: 12, color: palette.textWeak)),
          const SizedBox(height: 4),
          Text(title, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            children: [
              _tag(status, context),
              if (branchName != null) _tag(branchName, context, icon: Icons.call_split),
              if (prNumber != null) _tag('PR #$prNumber${isDraft ? " (draft)" : ""}', context, icon: Icons.merge_type),
            ],
          ),
          if (prUrl != null) ...[
            const SizedBox(height: 8),
            SelectableText(prUrl, style: TextStyle(fontSize: 12, color: palette.textWeak)),
          ],
          const SizedBox(height: 16),
          const Divider(),
          if (issueBody != null && issueBody.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('Issue', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(issueBody, style: const TextStyle(fontSize: 13)),
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
                spacing: 8,
                runSpacing: 4,
                children: (spec['files_to_touch'] as List)
                    .map(
                      (f) => Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: palette.backgroundWeak,
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: palette.borderWeak),
                        ),
                        child: Text(f.toString(), style: const TextStyle(fontSize: 11, fontFamily: 'monospace')),
                      ),
                    )
                    .toList(),
              ),
              const SizedBox(height: 16),
            ],
            const Divider(),
          ],
          if (testFiles != null && testFiles.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('Test files (${testFiles.length})', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            ...testFiles.map((f) {
              if (f is Map) {
                final path = f['path']?.toString() ?? f['file']?.toString() ?? '-';
                final content = f['content']?.toString();
                return Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ExpansionTile(
                    title: Text(path, style: const TextStyle(fontSize: 12, fontFamily: 'monospace')),
                    children: [
                      if (content != null)
                        Padding(
                          padding: const EdgeInsets.all(12),
                          child: SelectableText(content, style: const TextStyle(fontSize: 11, fontFamily: 'monospace')),
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
          if (docsMarkdown != null && docsMarkdown.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('Documentation', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            SelectableText(docsMarkdown, style: const TextStyle(fontSize: 13)),
            const SizedBox(height: 16),
          ],
        ],
      ),
    );
  }

  Widget _tag(String label, BuildContext context, {IconData? icon}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.primary.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: Theme.of(context).colorScheme.primary),
            const SizedBox(width: 4),
          ],
          Text(label, style: TextStyle(fontSize: 11, color: Theme.of(context).colorScheme.primary)),
        ],
      ),
    );
  }
}
