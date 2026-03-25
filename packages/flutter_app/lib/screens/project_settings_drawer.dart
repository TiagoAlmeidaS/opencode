import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../api/models.dart';
import '../theme/kinetic_tokens.dart';
import '../widgets/kinetic_glass_panel.dart';
import '../widgets/kinetic_ui.dart';

/// Configuration hub (KINETIC): Git providers, repo sync, terminal shortcuts.
/// Use [embedded] on Management tab (full scroll); `false` inside [Drawer].
class ProjectSettingsDrawer extends StatefulWidget {
  const ProjectSettingsDrawer({
    super.key,
    this.embedded = false,
    required this.projects,
    required this.githubConnected,
    required this.syncSelection,
    required this.onSyncToggle,
    required this.autoSync,
    required this.onAutoSync,
    required this.onManageGithub,
    required this.onOpenLlm,
  });

  /// When true, single scroll (for embedding in [ManagementHubScreen]); no drawer close.
  final bool embedded;

  final List<Project> projects;
  final bool githubConnected;
  final Set<String> syncSelection;
  final void Function(String worktree, bool selected) onSyncToggle;
  final bool autoSync;
  final ValueChanged<bool> onAutoSync;
  final VoidCallback onManageGithub;
  final VoidCallback onOpenLlm;

  @override
  State<ProjectSettingsDrawer> createState() => _ProjectSettingsDrawerState();
}

class _ProjectSettingsDrawerState extends State<ProjectSettingsDrawer> {
  final _filter = TextEditingController();

  @override
  void dispose() {
    _filter.dispose();
    super.dispose();
  }

  void _soon(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Em breve')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final k = isKineticDark(context);
    if (!k) {
      return _ClassicPanel(
        embedded: widget.embedded,
        projects: widget.projects,
        githubConnected: widget.githubConnected,
        syncSelection: widget.syncSelection,
        onSyncToggle: widget.onSyncToggle,
        autoSync: widget.autoSync,
        onAutoSync: widget.onAutoSync,
        onManageGithub: widget.onManageGithub,
        onOpenLlm: widget.onOpenLlm,
        filter: _filter,
        onSoon: _soon,
      );
    }

    final main = _kineticMainColumn(context);
    final top = Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
      child: Row(
        children: [
          Icon(Icons.terminal, color: KineticTokens.primaryContainer, size: 22),
          const SizedBox(width: 8),
          Text(
            'KINETIC_SYNC',
            style: GoogleFonts.spaceGrotesk(
              fontWeight: FontWeight.w800,
              fontSize: 14,
              letterSpacing: 1,
              color: KineticTokens.primaryContainer,
            ),
          ),
          const Spacer(),
          if (!widget.embedded)
            IconButton(
              icon: Icon(Icons.close, color: KineticTokens.onSurfaceVariant),
              onPressed: () => Navigator.of(context).maybePop(),
            ),
        ],
      ),
    );

