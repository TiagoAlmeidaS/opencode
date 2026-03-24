import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../theme/oc2_colors.dart';
import '../widgets/opencode_button.dart';
import 'repo_jobs_screen.dart';

/// Screen to browse GitHub issues for a repository and queue dev-cycle jobs.
class RepoIssuesScreen extends StatefulWidget {
  const RepoIssuesScreen({super.key});

  @override
  State<RepoIssuesScreen> createState() => _RepoIssuesScreenState();
}

class _RepoIssuesScreenState extends State<RepoIssuesScreen> {
  final _repoController = TextEditingController();
  List<Map<String, dynamic>>? _issues;
  bool _loading = false;
  String? _error;
  String _state = 'open';
  String? _currentRepo;

  // Pre-fill suggestions from existing jobs
  List<String> _repoSuggestions = [];

  Oc2Palette get _palette =>
      Theme.of(context).brightness == Brightness.dark ? Oc2Colors.dark : Oc2Colors.light;

  @override
  void initState() {
    super.initState();
    _loadSuggestions();
  }

  @override
  void dispose() {
    _repoController.dispose();
    super.dispose();
  }

  Future<void> _loadSuggestions() async {
    final srv = context.read<AppState>().server;
    if (srv == null) return;
    final jobs = await srv.repoIssueJobs(limit: 100);
    if (!mounted || jobs == null) return;
    final repos = jobs
        .map((j) => j['repoFullName'] as String? ?? j['repo_full_name'] as String? ?? '')
        .where((r) => r.isNotEmpty)
        .toSet()
        .toList()
      ..sort();
    setState(() => _repoSuggestions = repos);
  }

  Future<void> _fetchIssues() async {
    final repo = _repoController.text.trim();
    if (repo.isEmpty) return;
    if (!repo.contains('/') || repo.split('/').length != 2) {
      setState(() => _error = 'Use o formato owner/repo (ex: facebook/react)');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
      _issues = null;
      _currentRepo = repo;
    });

    final parts = repo.split('/');
    final srv = context.read<AppState>().server;
    if (srv == null) {
      setState(() {
        _loading = false;
        _error = 'Servidor não conectado';
      });
      return;
    }

