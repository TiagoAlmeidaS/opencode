import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../theme/button_style.dart';
import '../theme/oc2_colors.dart';
import '../widgets/dialog_add_project.dart';
import '../widgets/opencode_button.dart';
import 'brain_hub_screen.dart';
import 'home_dashboard_screen.dart';
import 'llm_settings_screen.dart';
import 'management_hub_screen.dart';
import 'opportunities_hub_screen.dart';
import 'session_screen.dart';

const _breakpoint = 600.0;

/// 5-tab main layout:
///  0 Home | 1 Chat | 2 Opportunities | 3 Brain | 4 Management
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

  void _closeDrawer() => Navigator.of(context).pop();

  void _selectSession(String id) {
    setState(() {
      _selectedSession = id;
      _selectedTab = 1; // Chat tab
    });
  }

  bool get _showChatPanel => _selectedTab == 1;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final projects = state.projects;
    final sessions = state.sessions;
    final directory = _selectedProject ??
        state.activeDirectory ??
        (projects.isNotEmpty ? projects.first.worktree : null);

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
      onDestinationSelected: (i) {
        setState(() {
          _selectedTab = i;
        });
        if (i == 0) context.read<AppState>().refreshServerStatus();
      },
      destinations: const [
        NavigationDestination(
          icon: Icon(Icons.home_outlined),
          selectedIcon: Icon(Icons.home),
          label: 'Home',
        ),
        NavigationDestination(
          icon: Icon(Icons.chat_outlined),
          selectedIcon: Icon(Icons.chat),
          label: 'Chat',
        ),
        NavigationDestination(
          icon: Icon(Icons.trending_up_outlined),
          selectedIcon: Icon(Icons.trending_up),
          label: 'Opp',
        ),
        NavigationDestination(
          icon: Icon(Icons.psychology_outlined),
          selectedIcon: Icon(Icons.psychology),
          label: 'Brain',
        ),
        NavigationDestination(
          icon: Icon(Icons.manage_accounts_outlined),
          selectedIcon: Icon(Icons.manage_accounts),
          label: 'Manage',
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
          leading: _showChatPanel
              ? IconButton(
                  icon: const Icon(Icons.menu),
                  onPressed: () => _scaffoldKey.currentState?.openDrawer(),
                )
              : null,
          actions: [
            if (_selectedTab == 4)
              IconButton(
                icon: const Icon(Icons.settings_outlined),
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => LlmSettingsScreen(catalogDirectory: directory),
                  ),
                ),
              ),
          ],
        ),
        drawer: _showChatPanel
            ? _buildDrawer(context, state, projects, sessions, directory)
            : null,
        body: state.connected
            ? _buildContent(context, state, directory, narrow: true)
            : Center(child: Text('Connecting…', style: TextStyle(color: _palette.textWeak))),
        bottomNavigationBar: navBar,
      );
    }

    // Desktop layout
    Widget body;
    if (!state.connected) {
      body = Center(child: Text('Connecting…', style: TextStyle(color: _palette.textWeak)));
    } else if (_showChatPanel) {
      body = Row(
        children: [
          _buildPanel(context, state, projects, sessions, directory),
          Expanded(child: _buildContent(context, state, directory, narrow: false)),
        ],
      );
    } else {
      body = _buildContent(context, state, directory, narrow: false);
    }

    return Scaffold(body: body, bottomNavigationBar: navBar);
  }

  String _tabTitle(int tab, String? session, List<dynamic> sessions) {
    switch (tab) {
      case 1:
        if (session != null) {
          try {
            final s = sessions.firstWhere((s) => s.id == session);
            return s.title ?? 'Session';
          } catch (_) {}
        }
        return 'Chat';
      case 2:
        return 'Opportunities';
      case 3:
        return 'Brain';
      case 4:
        return 'Management';
      default:
        return 'OpenCode';
    }
  }

  Widget _buildContent(
    BuildContext context,
    AppState state,
    String? directory, {
    required bool narrow,
  }) {
    switch (_selectedTab) {
      case 1: // Chat
        if (_selectedSession != null && directory != null) {
          return SessionScreen(
            key: ValueKey(_selectedSession),
            directory: directory,
            sessionID: _selectedSession!,
          );
        }
        return _chatNoSession(context, narrow: narrow);
      case 2:
        return const OpportunitiesHubScreen();
      case 3:
        return const BrainHubScreen();
      case 4:
        return const ManagementHubScreen();
      default: // 0 = Home
        if (state.daemonAvailable) {
          return const HomeDashboardScreen(key: ValueKey('home-dashboard'));
        }
        return _homeDaemonUnavailable(context, state, narrow: narrow);
    }
  }

  Widget _chatNoSession(BuildContext context, {required bool narrow}) {
    final palette = _palette;
    return Container(
      color: palette.backgroundBase,
      alignment: Alignment.center,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.chat_outlined, size: 56, color: palette.iconBase),
          const SizedBox(height: 16),
          Text('No session selected', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          if (narrow)
            OpenCodeButton(
              onPressed: () => _scaffoldKey.currentState?.openDrawer(),
              variant: OpenCodeButtonVariant.primary,
              size: OpenCodeButtonSize.large,
              icon: Icons.menu,
              child: const Text('Open sessions'),
            )
          else
            Text(
              'Select a session from the panel on the left, or create a new one.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: palette.textWeak),
            ),
        ],
      ),
    );
  }

  Widget _homeDaemonUnavailable(BuildContext context, AppState state, {required bool narrow}) {
    final palette = _palette;
    return Container(
      color: palette.backgroundBase,
      alignment: Alignment.center,
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 440),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.dashboard_outlined, size: 56, color: palette.iconBase),
              const SizedBox(height: 16),
              Text('Server dashboard unavailable', textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 12),
              Text(
                'OpenCode Server (daemon) is not enabled on this host. '
                'Start the server with opencode serve --daemon or set server.daemon: true in config.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: palette.textWeak),
              ),
              const SizedBox(height: 24),
              OpenCodeButton(
                onPressed: () => setState(() => _selectedTab = 1),
                variant: OpenCodeButtonVariant.primary,
                size: OpenCodeButtonSize.large,
                icon: Icons.chat_outlined,
                child: const Text('Open Chat'),
              ),
              const SizedBox(height: 10),
              OpenCodeButton(
                onPressed: () => state.refreshServerStatus(),
                variant: OpenCodeButtonVariant.secondary,
                size: OpenCodeButtonSize.large,
                icon: Icons.refresh,
                child: const Text('Check again'),
              ),
            ],
          ),
        ),
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
                    _selectedTab = 1;
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
          if (projects.length > 1)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
              child: DropdownButton<String>(
                isExpanded: true,
                value: directory,
                underline: const SizedBox.shrink(),
                items: projects.map<DropdownMenuItem<String>>(
                  (p) => DropdownMenuItem<String>(
                    value: p.worktree as String,
                    child: Text(
                      (p.name ?? (p.worktree as String).split('/').last) as String,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 13),
                    ),
                  ),
                ).toList(),
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
