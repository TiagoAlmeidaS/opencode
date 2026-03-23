import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../theme/oc2_colors.dart';

class SpecsScreen extends StatefulWidget {
  const SpecsScreen({super.key});

  @override
  State<SpecsScreen> createState() => _SpecsScreenState();
}

class _SpecsScreenState extends State<SpecsScreen> {
  List<Map<String, dynamic>>? _specs;
  bool _loading = true;
  String _filter = 'all';

  static const _statuses = ['all', 'draft', 'ready', 'archived'];

  Oc2Palette get _palette =>
      Theme.of(context).brightness == Brightness.dark ? Oc2Colors.dark : Oc2Colors.light;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final srv = context.read<AppState>().server;
    if (srv == null) {
      setState(() => _loading = false);
      return;
    }
    final results = await srv.specs(
      status: _filter == 'all' ? null : _filter,
      limit: 50,
    );
    if (!mounted) return;
    setState(() {
      _specs = results;
      _loading = false;
    });
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'draft':
        return Colors.orange;
      case 'ready':
        return Colors.green;
      case 'archived':
        return Colors.grey;
      default:
        return Colors.grey;
    }
  }

  String _formatDate(num? ts) {
    if (ts == null) return '';
    final dt = DateTime.fromMillisecondsSinceEpoch(ts.toInt() * 1000);
    return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';
  }

  Future<void> _showCreateDialog() async {
    final formKey = GlobalKey<FormState>();
    final titleCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    final repoCtrl = TextEditingController();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('New Spec'),
        content: SizedBox(
          width: 400,
          child: Form(
            key: formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextFormField(
                  controller: titleCtrl,
                  decoration: const InputDecoration(labelText: 'Title *'),
                  validator: (v) => (v == null || v.trim().isEmpty) ? 'Title is required' : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: descCtrl,
                  decoration: const InputDecoration(labelText: 'Description'),
                  maxLines: 3,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: repoCtrl,
                  decoration: const InputDecoration(labelText: 'Repo URL'),
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              if (formKey.currentState?.validate() == true) {
                Navigator.pop(ctx, true);
              }
            },
            child: const Text('Create'),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;
    final srv = context.read<AppState>().server;
    if (srv == null) return;

    final result = await srv.specCreate(
      title: titleCtrl.text.trim(),
      description: descCtrl.text.trim().isEmpty ? null : descCtrl.text.trim(),
      repoUrl: repoCtrl.text.trim().isEmpty ? null : repoCtrl.text.trim(),
    );
    if (!mounted) return;
    if (result != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Spec created successfully')),
      );
      _load();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Failed to create spec'), backgroundColor: Colors.red),
      );
    }
  }

  Future<void> _showPromptSheet(String id, String title) async {
    final palette = _palette;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: palette.backgroundBase,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => _PromptBottomSheet(id: id, title: title, palette: palette),
    );
  }

  @override
  Widget build(BuildContext context) {
    final palette = _palette;
    return Scaffold(
      backgroundColor: palette.backgroundBase,
      appBar: AppBar(
        backgroundColor: palette.backgroundBase,
        foregroundColor: palette.textStrong,
        title: const Text('Specs & Especificações'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh',
            onPressed: _load,
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _showCreateDialog,
        tooltip: 'New Spec',
        child: const Icon(Icons.add),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: _statuses.map((s) {
                  final selected = _filter == s;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: FilterChip(
                      label: Text(s[0].toUpperCase() + s.substring(1)),
                      selected: selected,
                      onSelected: (_) {
                        setState(() => _filter = s);
                        _load();
                      },
                    ),
                  );
                }).toList(),
              ),
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : (_specs == null || _specs!.isEmpty)
                    ? Center(
                        child: Text(
                          'No specs found',
                          style: TextStyle(color: palette.textWeak),
                        ),
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 4, 16, 80),
                        itemCount: _specs!.length,
                        itemBuilder: (ctx, i) => _buildCard(palette, _specs![i]),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildCard(Oc2Palette palette, Map<String, dynamic> spec) {
    final id = spec['id'] as String? ?? '';
    final title = spec['title'] as String? ?? '-';
    final description = spec['description'] as String?;
    final status = spec['status'] as String? ?? 'draft';
    final repoUrl = spec['repo_url'] as String?;
    final createdAt = spec['created_at'] as num?;
    final statusColor = _statusColor(status);

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => _showPromptSheet(id, title),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      title,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: palette.textStrong,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: statusColor.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      status,
                      style: TextStyle(
                        fontSize: 11,
                        color: statusColor,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
              if (description != null && description.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(
                  description,
                  style: TextStyle(fontSize: 12, color: palette.textWeak),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
              if (repoUrl != null) ...[
                const SizedBox(height: 6),
                Row(
                  children: [
                    Icon(Icons.link, size: 12, color: palette.iconBase),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        repoUrl,
                        style: TextStyle(fontSize: 11, color: palette.textWeak),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ],
              if (createdAt != null) ...[
                const SizedBox(height: 4),
                Text(
                  _formatDate(createdAt),
                  style: TextStyle(fontSize: 11, color: palette.textWeak),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _PromptBottomSheet extends StatefulWidget {
  final String id;
  final String title;
  final Oc2Palette palette;

  const _PromptBottomSheet({
    required this.id,
    required this.title,
    required this.palette,
  });

  @override
  State<_PromptBottomSheet> createState() => _PromptBottomSheetState();
}

class _PromptBottomSheetState extends State<_PromptBottomSheet> {
  String? _prompt;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadPrompt();
  }

  Future<void> _loadPrompt() async {
    final srv = context.read<AppState>().server;
    if (srv == null) {
      setState(() => _loading = false);
      return;
    }
    final result = await srv.specPrompt(widget.id);
    if (!mounted) return;
    setState(() {
      _prompt = result;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final palette = widget.palette;
    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      maxChildSize: 0.95,
      minChildSize: 0.4,
      expand: false,
      builder: (ctx, scrollCtrl) => Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    widget.title,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: palette.textStrong,
                    ),
                  ),
                ),
                IconButton(
                  icon: Icon(Icons.close, color: palette.iconBase),
                  onPressed: () => Navigator.pop(ctx),
                ),
              ],
            ),
          ),
          Divider(height: 1, color: palette.borderWeak),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _prompt == null
                    ? Center(
                        child: Text(
                          'No prompt available',
                          style: TextStyle(color: palette.textWeak),
                        ),
                      )
                    : SingleChildScrollView(
                        controller: scrollCtrl,
                        padding: const EdgeInsets.all(16),
                        child: SelectableText(
                          _prompt!,
                          style: TextStyle(
                            fontFamily: 'monospace',
                            fontSize: 12,
                            color: palette.textStrong,
                            height: 1.5,
                          ),
                        ),
                      ),
          ),
        ],
      ),
    );
  }
}
