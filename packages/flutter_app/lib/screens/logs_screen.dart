import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../theme/oc2_colors.dart';

class LogsScreen extends StatefulWidget {
  const LogsScreen({super.key});

  @override
  State<LogsScreen> createState() => _LogsScreenState();
}

class _LogsScreenState extends State<LogsScreen> {
  List<Map<String, dynamic>>? _logs;
  bool _loading = true;
  String _filter = 'all';
  Timer? _timer;

  static const _filters = ['all', 'info', 'warn', 'error', 'debug'];

  static const _termBg = Color(0xFF0D1117);
  static const _termText = Color(0xFFE6EDF3);
  static const _termMuted = Color(0xFF8B949E);

  Oc2Palette get _palette =>
      Theme.of(context).brightness == Brightness.dark ? Oc2Colors.dark : Oc2Colors.light;

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 10), (_) {
      if (mounted) _load();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final srv = context.read<AppState>().server;
    if (srv == null) {
      setState(() => _loading = false);
      return;
    }
    final logs = await srv.logs(
      level: _filter == 'all' ? null : _filter,
      limit: 100,
    );
    if (!mounted) return;
    setState(() {
      _logs = logs;
      _loading = false;
    });
  }

  String _formatTimestamp(dynamic raw) {
    if (raw == null) return '';
    if (raw is num) {
      final dt = DateTime.fromMillisecondsSinceEpoch(raw.toInt() * 1000).toLocal();
      return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}:${dt.second.toString().padLeft(2, '0')}';
    }
    try {
      final dt = DateTime.parse(raw.toString()).toLocal();
      return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}:${dt.second.toString().padLeft(2, '0')}';
    } catch (_) {
      return '';
    }
  }

  Color _levelColor(String level) {
    switch (level) {
      case 'info':
        return Colors.blue;
      case 'warn':
        return Colors.orange;
      case 'error':
        return Colors.red;
      case 'debug':
        return Colors.grey;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = _palette;
    return Scaffold(
      backgroundColor: palette.backgroundBase,
      appBar: AppBar(
        backgroundColor: palette.backgroundBase,
        foregroundColor: palette.textStrong,
        title: const Text('Daemon Logs'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh',
            onPressed: _load,
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: _filters.map((f) {
                  final selected = _filter == f;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: FilterChip(
                      label: Text(f),
                      selected: selected,
                      onSelected: (_) {
                        setState(() => _filter = f);
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
                : (_logs == null || _logs!.isEmpty)
                    ? Center(
                        child: Text(
                          'No items found',
                          style: TextStyle(color: palette.textWeak),
                        ),
                      )
                    : Container(
                        color: _termBg,
                        child: ListView.builder(
                          padding: EdgeInsets.zero,
                          itemCount: _logs!.length,
                          itemBuilder: (ctx, i) => _buildLogRow(_logs![i]),
                        ),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildLogRow(Map<String, dynamic> log) {
    final level = log['level'] as String? ?? 'info';
    final message = log['message'] as String? ?? '';
    final pipeline = log['pipeline'] as String?;
    final timestamp = log['timestamp'];

    final dotColor = _levelColor(level);
    final timeStr = _formatTimestamp(timestamp);
    final subtitleParts = <String>[
      if (pipeline != null && pipeline.isNotEmpty) pipeline,
      if (timeStr.isNotEmpty) timeStr,
    ];

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 14),
            child: Container(
              width: 7,
              height: 7,
              decoration: BoxDecoration(
                color: dotColor,
                shape: BoxShape.circle,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 8),
                Text(
                  message,
                  style: const TextStyle(
                    fontSize: 12,
                    color: _termText,
                    fontFamily: 'monospace',
                    height: 1.4,
                  ),
                ),
                if (subtitleParts.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    subtitleParts.join(' • '),
                    style: const TextStyle(
                      fontSize: 11,
                      color: _termMuted,
                      fontFamily: 'monospace',
                    ),
                  ),
                ],
                const SizedBox(height: 8),
                const Divider(height: 1, color: Color(0xFF21262D), thickness: 1),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
