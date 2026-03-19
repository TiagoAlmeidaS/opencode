import 'package:flutter/material.dart';

import '../theme/button_style.dart';
import 'opencode_button.dart';

/// Dialog to add a project by repository URL (GitHub).
class DialogAddProject extends StatefulWidget {
  const DialogAddProject({
    super.key,
    required this.onAdd,
  });

  final Future<dynamic> Function(String url, {String? branch}) onAdd;

  @override
  State<DialogAddProject> createState() => _DialogAddProjectState();
}

class _DialogAddProjectState extends State<DialogAddProject> {
  final _urlController = TextEditingController();
  final _branchController = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _urlController.dispose();
    _branchController.dispose();
    super.dispose();
  }

  bool _valid() {
    final u = _urlController.text.trim();
    if (u.isEmpty) {
      setState(() => _error = 'URL is required');
      return false;
    }
    try {
      final parsed = Uri.parse(u.startsWith('http') ? u : 'https://$u');
      if (!parsed.host.toLowerCase().contains('github.com')) {
        setState(() => _error = 'Only GitHub repositories are supported');
        return false;
      }
    } catch (_) {
      setState(() => _error = 'Invalid URL');
      return false;
    }
    setState(() => _error = null);
    return true;
  }

  Future<void> _submit() async {
    if (!_valid()) return;

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final branch = _branchController.text.trim();
      await widget.onAdd(
        _urlController.text.trim(),
        branch: branch.isEmpty ? null : branch,
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Add repository'),
      content: SizedBox(
        width: 400,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _urlController,
              decoration: InputDecoration(
                labelText: 'Repository URL',
                hintText: 'https://github.com/owner/repo',
                errorText: _error,
              ),
              keyboardType: TextInputType.url,
              onChanged: (_) => setState(() => _error = null),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _branchController,
              decoration: const InputDecoration(
                labelText: 'Branch (optional)',
                hintText: 'main',
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _loading ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        OpenCodeButton(
          onPressed: _loading ? null : _submit,
          variant: OpenCodeButtonVariant.primary,
          child: Text(_loading ? 'Adding…' : 'Add'),
        ),
      ],
    );
  }
}
