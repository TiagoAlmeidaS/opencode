import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../theme/oc2_colors.dart';

class MemorySearchScreen extends StatefulWidget {
  const MemorySearchScreen({super.key});

  @override
  State<MemorySearchScreen> createState() => _MemorySearchScreenState();
}

class _MemorySearchScreenState extends State<MemorySearchScreen> {
  final _controller = TextEditingController();
  List<dynamic>? _results;
  bool _loading = false;
  String? _error;

  Oc2Palette get _palette =>
      Theme.of(context).brightness == Brightness.dark ? Oc2Colors.dark : Oc2Colors.light;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _search(String q) async {
    if (q.trim().isEmpty) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    final srv = context.read<AppState>().server;
    if (srv == null) {
      setState(() {
        _loading = false;
        _error = 'No server connected';
      });
      return;
    }
    final res = await srv.memory(q.trim(), limit: 10);
    if (!mounted) return;
    setState(() {
      _loading = false;
      if (res == null) {
        _error = 'No results or server error';
        _results = null;
      } else {
        final raw = res['results'] ?? res['items'] ?? res;
        _results = raw is List ? raw : [];
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final palette = _palette;
    return Scaffold(
      backgroundColor: palette.backgroundBase,
      appBar: AppBar(
        backgroundColor: palette.backgroundBase,
        foregroundColor: palette.textStrong,
        title: const Text('Memory Search'),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: TextField(
              controller: _controller,
              autofocus: true,
              decoration: InputDecoration(
                hintText: 'Search memory…',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _loading
                    ? const Padding(
                        padding: EdgeInsets.all(12),
                        child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)),
                      )
                    : null,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              ),
              onSubmitted: _search,
              textInputAction: TextInputAction.search,
            ),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 13)),
            ),
          if (_results != null && _results!.isEmpty && !_loading)
            Expanded(
              child: Center(
                child: Text('No results found', style: TextStyle(color: palette.textWeak)),
              ),
            ),
          if (_results != null && _results!.isNotEmpty)
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: _results!.length,
                itemBuilder: (_, i) {
                  final item = _results![i];
                  if (item is! Map) return const SizedBox.shrink();
                  final content = item['content'] as String? ?? item['text'] as String? ?? '';
                  final category = item['category'] as String?;
                  final score = (item['score'] as num?)?.toStringAsFixed(2);
                  return Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              if (category != null) ...[
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.15),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Text(
                                    category,
                                    style: TextStyle(
                                      fontSize: 11,
                                      color: Theme.of(context).colorScheme.primary,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                              ],
                              if (score != null)
                                Text(
                                  'score: $score',
                                  style: TextStyle(fontSize: 11, color: palette.textWeak),
                                ),
                            ],
                          ),
                          if (category != null || score != null) const SizedBox(height: 6),
                          Text(content, style: const TextStyle(fontSize: 13)),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          if (_results == null && !_loading && _error == null)
            Expanded(
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.psychology_outlined, size: 56, color: palette.textWeak),
                    const SizedBox(height: 12),
                    Text(
                      'Search the agent\'s memory',
                      style: TextStyle(color: palette.textWeak),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
