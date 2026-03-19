import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../theme/button_style.dart';
import '../theme/oc2_colors.dart';
import '../widgets/dialog_add_project.dart';
import '../widgets/opencode_button.dart';
import 'home_dashboard_screen.dart';
import 'llm_settings_screen.dart';
import 'repo_jobs_screen.dart';
import 'server_dashboard_screen.dart';
import 'session_screen.dart';

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

  void _selectSession(String id) {
    setState(() {
      _selectedSession = id;
      _selectedTab = 0; // sempre volta para Home ao abrir sessão
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final projects = state.projects;
    final sessions = state.sessions;
    final directory = _selectedProject ?? state.activeDirectory ?? (projects.isNotEmpty ? projects.first.worktree : null);

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

    final navBar = NavigationBar(
      selectedIndex: _selectedTab,
      onDestinationSelected: (i) => setState(() {
        _selectedTab = i;
        // sair do Home limpa a sessão ativa no content principal
        if (i != 0) _selectedSession = null;
      }),
      destinations: const [
        NavigationDestination(
          icon: Icon(Icons.home_outlined),
          selectedIcon: Icon(Icons.home),
          label: 'Home',
        ),
        NavigationDestination(
          icon: Icon(Icons.dashboard_outlined),
          selectedIcon: Icon(Icons.dashboard),
          label: 'Server',
        ),
        NavigationDestination(
          icon: Icon(Icons.merge_type),
          label: 'Repo Jobs',
        ),
        NavigationDestination(
          icon: Icon(Icons.settings_outlined),
          selectedIcon: Icon(Icons.settings),
          label: 'LLM Config',
        ),
      ],
    );

    if (mobile) {
      return Scaffold(
        key: _scaffoldKey,
        appBar: AppBar(
          title: Text(_tabTitle(_selectedTab, _selectedSession, sessions)),
          backgroundColor: _palette.backgroundBase,
          foregroundColor: _palette.textStrong,
          leading: IconButton(
            icon: const Icon(Icons.menu),
            onPressed: () => _scaffoldKey.currentState?.openDrawer(),
          ),
        ),
        drawer: _buildDrawer(context, state, projects, sessions, directory),
        body: state.connected
            ? _buildContent(context, state, directory)
            : Center(child: Text('Connecting…', style: TextStyle(color: _palette.textWeak))),
        bottomNavigationBar: navBar,
      );
    }

    // Desktop
    Widget body;
    if (!state.connected) {
      body = Center(child: Text('Connecting…', style: TextStyle(color: _palette.textWeak)));
    } else if (_selectedTab == 0) {
      // Home: sidebar de sessões visível ao lado do conteúdo
      body = Row(
        children: [
          _buildPanel(context, state, projects, sessions, directory),
          Expanded(child: _buildContent(context, state, directory)),
        ],
      );
    } else {
      body = _buildContent(context, state, directory);
    }

    return Scaffold(
      body: body,
      bottomNavigationBar: navBar,
    );
  }

  String _tabTitle(int tab, String? session, List<dynamic> sessions) {
    switch (tab) {
      case 1:
        return 'Server Dashboard';
      case 2:
        return 'Repo Jobs';
      case 3:
        return 'LLM Config';
      default:
        if (session != null) {
          try {
            final s = sessions.firstWhere((s) => s.id == session);
            return s.title ?? 'Session';
          } catch (_) {}
        }
        return 'OpenCode';
    }
  }

  Widget _buildContent(BuildContext context, AppState state, String? directory) {
    switch (_selectedTab) {
      case 1:
        return const ServerDashboardScreen();
      case 2:
        return const RepoJobsScreen();
      case 3:
        return LlmSettingsScreen(catalogDirectory: directory);
      default: // 0 = Home
        if (_selectedSession != null && directory != null) {
          return SessionScreen(
            key: ValueKey(_selectedSession),
            directory: directory,
            sessionID: _selectedSession!,
          );
        }
        if (state.daemonAvailable) {
          return const HomeDashboardScreen(key: ValueKey('home-dashboard'));
        }
        return Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.chat_bubble_outline, size: 64, color: _palette.iconBase),
              const SizedBox(height: 16),
              Text('Select a session', style: Theme.of(context).textTheme.titleMedium),
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

  Widget _buildDrawer(
    BuildContext context,
    AppState state,
    List<dynamic> projects,
    List<dynamic> sessions,
    String? directory,
  ) {
    final palette = _palette;
    return Drawer(
      backgroundColor: palette.backgroundBase,
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
                    leading: Icon(Icons.folder, color: palette.iconBase),
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
              leading: Icon(Icons.add, color: palette.iconBase),
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
                          _selectSession(s.id);
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
                          _selectSession(s.id);
                          _closeDrawer();
                        },
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
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
    final palette = _palette;
    return Container(
      width: 280,
      decoration: BoxDecoration(
        color: palette.backgroundWeak,
        border: Border(right: BorderSide(color: palette.borderWeak)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Project selector
          if (projects.length > 1)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
              child: DropdownButton<String>(
                isExpanded: true,
                value: directory,
                underline: const SizedBox.shrink(),
                items: projects
                    .map<DropdownMenuItem<String>>(
                      (p) => DropdownMenuItem<String>(
                        value: p.worktree as String,
                        child: Text(
                          (p.name ?? (p.worktree as String).split('/').last) as String,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 13),
                        ),
                      ),
                    )
                    .toList(),
                onChanged: (v) {
                  if (v != null) setState(() => _selectedProject = v);
                },
              ),
            ),
          Padding(
            padding: const EdgeInsets.all(12),
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
          const Divider(height: 1),
          ListTile(
            dense: true,
            leading: Icon(Icons.add, color: palette.iconBase, size: 18),
            title: const Text('Add project', style: TextStyle(fontSize: 13)),
            onTap: () => _showAddProject(context, state),
          ),
        ],
      ),
    );
  }
}
