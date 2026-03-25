import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../theme/button_style.dart';
import '../theme/kinetic_tokens.dart';
import '../widgets/dialog_add_project.dart';
import '../widgets/kinetic_bottom_bar.dart';
import '../widgets/opencode_button.dart';
import 'brain_hub_screen.dart';
import 'connection_screen.dart';
import 'home_dashboard_screen.dart';
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

  void _showProfileSheet(BuildContext context, AppState state) {
    final scheme = Theme.of(context).colorScheme;
    final k = Theme.of(context).brightness == Brightness.dark;
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: k ? KineticTokens.surfaceContainer : scheme.surfaceContainerHighest,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Perfil / ligação',
                  style: k
                      ? GoogleFonts.spaceGrotesk(fontSize: 18, fontWeight: FontWeight.w700, color: KineticTokens.onSurface)
                      : Theme.of(ctx).textTheme.titleMedium,
                ),
                const SizedBox(height: 12),
                Text(
                  'OpenCode: ${state.connected ? "ligado" : "—"}',
                  style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13),
                ),
                Text(
                  'Daemon: ${state.daemonAvailable ? "ativo" : "indisponível"}',
                  style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13),
                ),
                Text(
                  'Servidor: ${state.activeKey ?? "—"}',
                  style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13),
                ),
                Text(
                  'GitHub: ${state.githubToken != null ? "token guardado" : "sem token"}',
                  style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13),
                ),
                const SizedBox(height: 16),
                TextButton.icon(
                  onPressed: () {
                    Navigator.pop(ctx);
                    Navigator.of(context, rootNavigator: true).push(
                      MaterialPageRoute<void>(builder: (_) => const ConnectionScreen()),
                    );
                  },
                  icon: const Icon(Icons.dns_outlined),
                  label: const Text('Gerir servidores / ligação'),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _notificationsSoon(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Notificações — em breve')),
    );
  }

  /// Top bar à direita: notificações → perfil (config KINETIC na aba Management).
  List<Widget> _headerTrailing(BuildContext context, AppState state) {
    final scheme = Theme.of(context).colorScheme;
    final k = Theme.of(context).brightness == Brightness.dark;
    if (!state.connected) return [];
    final muted = k ? KineticTokens.outlineVariant : scheme.onSurfaceVariant;
    return [
      IconButton(
        tooltip: 'Notificações',
        icon: Icon(Icons.notifications_outlined, color: muted),
        onPressed: () => _notificationsSoon(context),
      ),
      IconButton(
        tooltip: 'Perfil',
        onPressed: () => _showProfileSheet(context, state),
        icon: Container(
          width: 32,
          height: 32,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: KineticTokens.outlineVariant.withValues(alpha: 0.35)),
            color: k ? KineticTokens.surfaceContainerHighest : scheme.surfaceContainerHighest,
          ),
          alignment: Alignment.center,
          child: Icon(Icons.person_outline, size: 18, color: scheme.onSurfaceVariant),
        ),
      ),
    ];
  }

  Widget _desktopTopBar(BuildContext context, AppState state, String? directory) {
    final k = Theme.of(context).brightness == Brightness.dark;
    return Material(
      elevation: 0,
      color: k ? KineticTokens.headerBar : Theme.of(context).colorScheme.surfaceContainerLow,
      child: SizedBox(
        height: 56,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Row(
            children: [
              Icon(Icons.terminal, size: 22, color: k ? KineticTokens.primaryContainer : Theme.of(context).colorScheme.primary),
              const SizedBox(width: 8),
              Text(
                'KINETIC_SYNC',
                style: k
                    ? GoogleFonts.spaceGrotesk(
                        fontWeight: FontWeight.w800,
                        fontSize: 15,
                        letterSpacing: 0.8,
                        color: KineticTokens.primaryContainer,
                      )
                    : Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
              ),
              const Spacer(),
              ..._headerTrailing(context, state),
            ],
          ),
        ),
      ),
    );
  }

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
    final scheme = Theme.of(context).colorScheme;
    final kineticDark = Theme.of(context).brightness == Brightness.dark;

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
          backgroundColor: scheme.surface,
          foregroundColor: scheme.onSurface,
          leading: _showChatPanel
              ? IconButton(
                  icon: const Icon(Icons.menu),
                  onPressed: () => _scaffoldKey.currentState?.openDrawer(),
                )
              : null,
          actions: _headerTrailing(context, state),
        ),
        drawer: _showChatPanel
            ? _buildDrawer(context, state, projects, sessions, directory)
            : null,
        body: state.connected
            ? _buildContent(context, state, directory, narrow: true)
            : Center(child: Text('Connecting…', style: TextStyle(color: scheme.onSurfaceVariant))),
        bottomNavigationBar: kineticDark ? KineticBottomBarChrome(child: navBar) : navBar,
      );
    }

    // Desktop layout
    Widget inner;
    if (!state.connected) {
      inner = Center(child: Text('Connecting…', style: TextStyle(color: scheme.onSurfaceVariant)));
    } else if (_showChatPanel) {
      inner = Row(
        children: [
          _buildPanel(context, state, projects, sessions, directory),
          Expanded(child: _buildContent(context, state, directory, narrow: false)),
        ],
      );
    } else {
      inner = _buildContent(context, state, directory, narrow: false);
    }

    final body = state.connected
        ? Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _desktopTopBar(context, state, directory),
              Expanded(child: inner),
            ],
          )
        : inner;

    return Scaffold(
      key: _scaffoldKey,
      body: body,
      bottomNavigationBar: kineticDark ? KineticBottomBarChrome(child: navBar) : navBar,
    );
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
    final scheme = Theme.of(context).colorScheme;
    return Container(
      color: scheme.surface,
      alignment: Alignment.center,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.chat_outlined, size: 56, color: scheme.onSurfaceVariant),
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
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
            ),
        ],
      ),
    );
  }

  Widget _homeDaemonUnavailable(BuildContext context, AppState state, {required bool narrow}) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      color: scheme.surface,
      alignment: Alignment.center,
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 440),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.dashboard_outlined, size: 56, color: scheme.onSurfaceVariant),
              const SizedBox(height: 16),
              Text('Server dashboard unavailable', textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 12),
              Text(
                'OpenCode Server (daemon) is not enabled on this host. '
                'Start the server with opencode serve --daemon or set server.daemon: true in config.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
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
    final scheme = Theme.of(context).colorScheme;
    return Drawer(
      backgroundColor: scheme.surface,
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
                leading: Icon(Icons.folder, color: scheme.onSurfaceVariant),
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
              leading: Icon(Icons.add, color: scheme.onSurfaceVariant),
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
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: 280,
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        border: Border(right: BorderSide(color: scheme.outlineVariant.withValues(alpha: 0.4))),
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
            leading: Icon(Icons.add, color: scheme.onSurfaceVariant, size: 18),
            title: const Text('Add project', style: TextStyle(fontSize: 13)),
            onTap: () => _showAddProject(context, state),
          ),
        ],
      ),
    );
  }
}
