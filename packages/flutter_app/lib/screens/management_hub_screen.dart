import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../theme/oc2_colors.dart';
import '../widgets/dialog_add_project.dart';
import 'discovery_screen.dart';
import 'goals_screen.dart';
import 'llm_settings_screen.dart';
import 'logs_screen.dart';
import 'project_settings_drawer.dart';
import 'proposals_screen.dart';
import 'queue_monitor_screen.dart';
import 'repo_issues_screen.dart';
import 'repo_jobs_screen.dart';
import 'server_dashboard_screen.dart';
import 'specs_screen.dart';

/// Management: KINETIC project configuration (Git, repos, terminal protocol) + daemon ops grid.
class ManagementHubScreen extends StatefulWidget {
  const ManagementHubScreen({super.key});

  @override
  State<ManagementHubScreen> createState() => _ManagementHubScreenState();
}

class _ManagementHubScreenState extends State<ManagementHubScreen> {
  final Set<String> _sync = {};
  bool _autoSync = false;

  void _toggleSync(String worktree, bool selected) {
    setState(() {
      if (selected) {
        _sync.add(worktree);
      } else {
        _sync.remove(worktree);
      }
    });
  }

  void _showAddProject(BuildContext context, AppState state) {
    showDialog<bool>(
      context: context,
      builder: (ctx) => DialogAddProject(
        onAdd: (url, {branch, token}) async {
          final p = await state.addProjectByUrl(url, branch: branch, token: token);
          if (p == null) throw Exception('Failed to add project');
          return p;
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).brightness == Brightness.dark ? Oc2Colors.dark : Oc2Colors.light;
    final state = context.watch<AppState>();
    final projects = state.projects;
    final directory = state.activeDirectory;

    final sections = [
      _Section('Pipelines', Icons.account_tree_outlined, Colors.indigo, () {
        Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const ServerDashboardScreen()));
      }),
      _Section('Repo Jobs', Icons.merge_type_outlined, Colors.teal, () {
        Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const RepoJobsScreen()));
      }),
      _Section('Issues', Icons.bug_report_outlined, Colors.pink, () {
        Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const RepoIssuesScreen()));
      }),
      _Section('Queue', Icons.queue_outlined, Colors.blue, () {
        Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const QueueMonitorScreen()));
      }),
      _Section('Goals', Icons.flag_outlined, Colors.green, () {
        Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const GoalsScreen()));
      }),
      _Section('Specs', Icons.description_outlined, Colors.orange, () {
        Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const SpecsScreen()));
      }),
      _Section('Proposals', Icons.approval_outlined, Colors.purple, () {
        Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const ProposalsScreen()));
      }),
      _Section('Discovery', Icons.explore_outlined, Colors.deepOrange, () {
        Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const DiscoveryScreen()));
      }),
      _Section('Logs', Icons.terminal_outlined, Colors.grey, () {
        Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const LogsScreen()));
      }),
    ];

    return Scaffold(
      backgroundColor: palette.backgroundBase,
      appBar: AppBar(
        backgroundColor: palette.backgroundBase,
        foregroundColor: palette.textStrong,
        title: const Text('Management'),
      ),
      body: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ProjectSettingsDrawer(
              embedded: true,
              projects: projects,
              githubConnected: state.githubToken != null,
              syncSelection: _sync,
              onSyncToggle: _toggleSync,
              autoSync: _autoSync,
              onAutoSync: (v) => setState(() => _autoSync = v),
              onManageGithub: () => _showAddProject(context, state),
              onOpenLlm: () {
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => LlmSettingsScreen(catalogDirectory: directory),
                  ),
                );
              },
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
              child: Text(
                'Daemon & operations',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                  letterSpacing: 0.6,
                  color: palette.textStrong,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
              child: GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                childAspectRatio: 1.4,
                children: sections.map((s) => _buildTile(context, palette, s)).toList(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTile(BuildContext context, Oc2Palette palette, _Section s) {
    return InkWell(
      onTap: s.onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        decoration: BoxDecoration(
          color: palette.backgroundWeak,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: palette.borderWeak),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: s.color.withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              child: Icon(s.icon, color: s.color, size: 28),
            ),
            const SizedBox(height: 10),
            Text(
              s.label,
              style: TextStyle(
                fontWeight: FontWeight.w600,
                fontSize: 14,
                color: palette.textStrong,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Section {
  const _Section(this.label, this.icon, this.color, this.onTap);
  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;
}
