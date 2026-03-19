import 'package:flutter/material.dart';

import '../services/github_api.dart';
import '../theme/button_style.dart';
import 'opencode_button.dart';

typedef AddProjectCallback = Future<dynamic> Function(
  String url, {
  String? branch,
  String? token,
});

/// Add a GitHub repo to OpenCode: URL manually or pick from list with PAT (token sent to server on add only).
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

  @override
  void dispose() {
    _url.dispose();
    _branch.dispose();
    _pat.dispose();
    super.dispose();
  }

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

  Future<void> _loadRepos() async {
    setState(() {
      _reposBusy = true;
      _repoErr = null;
      _repos = [];
    });
    final out = await _gh.listRepos(_pat.text);
    if (!mounted) return;
    setState(() {
      _reposBusy = false;
      _repoErr = out.error;
      _repos = out.repos;
    });
  }

  void _pick(GithubRepoBrief r) {
    setState(() {
      _url.text = 'https://github.com/${r.fullName}';
      _err = null;
    });
  }

  Future<void> _submit() async {
    if (!_validUrl()) return;

    setState(() {
      _busy = true;
      _err = null;
    });

    try {
      final b = _branch.text.trim();
      final tok = _pat.text.trim();
      await widget.onAdd(
        _url.text.trim(),
        branch: b.isEmpty ? null : b,
        token: tok.isEmpty ? null : tok,
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _err = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

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
              Text(
                'GitHub token (optional)',
                style: Theme.of(context).textTheme.titleSmall,
              ),
              const SizedBox(height: 4),
              Text(
                'Optional if your OpenCode server already has GITHUB_TOKEN in its environment (e.g. Docker env_file). '
                'Use PAT here for private repos without server token, or to load your repo list. '
                'Sent to the server only when you tap Add — not stored in the app.',
                style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant),
              ),
              const SizedBox(height: 8),
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
              if (_repoErr != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(_repoErr!, style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 13)),
                ),
              if (_repos.isNotEmpty)
                SizedBox(
                  height: 200,
                  child: Material(
                    color: Theme.of(context).colorScheme.surfaceContainerHighest.withOpacity(0.45),
                    borderRadius: BorderRadius.circular(8),
                    child: ListView.builder(
                      itemCount: _repos.length,
                      itemBuilder: (_, i) {
                        final r = _repos[i];
                        return ListTile(
                          dense: true,
                          title: Text(r.fullName, style: const TextStyle(fontSize: 14)),
                          subtitle: r.private ? const Text('Private', style: TextStyle(fontSize: 12)) : null,
                          onTap: () => _pick(r),
                        );
                      },
                    ),
                  ),
                ),
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
}