    if (widget.embedded) {
      return Material(
        color: KineticTokens.background,
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(0, 0, 0, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                top,
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
                  child: main,
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Material(
      color: KineticTokens.background,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            top,
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
                child: main,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _kineticMainColumn(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Configuration',
          style: GoogleFonts.spaceGrotesk(
            fontSize: 26,
            fontWeight: FontWeight.w700,
            color: KineticTokens.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          'ENVIRONMENT // GIT_INTEGRATIONS',
          style: GoogleFonts.jetBrainsMono(
            fontSize: 10,
            letterSpacing: 2,
            color: KineticTokens.onSurfaceVariant.withValues(alpha: 0.6),
          ),
        ),
        const SizedBox(height: 24),
        _sectionTitle(context, 'Provider Nodes'),
        const SizedBox(height: 12),
        _providerCard(
          context,
          title: 'GitHub',
          icon: Icons.cloud_outlined,
          connected: widget.githubConnected,
          onPrimary: widget.onManageGithub,
          primaryLabel: widget.githubConnected ? 'MANAGE' : 'CONNECT',
        ),
        const SizedBox(height: 10),
        _providerCard(
          context,
          title: 'GitLab',
          icon: Icons.filter_vintage_outlined,
          connected: false,
          onPrimary: () => _soon(context),
          primaryLabel: 'CONNECT',
          dim: true,
        ),
        const SizedBox(height: 10),
        _providerCard(
          context,
          title: 'Azure DevOps',
          icon: Icons.cloud_done_outlined,
          connected: false,
          onPrimary: () => _soon(context),
          primaryLabel: 'CONNECT',
          dim: true,
        ),
        const SizedBox(height: 28),
        Row(
          children: [
            Expanded(child: _sectionTitle(context, 'Repository Sync')),
            Text(
              'AUTO-SYNC',
              style: GoogleFonts.jetBrainsMono(fontSize: 9, color: KineticTokens.outline),
            ),
            const SizedBox(width: 8),
            Switch.adaptive(
              value: widget.autoSync,
              onChanged: widget.onAutoSync,
              activeTrackColor: KineticTokens.primaryContainer.withValues(alpha: 0.45),
              activeThumbColor: KineticTokens.primaryContainer,
            ),
          ],
        ),
        const SizedBox(height: 12),
        KineticGlassPanel(
          padding: EdgeInsets.zero,
          borderRadius: KineticTokens.radiusLg,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                child: Row(
                  children: [
                    Icon(Icons.search, size: 18, color: KineticTokens.outline),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextField(
                        controller: _filter,
                        onChanged: (_) => setState(() {}),
                        style: GoogleFonts.jetBrainsMono(fontSize: 13, color: KineticTokens.onSurface),
                        decoration: InputDecoration(
                          isDense: true,
                          border: InputBorder.none,
                          hintText: 'Filter repositories…',
                          hintStyle: GoogleFonts.jetBrainsMono(
                            fontSize: 12,
                            color: KineticTokens.outline.withValues(alpha: 0.5),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Divider(height: 1, color: KineticTokens.outlineVariant.withValues(alpha: 0.2)),
              ..._filteredProjects().map((p) => _repoRow(context, p)),
            ],
          ),
        ),
        const SizedBox(height: 28),
        _sectionTitle(context, 'Terminal Protocol'),
        const SizedBox(height: 12),
        KineticGlassPanel(
          padding: const EdgeInsets.symmetric(vertical: 8),
          borderRadius: KineticTokens.radiusLg,
          child: Column(
            children: [
              _tile(
                context,
                'LLM & models',
                'Global and project defaults',
                widget.onOpenLlm,
              ),
              Divider(height: 1, color: KineticTokens.outlineVariant.withValues(alpha: 0.15)),
              _tile(
                context,
                'SSH Key Management',
                'RSA 4096-bit encrypted keys',
                () => _soon(context),
              ),
              Divider(height: 1, color: KineticTokens.outlineVariant.withValues(alpha: 0.15)),
              _tile(
                context,
                'Global Git Config',
                '.gitconfig environment override',
                () => _soon(context),
              ),
            ],
          ),
        ),
      ],
    );
  }

  List<Project> _filteredProjects() {
    final q = _filter.text.trim().toLowerCase();
    if (q.isEmpty) return widget.projects;
    return widget.projects.where((p) {
      final n = (p.name ?? p.worktree).toLowerCase();
      final w = p.worktree.toLowerCase();
      return n.contains(q) || w.contains(q);
    }).toList();
  }

  Widget _repoRow(BuildContext context, Project p) {
    final sel = widget.syncSelection.contains(p.worktree);
    final label = p.name ?? p.worktree.split(RegExp(r'[\\/]')).last;
    return InkWell(
      onTap: () => widget.onSyncToggle(p.worktree, !sel),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        child: Row(
          children: [
            Icon(Icons.code_outlined, size: 20, color: KineticTokens.primaryFixedDim.withValues(alpha: 0.9)),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w600, color: KineticTokens.onSurface),
                  ),
                  Text(
                    p.worktree,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.jetBrainsMono(fontSize: 9, color: KineticTokens.outline),
                  ),
                ],
              ),
            ),
            Icon(
              sel ? Icons.check_circle : Icons.radio_button_unchecked,
              color: sel ? KineticTokens.primaryContainer : KineticTokens.outlineVariant,
              size: 22,
            ),
          ],
        ),
      ),
    );
  }

  Widget _sectionTitle(BuildContext context, String t) {
    return Text(
      t,
      style: GoogleFonts.spaceGrotesk(
        fontSize: 12,
        fontWeight: FontWeight.w600,
        letterSpacing: 1.2,
        color: KineticTokens.primaryContainer,
      ),
    );
  }

  Widget _providerCard(
    BuildContext context, {
    required String title,
    required IconData icon,
    required bool connected,
    required VoidCallback onPrimary,
    required String primaryLabel,
    bool dim = false,
  }) {
    return KineticGlassPanel(
      padding: const EdgeInsets.all(16),
      borderRadius: KineticTokens.radiusLg,
      border: Border(
        left: BorderSide(
          width: 4,
          color: connected && !dim ? KineticTokens.primaryContainer : KineticTokens.outlineVariant,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: KineticTokens.surfaceContainerLowest,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(icon, size: 26, color: dim ? KineticTokens.onSurface.withValues(alpha: 0.5) : KineticTokens.onSurface),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: GoogleFonts.spaceGrotesk(
                        fontSize: 17,
                        fontWeight: FontWeight.w500,
                        color: dim ? KineticTokens.onSurface.withValues(alpha: 0.55) : KineticTokens.onSurface,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Container(
                          width: 6,
                          height: 6,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: connected && !dim ? KineticTokens.primaryFixedDim : KineticTokens.outlineVariant,
                            boxShadow: connected && !dim
                                ? [BoxShadow(color: KineticTokens.primaryFixedDim.withValues(alpha: 0.5), blurRadius: 6)]
                                : null,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          connected ? 'CONNECTED' : 'DISCONNECTED',
                          style: GoogleFonts.jetBrainsMono(
                            fontSize: 10,
                            color: connected && !dim ? KineticTokens.primaryFixedDim : KineticTokens.outlineVariant,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              TextButton(
                onPressed: onPrimary,
                style: TextButton.styleFrom(
                  backgroundColor: connected && !dim
                      ? KineticTokens.surfaceContainerHighest
                      : KineticTokens.primaryContainer,
                  foregroundColor: connected && !dim ? KineticTokens.onSurface : KineticTokens.onPrimaryFixed,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                ),
                child: Text(
                  primaryLabel,
                  style: GoogleFonts.jetBrainsMono(fontSize: 10, fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _tile(BuildContext context, String title, String subtitle, VoidCallback onTap) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      title: Text(title, style: GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w500, color: KineticTokens.onSurface)),
      subtitle: Text(
        subtitle,
        style: GoogleFonts.inter(fontSize: 11, color: KineticTokens.outline),
      ),
      trailing: Icon(Icons.chevron_right, color: KineticTokens.outline),
      onTap: onTap,
    );
  }
}

class _ClassicPanel extends StatelessWidget {
  const _ClassicPanel({
    required this.embedded,
    required this.projects,
    required this.githubConnected,
    required this.syncSelection,
    required this.onSyncToggle,
    required this.autoSync,
    required this.onAutoSync,
    required this.onManageGithub,
    required this.onOpenLlm,
    required this.filter,
    required this.onSoon,
  });

  final bool embedded;
  final List<Project> projects;
  final bool githubConnected;
  final Set<String> syncSelection;
  final void Function(String worktree, bool selected) onSyncToggle;
  final bool autoSync;
  final ValueChanged<bool> onAutoSync;
  final VoidCallback onManageGithub;
  final VoidCallback onOpenLlm;
  final TextEditingController filter;
  final void Function(BuildContext) onSoon;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (!embedded)
            Row(
              children: [
                Expanded(child: Text('Project settings', style: Theme.of(context).textTheme.titleLarge)),
                IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.of(context).maybePop()),
              ],
            ),
          if (!embedded) const SizedBox(height: 16),
          ListTile(
            leading: const Icon(Icons.code),
            title: const Text('GitHub'),
            subtitle: Text(githubConnected ? 'Connected' : 'Not connected'),
            trailing: TextButton(
              onPressed: onManageGithub,
              child: Text(githubConnected ? 'Manage' : 'Connect'),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.smart_toy_outlined),
            title: const Text('LLM'),
            onTap: onOpenLlm,
          ),
          ListTile(
            leading: const Icon(Icons.vpn_key_outlined),
            title: const Text('SSH keys'),
            onTap: () => onSoon(context),
          ),
          const Divider(),
          SwitchListTile(
            title: const Text('Auto-sync selection'),
            value: autoSync,
            onChanged: onAutoSync,
          ),
          ...projects.map(
            (p) => CheckboxListTile(
              value: syncSelection.contains(p.worktree),
              onChanged: (v) => onSyncToggle(p.worktree, v ?? false),
              title: Text(p.name ?? p.worktree),
            ),
          ),
        ],
      ),
    );
  }
}
