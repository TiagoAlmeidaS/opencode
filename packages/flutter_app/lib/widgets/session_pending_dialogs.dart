import 'package:flutter/material.dart';

import '../api/opencode_client.dart';
import '../theme/oc2_colors.dart';

/// Shows permission and question dialogs for the active session (parity with web toasts).
class SessionPendingDialogs {
  static Future<void> pollAndShow(
    BuildContext ctx, {
    required OpenCodeClient client,
    required String directory,
    required String sessionID,
    required void Function() onAfter,
  }) async {
    if (!ctx.mounted) return;
    final perms = await client.permissionList(directory) ?? [];
    final pendingPerm = perms.where((m) => m['sessionID'] == sessionID).toList();
    for (final p in pendingPerm) {
      if (!ctx.mounted) return;
      final id = p['id'] as String?;
      if (id == null) continue;
      final ok = await _perm(ctx, client, directory, p);
      if (!ok) break;
      onAfter();
    }
    if (!ctx.mounted) return;
    final qs = await client.questionList(directory) ?? [];
    final pendingQ = qs.where((m) => m['sessionID'] == sessionID).toList();
    for (final q in pendingQ) {
      if (!ctx.mounted) return;
      final id = q['id'] as String?;
      if (id == null) continue;
      final ok = await _question(ctx, client, directory, q);
      if (!ok) break;
      onAfter();
    }
  }

  static Future<bool> _perm(
    BuildContext ctx,
    OpenCodeClient client,
    String directory,
    Map<String, dynamic> row,
  ) async {
    final perm = row['permission'] as String? ?? 'Permission';
    final patterns = (row['patterns'] as List<dynamic>?)?.map((e) => '$e').join('\n') ?? '';
    final palette = Theme.of(ctx).brightness == Brightness.dark ? Oc2Colors.dark : Oc2Colors.light;
    final id = row['id'] as String;
    final choice = await showDialog<String>(
      context: ctx,
      barrierDismissible: false,
      builder: (c) => AlertDialog(
        backgroundColor: palette.backgroundStrong,
        title: Text('Permission', style: TextStyle(color: palette.textStrong)),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(perm, style: TextStyle(color: palette.textStrong, fontWeight: FontWeight.w600)),
              if (patterns.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(patterns, style: TextStyle(color: palette.textWeak, fontSize: 12)),
              ],
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, 'reject'), child: const Text('Reject')),
          TextButton(onPressed: () => Navigator.pop(c, 'once'), child: const Text('Allow once')),
          FilledButton(onPressed: () => Navigator.pop(c, 'always'), child: const Text('Always')),
        ],
      ),
    );
    if (choice == null || !ctx.mounted) return false;
    await client.permissionReply(directory, id, reply: choice);
    return true;
  }

  static Future<bool> _question(
    BuildContext ctx,
    OpenCodeClient client,
    String directory,
    Map<String, dynamic> row,
  ) async {
    final questions = (row['questions'] as List<dynamic>?) ?? [];
    final palette = Theme.of(ctx).brightness == Brightness.dark ? Oc2Colors.dark : Oc2Colors.light;
    final id = row['id'] as String;
    final answers = await showDialog<List<List<String>>>(
      context: ctx,
      barrierDismissible: false,
      builder: (c) => _QuestionForm(palette: palette, questions: questions),
    );
    if (answers == null || !ctx.mounted) return false;
    if (answers.isEmpty) {
      await client.questionReject(directory, id);
    } else {
      await client.questionReply(directory, id, answers);
    }
    return true;
  }
}

class _QuestionForm extends StatefulWidget {
  const _QuestionForm({required this.palette, required this.questions});

  final Oc2Palette palette;
  final List<dynamic> questions;

  @override
  State<_QuestionForm> createState() => _QuestionFormState();
}

class _QuestionFormState extends State<_QuestionForm> {
  final _custom = <int, TextEditingController>{};
  final _picked = <int, Set<String>>{};

  @override
  void dispose() {
    for (final t in _custom.values) {
      t.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.palette;
    return AlertDialog(
      backgroundColor: p.backgroundStrong,
      title: Text('Question', style: TextStyle(color: p.textStrong)),
      content: SizedBox(
        width: 400,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: List.generate(widget.questions.length, (qi) {
              final q = widget.questions[qi];
              if (q is! Map) return const SizedBox.shrink();
              final header = q['header'] as String? ?? 'Q${qi + 1}';
              final text = q['question'] as String? ?? '';
              final multiple = q['multiple'] == true;
              final allowCustom = q['custom'] != false;
              final opts = (q['options'] as List<dynamic>?) ?? [];
              _picked.putIfAbsent(qi, () => {});
              _custom.putIfAbsent(qi, () => TextEditingController());
              return Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(header, style: TextStyle(color: p.textStrong, fontWeight: FontWeight.w600)),
                    Text(text, style: TextStyle(color: p.textWeak, fontSize: 13)),
                    ...opts.map((o) {
                      if (o is! Map) return const SizedBox.shrink();
                      final label = o['label'] as String? ?? '';
                      final sel = _picked[qi]!;
                      return multiple
                          ? CheckboxListTile(
                              title: Text(label, style: TextStyle(color: p.textStrong)),
                              value: sel.contains(label),
                              onChanged: (v) => setState(() {
                                if (v == true) {
                                  sel.add(label);
                                } else {
                                  sel.remove(label);
                                }
                              }),
                            )
                          : FilterChip(
                              label: Text(label),
                              selected: sel.contains(label),
                              onSelected: (_) => setState(() {
                                sel
                                  ..clear()
                                  ..add(label);
                              }),
                            );
                    }),
                    if (allowCustom)
                      TextField(
                        controller: _custom[qi],
                        decoration: InputDecoration(
                          hintText: 'Custom answer',
                          hintStyle: TextStyle(color: p.textWeak),
                        ),
                        style: TextStyle(color: p.textStrong),
                      ),
                  ],
                ),
              );
            }),
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, null),
          child: const Text('Cancel'),
        ),
        TextButton(
          onPressed: () => Navigator.pop(context, <List<String>>[]),
          child: const Text('Reject'),
        ),
        FilledButton(
          onPressed: () {
            final out = <List<String>>[];
            for (var i = 0; i < widget.questions.length; i++) {
              final labels = _picked[i]?.toList() ?? [];
              final extra = _custom[i]?.text.trim() ?? '';
              final row = [...labels];
              if (extra.isNotEmpty) row.add(extra);
              if (row.isEmpty) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Answer question ${i + 1}')),
                );
                return;
              }
              out.add(row);
            }
            Navigator.pop(context, out);
          },
          child: const Text('Submit'),
        ),
      ],
    );
  }
}
