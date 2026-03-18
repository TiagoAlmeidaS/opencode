import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../theme/button_style.dart';
import '../theme/oc2_colors.dart';
import '../widgets/dialog_add_project.dart';
import '../widgets/opencode_button.dart';
import '../widgets/opencode_icon_button.dart';
import 'session_screen.dart';
import 'server_dashboard_screen.dart';

class MainLayout extends StatefulWidget {
  const MainLayout({super.key});

  @override
  State<MainLayout> createState() => _MainLayoutState();
}

class _MainLayoutState extends State<MainLayout> {
  String? _selectedProject;
  String? _selectedSession;
  int _selectedTab = 0;

  void _showAddProject(BuildContext context, AppState state) {
    showDialog<bool>(
      context: context,
      builder: (ctx) => DialogAddProject(
        onAdd: (url, {branch}) async {
          final p = await state.addProjectByUrl(url, branch: branch);
          if (p == null) throw Exception('Failed to add project');
          if (mounted) setState(() => _selectedProject = p.worktree);
          return p;
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final projects = state.projects;
    final sessions = state.sessions;
    var directory = _selectedProject ?? state.activeDirectory ?? (projects.isNotEmpty ? projects.first.worktree : null);
    if (directory != null && state.activeDirectory != directory) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        state.loadSessions(directory);
        if (mounted && _selectedProject == null && projects.isNotEmpty) {
          setState(() => _selectedProject = projects.first.worktree);
        }
      });
    }

    return Scaffold(
      body: Row(
        children: [
          _buildRail(context, state),
          if (state.connected) ...[
            _buildPanel(context, state, projects, sessions, directory),
            Expanded(
              child: _buildMain(context, state, directory),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildRail(BuildContext context, AppState state) {
    return Container(
      width: 64,
      color: Oc2Colors.light.backgroundBase,
      child: Column(
        children: [
          const SizedBox(height: 16),
          ...state.projects.take(8).map(
                (p) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: OpenCodeIconButton(
                    icon: Icons.folder,
                    onPressed: () => setState(() {
                      _selectedProject = p.worktree;
                      _selectedTab = 0;
                    }),
                    tooltip: p.name ?? p.worktree.split('/').last,
                  ),
                ),
              ),
          const Spacer(),
          OpenCodeIconButton(
            icon: Icons.add,
            onPressed: () => _showAddProject(context, state),
            tooltip: 'Open project',
          ),
          const SizedBox(height: 8),
          OpenCodeIconButton(
            icon: Icons.dashboard,
            onPressed: () => setState(() => _selectedTab = 1),
            tooltip: 'Server dashboard',
          ),
          const SizedBox(height: 8),
          OpenCodeIconButton(
            icon: Icons.settings,
            onPressed: () {},
            tooltip: 'Settings',
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _buildPanel(
    BuildContext context,
    AppState state,
    List<dynamic> projects,
    List<dynamic> sessions,
    String? directory,
  ) {
    return Container(
      width: 280,
      decoration: BoxDecoration(
        color: Oc2Colors.light.backgroundWeak,
        border: Border(right: BorderSide(color: Oc2Colors.light.borderWeak)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: OpenCodeButton(
              onPressed: directory != null
                  ? () async {
                      final s = await state.createSession(directory);
                      if (s != null && mounted) setState(() => _selectedSession = s.id);
                    }
                  : null,
              variant: OpenCodeButtonVariant.primary,
              size: OpenCodeButtonSize.large,
              icon: Icons.add,
              child: const Text('New session'),
            ),
          ),
          Expanded(
            child: ListView(
              children: [
                if (directory != null)
                  ...sessions.map(
                    (s) => ListTile(
                      title: Text(s.title ?? 'Session', style: const TextStyle(fontSize: 14)),
                      selected: _selectedSession == s.id,
                      onTap: () => setState(() => _selectedSession = s.id),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMain(BuildContext context, AppState state, String? directory) {
    if (_selectedTab == 1 && state.daemonAvailable) {
      return const ServerDashboardScreen();
    }

    if (directory != null && _selectedSession != null) {
      return SessionScreen(
        directory: directory,
        sessionID: _selectedSession!,
      );
    }

    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.chat_bubble_outline, size: 64, color: Oc2Colors.light.iconBase),
          const SizedBox(height: 16),
          Text(
            'Select a session',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          Text(
            'Create a new session or select one from the list',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Oc2Colors.light.textWeak),
          ),
        ],
      ),
    );
  }
}
