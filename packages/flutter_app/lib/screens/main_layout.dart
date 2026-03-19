import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../theme/button_style.dart';
import '../theme/oc2_colors.dart';
import '../widgets/dialog_add_project.dart';
import '../widgets/opencode_button.dart';
import '../widgets/opencode_icon_button.dart';
import 'llm_settings_screen.dart';
import 'session_screen.dart';
import 'server_dashboard_screen.dart';

const _breakpoint = 600.0;

class MainLayout extends StatefulWidget {
  const MainLayout({super.key});

  @override
  State<MainLayout> createState() => _MainLayoutState();
}

class _MainLayoutState extends State<MainLayout> {
  String? _selectedProject;
  String? _selectedSession;
  int _selectedTab = 0;
  final _scaffoldKey = GlobalKey<ScaffoldState>();

  Oc2Palette get _palette =>
      Theme.of(context).brightness == Brightness.dark ? Oc2Colors.dark : Oc2Colors.light;

  void _showAddProject(BuildContext context, AppState state) {
    showDialog<bool>(
      context: context,
      builder: (ctx) => DialogAddProject(
        onAdd: (url, {branch, token}) async {
          final p = await state.addProjectByUrl(url, branch: branch, token: token);
          if (p == null) throw Exception('Failed to add project');
          if (mounted) setState(() => _selectedProject = p.worktree);
          return p;
        },
      ),
    );
  }

  void _closeDrawer() {
    Navigator.of(context).pop();
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

    final width = MediaQuery.of(context).size.width;
    final mobile = width < _breakpoint;

    if (mobile) {
      return Scaffold(
        key: _scaffoldKey,
        appBar: AppBar(
          title: const Text('OpenCode'),
          backgroundColor: _palette.backgroundBase,
          foregroundColor: _palette.textStrong,
          leading: IconButton(
            icon: const Icon(Icons.menu),
            onPressed: () => _scaffoldKey.currentState?.openDrawer(),
          ),
        ),
        drawer: _buildDrawer(context, state, projects, sessions, directory),
        body: state.connected
            ? _buildMain(context, state, directory)
            : Center(child: Text('Connecting…', style: TextStyle(color: _palette.textWeak))),
      );
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

  Widget _buildDrawer(
    BuildContext context,
    AppState state,
    List<dynamic> projects,
    List<dynamic> sessions,
    String? directory,
  ) {
    return Drawer(
      backgroundColor: _palette.backgroundBase,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text('Projects', style: Theme.of(context).textTheme.titleMedium),
            ),
            ...projects.take(8).map(
                  (p) => ListTile(
                    leading: Icon(Icons.folder, color: _palette.iconBase),
                    title: Text(p.name ?? p.worktree.split('/').last, overflow: TextOverflow.ellipsis),
                    selected: _selectedProject == p.worktree,
                    onTap: () {
                      setState(() {
                        _selectedProject = p.worktree;
                        _selectedTab = 0;
                      });
                      _closeDrawer();
                    },
                  ),
                ),
            ListTile(
              leading: Icon(Icons.add, color: _palette.iconBase),
              title: const Text('Add project'),
              onTap: () {
                _closeDrawer();
                _showAddProject(context, state);
              },
            ),
            const Divider(),
            Padding(
              padding: const EdgeInsets.all(16),
              child: OpenCodeButton(
                onPressed: directory != null
                    ? () async {
                        final s = await state.createSession(directory);
                        if (s != null && mounted) {
                          setState(() => _selectedSession = s.id);
                          _closeDrawer();
                        }
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
                        onTap: () {
                          setState(() => _selectedSession = s.id);
                          _closeDrawer();
                        },
                      ),
                    ),
                ],
              ),
            ),
            const Divider(),
            ListTile(
              leading: Icon(Icons.dashboard, color: _palette.iconBase),
              title: const Text('Server dashboard'),
              onTap: () {
                setState(() => _selectedTab = 1);
                _closeDrawer();
              },
            ),
            ListTile(
              leading: Icon(Icons.settings, color: _palette.iconBase),
              title: const Text('LLM & provider'),
              onTap: () {
                _closeDrawer();
                if (!state.connected) return;
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => LlmSettingsScreen(catalogDirectory: directory),
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRail(BuildContext context, AppState state) {
    return Container(
      width: 64,
      color: _palette.backgroundBase,
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
            onPressed: state.connected
                ? () {
                    final d = _selectedProject ??
                        state.activeDirectory ??
                        (state.projects.isNotEmpty ? state.projects.first.worktree : null);
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => LlmSettingsScreen(catalogDirectory: d),
                      ),
                    );
                  }
                : null,
            tooltip: 'LLM & provider',
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
        color: _palette.backgroundWeak,
        border: Border(right: BorderSide(color: _palette.borderWeak)),
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
          Icon(Icons.chat_bubble_outline, size: 64, color: _palette.iconBase),
          const SizedBox(height: 16),
          Text(
            'Select a session',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          Text(
            'Create a new session or select one from the list',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: _palette.textWeak),
          ),
        ],
      ),
    );
  }
}
