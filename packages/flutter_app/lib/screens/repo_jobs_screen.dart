import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../theme/oc2_colors.dart';
import 'job_detail_screen.dart';

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
    final id = job['id'] as String?;
    if (id == null) return;
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => JobDetailScreen(jobId: id, initialJob: job),
      ),
    ).then((_) => _load()); // refresh list when returning
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