    try {
      final issues = await srv.repoIssues(parts[0], parts[1], state: _state, limit: 50);
      if (!mounted) return;
      setState(() {
        _loading = false;
        _issues = issues ?? [];
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _showIssueDetail(Map<String, dynamic> issue) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => _IssueDetailSheet(
        issue: issue,
        repo: _currentRepo ?? '',
        onJobQueued: () {
          Navigator.of(ctx).pop();
          Navigator.of(context).push(
            MaterialPageRoute<void>(builder: (_) => const RepoJobsScreen()),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final palette = _palette;
    return Scaffold(
      backgroundColor: palette.backgroundBase,
      appBar: AppBar(
        backgroundColor: palette.backgroundBase,
        foregroundColor: palette.textStrong,
        title: const Text('Repo Issues'),
      ),
      body: Column(
        children: [
          // Search bar
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Row(
              children: [
                Expanded(
                  child: _repoSuggestions.isEmpty
                      ? TextField(
                          controller: _repoController,
                          decoration: InputDecoration(
                            hintText: 'owner/repo (ex: facebook/react)',
                            prefixIcon: const Icon(Icons.code),
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                          ),
                          onSubmitted: (_) => _fetchIssues(),
                          textInputAction: TextInputAction.search,
                        )
                      : Autocomplete<String>(
                          optionsBuilder: (v) => _repoSuggestions
                              .where((s) => s.toLowerCase().contains(v.text.toLowerCase()))
                              .toList(),
                          onSelected: (s) {
                            _repoController.text = s;
                            _fetchIssues();
                          },
                          fieldViewBuilder: (ctx, ctrl, focusNode, onSubmit) {
                            // Keep external controller in sync
                            ctrl.text = _repoController.text;
                            ctrl.addListener(() => _repoController.text = ctrl.text);
                            return TextField(
                              controller: ctrl,
                              focusNode: focusNode,
                              decoration: InputDecoration(
                                hintText: 'owner/repo',
                                prefixIcon: const Icon(Icons.code),
                                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                                contentPadding:
                                    const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                              ),
                              onSubmitted: (_) => _fetchIssues(),
                              textInputAction: TextInputAction.search,
                            );
                          },
                        ),
                ),
                const SizedBox(width: 8),
                OpenCodeButton(
                  onPressed: _loading ? null : _fetchIssues,
                  variant: OpenCodeButtonVariant.primary,
                  child: _loading
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Text('Buscar'),
                ),
              ],
            ),
          ),
          // State filter
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: Row(
              children: [
                _stateChip('open', 'Open', Colors.green),
                const SizedBox(width: 8),
                _stateChip('closed', 'Closed', Colors.red),
                const SizedBox(width: 8),
                _stateChip('all', 'All', Colors.grey),
              ],
            ),
          ),
          // Repo suggestions chips
          if (_repoSuggestions.isNotEmpty && _issues == null && !_loading)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  children: _repoSuggestions.take(6).map((r) {
                    return ActionChip(
                      label: Text(r, style: const TextStyle(fontSize: 12)),
                      avatar: const Icon(Icons.history, size: 14),
                      onPressed: () {
                        _repoController.text = r;
                        _fetchIssues();
                      },
                    );
                  }).toList(),
                ),
              ),
            ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Row(
                children: [
                  const Icon(Icons.error_outline, size: 16, color: Colors.red),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 13)),
                  ),
                ],
              ),
            ),
          // List
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _issues == null
                    ? Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.bug_report_outlined, size: 56, color: palette.textWeak),
                            const SizedBox(height: 12),
                            Text(
                              'Digite owner/repo e pressione Buscar',
                              style: TextStyle(color: palette.textWeak),
                            ),
                          ],
                        ),
                      )
                    : _issues!.isEmpty
                        ? Center(
                            child: Text(
                              'Nenhuma issue encontrada',
                              style: TextStyle(color: palette.textWeak),
                            ),
                          )
                        : ListView.builder(
                            padding: const EdgeInsets.all(16),
                            itemCount: _issues!.length,
                            itemBuilder: (_, i) => _buildIssueCard(_issues![i], palette),
                          ),
          ),
        ],
      ),
    );
  }

  Widget _stateChip(String value, String label, Color color) {
    final selected = _state == value;
    return FilterChip(
      label: Text(label, style: const TextStyle(fontSize: 12)),
      selected: selected,
      selectedColor: color.withValues(alpha: 0.2),
      checkmarkColor: color,
      onSelected: (_) {
        setState(() => _state = value);
        if (_issues != null) _fetchIssues();
      },
    );
  }

  Widget _buildIssueCard(Map<String, dynamic> issue, Oc2Palette palette) {
    final number = issue['number'] as int? ?? 0;
    final title = issue['title'] as String? ?? '';
    final state = issue['state'] as String? ?? 'open';
    final labels = (issue['labels'] as List<dynamic>?)?.cast<String>() ?? [];
    final comments = issue['comments'] as int? ?? 0;
    final user = issue['user'] as String?;
    final isOpen = state == 'open';

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: InkWell(
        onTap: () => _showIssueDetail(issue),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    isOpen ? Icons.radio_button_unchecked : Icons.check_circle_outline,
                    size: 18,
                    color: isOpen ? Colors.green : Colors.purple,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      title,
                      style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 14),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '#$number',
                    style: TextStyle(fontSize: 12, color: palette.textWeak),
                  ),
                ],
              ),
              if (labels.isNotEmpty) ...[
                const SizedBox(height: 6),
                Wrap(
                  spacing: 4,
                  runSpacing: 4,
                  children: labels.take(5).map((l) {
                    return Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(
                          color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.3),
                        ),
                      ),
                      child: Text(
                        l,
                        style: TextStyle(
                          fontSize: 10,
                          color: Theme.of(context).colorScheme.primary,
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ],
              const SizedBox(height: 6),
              Row(
                children: [
                  if (user != null) ...[
                    Icon(Icons.person_outline, size: 12, color: palette.textWeak),
                    const SizedBox(width: 3),
                    Text(user, style: TextStyle(fontSize: 11, color: palette.textWeak)),
                    const SizedBox(width: 10),
                  ],
                  if (comments > 0) ...[
                    Icon(Icons.comment_outlined, size: 12, color: palette.textWeak),
                    const SizedBox(width: 3),
                    Text('$comments', style: TextStyle(fontSize: 11, color: palette.textWeak)),
                  ],
                  const Spacer(),
                  Icon(Icons.arrow_forward_ios, size: 12, color: palette.textWeak),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Issue detail bottom sheet
// ---------------------------------------------------------------------------

class _IssueDetailSheet extends StatefulWidget {
  const _IssueDetailSheet({
    required this.issue,
    required this.repo,
    required this.onJobQueued,
  });

  final Map<String, dynamic> issue;
  final String repo;
  final VoidCallback onJobQueued;

  @override
  State<_IssueDetailSheet> createState() => _IssueDetailSheetState();
}

class _IssueDetailSheetState extends State<_IssueDetailSheet> {
  bool _useFork = false;
  String _baseBranch = 'main';
  bool _queuing = false;
  String? _queueError;

  Future<void> _queueJob() async {
    setState(() {
      _queuing = true;
      _queueError = null;
    });

    final srv = context.read<AppState>().server;
    if (srv == null) {
      setState(() {
        _queuing = false;
        _queueError = 'Servidor não conectado';
      });
      return;
    }

    final issue = widget.issue;
    final number = issue['number'] as int? ?? 0;
    final title = issue['title'] as String? ?? '';
    final body = issue['body'] as String? ?? '';

    try {
      await srv.createRepoIssueJob(
        repo: widget.repo,
        issueNumber: number,
        issueTitle: title,
        issueBody: body,
        baseBranch: _baseBranch,
        useFork: _useFork,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Job enfileirado: #$number $title'),
          duration: const Duration(seconds: 4),
        ),
      );
      widget.onJobQueued();
    } catch (e) {
      if (!mounted) return;
      final msg = e.toString().replaceFirst('Exception: ', '');
      if (msg.startsWith('duplicate:')) {
        final jobId = msg.replaceFirst('duplicate:', '');
        setState(() {
          _queuing = false;
          _queueError = 'Já existe um job ativo para esta issue${jobId.isNotEmpty ? " (ID: $jobId)" : ""}';
        });
      } else {
        setState(() {
          _queuing = false;
          _queueError = msg;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final issue = widget.issue;
    final number = issue['number'] as int? ?? 0;
    final title = issue['title'] as String? ?? '';
    final body = (issue['body'] as String? ?? '').trim();
    final labels = (issue['labels'] as List<dynamic>?)?.cast<String>() ?? [];
    final state = issue['state'] as String? ?? 'open';

    return DraggableScrollableSheet(
      initialChildSize: 0.75,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      expand: false,
      builder: (ctx, scrollCtrl) {
        return Column(
          children: [
            // Handle bar
            Center(
              child: Container(
                margin: const EdgeInsets.only(top: 12, bottom: 8),
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey.withValues(alpha: 0.4),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Expanded(
              child: ListView(
                controller: scrollCtrl,
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                children: [
                  // Header
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        state == 'open'
                            ? Icons.radio_button_unchecked
                            : Icons.check_circle_outline,
                        color: state == 'open' ? Colors.green : Colors.purple,
                        size: 20,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          '#$number — $title',
                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ],
                  ),
                  if (labels.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      children: labels.map((l) {
                        return Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            l,
                            style: TextStyle(
                              fontSize: 11,
                              color: Theme.of(context).colorScheme.primary,
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                  ],
                  const SizedBox(height: 16),
                  // Body
                  if (body.isNotEmpty) ...[
                    const Text(
                      'Descrição',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Theme.of(context).brightness == Brightness.dark
                            ? const Color(0xFF161B22)
                            : const Color(0xFFF6F8FA),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: SelectableText(
                        body,
                        style: const TextStyle(fontSize: 13, height: 1.5),
                      ),
                    ),
                    const SizedBox(height: 20),
                  ],
                  const Divider(),
                  const SizedBox(height: 12),
                  // Job options
                  const Text(
                    'Configurações do Job',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 10),
                  // Base branch
                  Row(
                    children: [
                      const Text('Branch base:', style: TextStyle(fontSize: 13)),
                      const SizedBox(width: 12),
                      Expanded(
                        child: TextField(
                          decoration: InputDecoration(
                            hintText: 'main',
                            isDense: true,
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                            contentPadding:
                                const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                          ),
                          onChanged: (v) => _baseBranch = v.isEmpty ? 'main' : v,
                          controller: TextEditingController(text: _baseBranch),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  // Use fork
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Usar fork', style: TextStyle(fontSize: 13)),
                    subtitle: const Text(
                      'Cria um fork do repo antes de implementar',
                      style: TextStyle(fontSize: 11),
                    ),
                    value: _useFork,
                    onChanged: (v) => setState(() => _useFork = v),
                  ),
                  const SizedBox(height: 16),
                  // Error
                  if (_queueError != null) ...[
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: Colors.red.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.red.withValues(alpha: 0.4)),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.error_outline, size: 16, color: Colors.red),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              _queueError!,
                              style: const TextStyle(color: Colors.red, fontSize: 12),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                  // Queue button
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: _queuing ? null : _queueJob,
                      icon: _queuing
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : const Icon(Icons.rocket_launch_outlined),
                      label: Text(_queuing ? 'Enfileirando…' : 'Queue Dev Job'),
                      style: FilledButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}
