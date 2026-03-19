import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../services/github_api.dart';
import '../state/app_state.dart';
import '../theme/button_style.dart';
import 'opencode_button.dart';

typedef AddProjectCallback = Future<dynamic> Function(
  String url, {
  String? branch,
  String? token,
});

/// Add a GitHub repo to OpenCode.
///
/// Supports two auth methods:
///   1. GitHub OAuth via Device Flow (server-proxied, recommended)
///   2. Personal Access Token (manual fallback)
class DialogAddProject extends StatefulWidget {
  const DialogAddProject({super.key, required this.onAdd});

  final AddProjectCallback onAdd;

  @override
  State<DialogAddProject> createState() => _DialogAddProjectState();
}

class _DialogAddProjectState extends State<DialogAddProject> {
  final _url = TextEditingController();
  final _branch = TextEditingController();
  final _pat = TextEditingController();
  final _gh = GithubApi();

  bool _hidePat = true;
  bool _busy = false;
  bool _reposBusy = false;
  String? _err;
  String? _repoErr;
  List<GithubRepoBrief> _repos = [];

  // GitHub Device Flow state: none | starting | code | done
  String _authState = 'none';
  String? _deviceCode;
  String? _userCode;
  String? _verificationUri;
  int _pollInterval = 5;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    // If already signed in from this session, restore state and load repos.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final token = context.read<AppState>().githubToken;
      if (token != null) {
        setState(() => _authState = 'done');
        _loadRepos();
      }
    });
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _url.dispose();
    _branch.dispose();
    _pat.dispose();
    super.dispose();
  }

  // ── Validation / submission ────────────────────────────────────────────────

  bool _validUrl() {
    final u = _url.text.trim();
    if (u.isEmpty) {
      setState(() => _err = 'URL is required');
      return false;
    }
    try {
      final parsed = Uri.parse(u.startsWith('http') ? u : 'https://$u');
      if (!parsed.host.toLowerCase().contains('github.com')) {
        setState(() => _err = 'Only GitHub repositories are supported');
        return false;
      }
    } catch (_) {
      setState(() => _err = 'Invalid URL');
      return false;
    }
    setState(() => _err = null);
    return true;
  }

  Future<void> _submit() async {
    if (!_validUrl()) return;
    setState(() {
      _busy = true;
      _err = null;
    });
    try {
      final b = _branch.text.trim();
      // Prefer OAuth token, fall back to manual PAT.
      final oauthToken = context.read<AppState>().githubToken;
      final pat = _pat.text.trim();
      final tok = oauthToken ?? (pat.isNotEmpty ? pat : null);
      await widget.onAdd(_url.text.trim(), branch: b.isEmpty ? null : b, token: tok);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _err = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _pick(GithubRepoBrief r) {
    setState(() {
      _url.text = 'https://github.com/${r.fullName}';
      _err = null;
    });
  }

  // ── Repo listing ───────────────────────────────────────────────────────────

  Future<void> _loadRepos() async {
    final state = context.read<AppState>();
    final token = state.githubToken ?? (_pat.text.trim().isNotEmpty ? _pat.text.trim() : null);
    if (token == null) return;

    setState(() {
      _reposBusy = true;
      _repoErr = null;
      _repos = [];
    });
    final out = await _gh.listRepos(token);
    if (!mounted) return;
    setState(() {
      _reposBusy = false;
      _repoErr = out.error;
      _repos = out.repos;
    });
  }

  // ── GitHub Device Flow ─────────────────────────────────────────────────────

  Future<void> _startGithubAuth() async {
    final state = context.read<AppState>();
    final client = state.client;
    if (client == null) {
      setState(() => _repoErr = 'Not connected to OpenCode server');
      return;
    }

    setState(() {
      _authState = 'starting';
      _repoErr = null;
    });

    final data = await client.githubAuthStart();
    if (!mounted) return;

    if (data == null || data['error'] != null) {
      setState(() {
        _authState = 'none';
        _repoErr = data?['error'] as String? ??
            'Failed to start GitHub sign-in.\n'
                'Make sure GITHUB_OAUTH_CLIENT_ID is set on the server.';
      });
      return;
    }

    setState(() {
      _authState = 'code';
      _deviceCode = data['deviceCode'] as String?;
      _userCode = data['userCode'] as String?;
      _verificationUri = data['verificationUri'] as String?;
      _pollInterval = (data['interval'] as int?) ?? 5;
    });

    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(
      Duration(seconds: _pollInterval),
      (_) => _pollGithubAuth(),
    );
  }

  Future<void> _pollGithubAuth() async {
    if (!mounted) return;
    final dc = _deviceCode;
    if (dc == null) return;

    final state = context.read<AppState>();
    final client = state.client;
    if (client == null) return;

    final result = await client.githubAuthPoll(dc);
    if (!mounted) return;

    final status = result?['status'] as String?;

    switch (status) {
      case 'done':
        _pollTimer?.cancel();
        _pollTimer = null;
        final token = result!['token'] as String?;
        state.setGithubToken(token);
        setState(() {
          _authState = 'done';
          _deviceCode = null;
          _userCode = null;
          _verificationUri = null;
        });
        _loadRepos();

      case 'expired':
        _pollTimer?.cancel();
        _pollTimer = null;
        setState(() {
          _authState = 'none';
          _repoErr = 'Code expired. Please try again.';
        });

      case 'denied':
        _pollTimer?.cancel();
        _pollTimer = null;
        setState(() {
          _authState = 'none';
          _repoErr = 'Access denied by GitHub.';
        });

      case 'error':
        _pollTimer?.cancel();
        _pollTimer = null;
        setState(() {
          _authState = 'none';
          _repoErr = result?['error'] as String? ?? 'Authentication error';
        });

      // 'pending' → keep polling
    }
  }

  void _cancelGithubAuth() {
    _pollTimer?.cancel();
    _pollTimer = null;
    setState(() {
      _authState = 'none';
      _deviceCode = null;
      _userCode = null;
      _verificationUri = null;
    });
  }

  void _signOut() {
    context.read<AppState>().setGithubToken(null);
    setState(() {
      _authState = 'none';
      _repos = [];
      _repoErr = null;
    });
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Add repository'),
      content: SizedBox(
        width: 440,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(
                controller: _url,
                decoration: InputDecoration(
                  labelText: 'Repository URL',
                  hintText: 'https://github.com/owner/repo',
                  errorText: _err,
                ),
                keyboardType: TextInputType.url,
                onChanged: (_) => setState(() => _err = null),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _branch,
                decoration: const InputDecoration(
                  labelText: 'Branch (optional)',
                  hintText: 'main',
                ),
              ),
              const SizedBox(height: 16),
              const Divider(),
              const SizedBox(height: 8),
              _buildAuthSection(context),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _busy ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        OpenCodeButton(
          onPressed: _busy ? null : _submit,
          variant: OpenCodeButtonVariant.primary,
          child: Text(_busy ? 'Adding…' : 'Add to OpenCode'),
        ),
      ],
    );
  }

  Widget _buildAuthSection(BuildContext context) {
    return switch (_authState) {
      'code' => _buildDeviceFlowCard(context),
      'done' => _buildSignedInSection(context),
      _ => _buildSignInButton(context),
    };
  }

  // State: none | starting — shows sign-in button + PAT fallback.
  Widget _buildSignInButton(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        OpenCodeButton(
          onPressed: _authState == 'starting' ? null : _startGithubAuth,
          variant: OpenCodeButtonVariant.secondary,
          icon: Icons.login,
          child: Text(_authState == 'starting' ? 'Starting…' : 'Sign in with GitHub'),
        ),
        if (_repoErr != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              _repoErr!,
              style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 13),
            ),
          ),
        const SizedBox(height: 4),
        // PAT fallback in an expansion tile
        ExpansionTile(
          title: const Text('Use a token manually', style: TextStyle(fontSize: 14)),
          tilePadding: EdgeInsets.zero,
          childrenPadding: EdgeInsets.zero,
          children: [
            TextField(
              controller: _pat,
              obscureText: _hidePat,
              decoration: InputDecoration(
                labelText: 'Personal access token',
                suffixIcon: IconButton(
                  icon: Icon(_hidePat ? Icons.visibility : Icons.visibility_off),
                  onPressed: () => setState(() => _hidePat = !_hidePat),
                ),
              ),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: _reposBusy || _pat.text.trim().isEmpty ? null : _loadRepos,
                icon: _reposBusy
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.cloud_download_outlined, size: 20),
                label: Text(_reposBusy ? 'Loading…' : 'Load my repositories'),
              ),
            ),
          ],
        ),
        if (_repos.isNotEmpty) _buildRepoList(context),
      ],
    );
  }

  // State: code — Device Flow card with user_code.
  Widget _buildDeviceFlowCard(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        border: Border.all(color: cs.outlineVariant),
        borderRadius: BorderRadius.circular(8),
        color: cs.surfaceContainerHighest.withValues(alpha: 0.3),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const SizedBox(
                width: 14,
                height: 14,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
              const SizedBox(width: 10),
              Text(
                'Waiting for GitHub authorization…',
                style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Step 1: open URL
          Text('1. Open in your browser:', style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
          const SizedBox(height: 4),
          Row(
            children: [
              Expanded(
                child: SelectableText(
                  _verificationUri ?? 'https://github.com/login/device',
                  style: const TextStyle(fontFamily: 'monospace', fontSize: 13),
                ),
              ),
              _CopyButton(
                text: _verificationUri ?? '',
                tooltip: 'Copy URL',
                snackMessage: 'URL copied',
              ),
            ],
          ),
          const SizedBox(height: 14),

          // Step 2: enter code
          Text('2. Enter this code on GitHub:', style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
          const SizedBox(height: 6),
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                decoration: BoxDecoration(
                  border: Border.all(color: cs.primary, width: 1.5),
                  borderRadius: BorderRadius.circular(6),
                  color: cs.primaryContainer.withValues(alpha: 0.25),
                ),
                child: Text(
                  _userCode ?? '…',
                  style: TextStyle(
                    fontFamily: 'monospace',
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: cs.primary,
                    letterSpacing: 3,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              _CopyButton(
                text: _userCode ?? '',
                tooltip: 'Copy code',
                snackMessage: 'Code copied',
              ),
            ],
          ),
          const SizedBox(height: 14),
          TextButton(
            onPressed: _cancelGithubAuth,
            child: const Text('Cancel sign-in'),
          ),
        ],
      ),
    );
  }

  // State: done — shows signed-in status + repo list.
  Widget _buildSignedInSection(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Icon(Icons.check_circle_outline, size: 18, color: cs.primary),
            const SizedBox(width: 8),
            const Text('Signed in with GitHub', style: TextStyle(fontSize: 14)),
            const Spacer(),
            TextButton(onPressed: _signOut, child: const Text('Sign out')),
          ],
        ),
        const SizedBox(height: 8),
        if (_reposBusy)
          const Center(
            child: Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: CircularProgressIndicator(),
            ),
          )
        else if (_repoErr != null)
          Text(_repoErr!, style: TextStyle(color: cs.error, fontSize: 13))
        else if (_repos.isEmpty)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: _loadRepos,
              icon: const Icon(Icons.cloud_download_outlined, size: 20),
              label: const Text('Load my repositories'),
            ),
          )
        else
          _buildRepoList(context),
      ],
    );
  }

  Widget _buildRepoList(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return SizedBox(
      height: 200,
      child: Material(
        color: cs.surfaceContainerHighest.withValues(alpha: 0.45),
        borderRadius: BorderRadius.circular(8),
        child: ListView.builder(
          itemCount: _repos.length,
          itemBuilder: (_, i) {
            final r = _repos[i];
            return ListTile(
              dense: true,
              leading: Icon(
                r.private ? Icons.lock_outline : Icons.folder_outlined,
                size: 18,
                color: cs.onSurfaceVariant,
              ),
              title: Text(r.fullName, style: const TextStyle(fontSize: 14)),
              subtitle: r.private ? const Text('Private', style: TextStyle(fontSize: 12)) : null,
              onTap: () => _pick(r),
            );
          },
        ),
      ),
    );
  }
}

/// Small copy-to-clipboard icon button with a SnackBar confirmation.
class _CopyButton extends StatelessWidget {
  const _CopyButton({required this.text, required this.tooltip, required this.snackMessage});

  final String text;
  final String tooltip;
  final String snackMessage;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: const Icon(Icons.copy, size: 16),
      tooltip: tooltip,
      padding: const EdgeInsets.all(4),
      constraints: const BoxConstraints(),
      onPressed: () {
        Clipboard.setData(ClipboardData(text: text));
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(snackMessage), duration: const Duration(seconds: 2)),
        );
      },
    );
  }
}
