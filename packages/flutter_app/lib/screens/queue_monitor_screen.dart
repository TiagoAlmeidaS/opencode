import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../theme/oc2_colors.dart';

class QueueMonitorScreen extends StatefulWidget {
  const QueueMonitorScreen({super.key});

  @override
  State<QueueMonitorScreen> createState() => _QueueMonitorScreenState();
}

class _QueueMonitorScreenState extends State<QueueMonitorScreen> {
  List<Map<String, dynamic>>? _items;
  bool _loading = true;
  String _filter = 'active';
  Timer? _timer;

  static const _filters = ['active', 'all', 'pending', 'running', 'completed', 'failed', 'cancelled'];

  Oc2Palette get _palette =>
      Theme.of(context).brightness == Brightness.dark ? Oc2Colors.dark : Oc2Colors.light;

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 10), (_) => _load());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final srv = context.read<AppState>().server;
    if (srv == null) {
      if (mounted) setState(() => _loading = false);
      return;
    }
    final status = switch (_filter) {
      'active' => null,
      'all' => null,
      _ => _filter,
    };
    final items = await srv.queueItems(status: status, limit: 100);
    if (!mounted) return;
    setState(() {
      _items = _filter == 'active'
          ? items?.where((i) {
              final s = i['status'] as String? ?? '';
              return s == 'pending' || s == 'running';
            }).toList()
          : items;
      _loading = false;
    });
  }

  Future<void> _cancelItem(String id) async {
    final srv = context.read<AppState>().server;
    if (srv == null) return;
    await srv.queueItemCancel(id);
    _load();
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'running':   return Colors.blue;
      case 'completed': return Colors.green;
      case 'failed':    return Colors.red;
      case 'cancelled': return Colors.grey;
      default:          return Colors.orange; // pending
    }
  }

  IconData _statusIcon(String status) {
    switch (status) {
      case 'running':   return Icons.sync;
      case 'completed': return Icons.check_circle_outline;
      case 'failed':    return Icons.error_outline;
      case 'cancelled': return Icons.cancel_outlined;
      default:          return Icons.schedule; // pending
    }
  }

  String _ago(dynamic raw) {
    if (raw is! int) return '-';
    final dt = DateTime.fromMillisecondsSinceEpoch(raw * 1000).toLocal();
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }

  String _duration(dynamic ms) {
    if (ms is! int || ms <= 0) return '';
    if (ms < 1000) return '${ms}ms';
    final sec = ms ~/ 1000;
    if (sec < 60) return '${sec}s';
    return '${sec ~/ 60}m ${sec % 60}s';
  }

  @override
  Widget build(BuildContext context) {
    final palette = _palette;
    final running = _items?.where((i) => i['status'] == 'running').length ?? 0;
    final pending = _items?.where((i) => i['status'] == 'pending').length ?? 0;

    return Scaffold(
      backgroundColor: palette.backgroundBase,
      appBar: AppBar(
        backgroundColor: palette.backgroundBase,
        foregroundColor: palette.textStrong,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Queue Monitor'),
            if (!_loading && _filter == 'active')
              Text(
                '$running running · $pending pending',
                style: TextStyle(fontSize: 11, color: palette.textWeak),
              ),
          ],
        ),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load, tooltip: 'Refresh'),
        ],
      ),
      body: Column(
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: _filters.map((f) => Padding(
                padding: const EdgeInsets.only(right: 8),
                child: FilterChip(
                  label: Text(f, style: const TextStyle(fontSize: 12)),
                  selected: _filter == f,
                  onSelected: (_) {
                    setState(() { _filter = f; _loading = true; });
                    _load();
                  },
                ),
              )).toList(),
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : (_items == null || _items!.isEmpty)
                    ? Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.check_circle_outline, size: 48, color: Colors.green.withOpacity(0.5)),
                            const SizedBox(height: 12),
                            Text('Queue is empty', style: TextStyle(color: palette.textWeak)),
                          ],
                        ),
                      )
                    : RefreshIndicator(
                        onRefresh: _load,
                        child: ListView.builder(
                          padding: const EdgeInsets.all(12),
                          itemCount: _items!.length,
                          itemBuilder: (_, i) => _buildItem(_items![i], palette),
                        ),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildItem(Map<String, dynamic> item, Oc2Palette palette) {
    final id = item['id'] as String? ?? '';
    final activity = item['activityType'] as String? ?? item['activity_type'] as String? ?? '-';
    final status = item['status'] as String? ?? 'pending';
    final priority = item['priority'] as int? ?? 5;
    final createdAt = item['createdAt'] ?? item['created_at'];
    final startedAt = item['startedAt'] ?? item['started_at'];
    final completedAt = item['completedAt'] ?? item['completed_at'];
    final dur = item['durationMs'] ?? item['duration_ms'];
    final errorMsg = item['errorMessage'] as String? ?? item['error_message'];
    final triggeredBy = item['triggeredBy'] as String? ?? item['triggered_by'];
    final outputRaw = item['outputJson'] as String? ?? item['output_json'];
    final dependsOn = item['dependsOn'] as String? ?? item['depends_on'];

    final color = _statusColor(status);
    final isRunning = status == 'running';
    final isPending = status == 'pending';

    String? summary;
    if (outputRaw != null && outputRaw.isNotEmpty) {
      try {
        final m = Map<String, dynamic>.from(outputRaw as dynamic);
        summary = m['summary'] as String?;
      } catch (_) {}
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: BorderSide(color: color.withOpacity(isRunning ? 0.5 : 0.2)),
      ),
      child: ExpansionTile(
        leading: isRunning
            ? SizedBox(
                width: 20, height: 20,
                child: CircularProgressIndicator(strokeWidth: 2, color: color),
              )
            : Icon(_statusIcon(status), color: color, size: 20),
        title: Row(children: [
          Expanded(
            child: Text(
              activity.replaceAll('-', ' ').replaceAll('_', ' '),
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
            ),
          ),
          _pill(status, color),
          const SizedBox(width: 6),
          if (priority != 5)
            _pill('p$priority', Colors.grey),
        ]),
        subtitle: Text(
          _ago(isRunning ? startedAt : createdAt),
          style: TextStyle(fontSize: 11, color: palette.textWeak),
        ),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (id.isNotEmpty)
                  Text('ID: $id', style: TextStyle(fontSize: 10, color: palette.textWeak, fontFamily: 'monospace')),
                if (createdAt != null)
                  Text('Created: ${_ago(createdAt)}', style: TextStyle(fontSize: 11, color: palette.textWeak)),
                if (startedAt != null)
                  Text('Started: ${_ago(startedAt)}', style: TextStyle(fontSize: 11, color: palette.textWeak)),
                if (completedAt != null)
                  Text('Completed: ${_ago(completedAt)}  ·  ${_duration(dur)}', style: TextStyle(fontSize: 11, color: palette.textWeak)),
                if (triggeredBy != null) ...[
                  const SizedBox(height: 4),
                  Text('Triggered by: $triggeredBy', style: TextStyle(fontSize: 11, color: palette.textWeak)),
                ],
                if (dependsOn != null) ...[
                  const SizedBox(height: 4),
                  Text('Depends on: $dependsOn', style: TextStyle(fontSize: 10, color: palette.textWeak, fontFamily: 'monospace')),
                ],
                if (summary != null) ...[
                  const SizedBox(height: 8),
                  Text(summary, style: const TextStyle(fontSize: 12)),
                ],
                if (errorMsg != null) ...[
                  const SizedBox(height: 8),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Colors.red.withOpacity(0.06),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.red.withOpacity(0.3)),
                    ),
                    child: SelectableText(
                      errorMsg,
                      style: const TextStyle(fontSize: 11, fontFamily: 'monospace', color: Colors.red, height: 1.4),
                    ),
                  ),
                ],
                if (isPending) ...[
                  const SizedBox(height: 10),
                  OutlinedButton.icon(
                    onPressed: () => _cancelItem(id),
                    icon: const Icon(Icons.cancel_outlined, size: 16, color: Colors.red),
                    label: const Text('Cancel', style: TextStyle(color: Colors.red)),
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: Colors.red),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _pill(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withOpacity(0.4)),
      ),
      child: Text(label, style: TextStyle(fontSize: 10, color: color, fontWeight: FontWeight.w600)),
    );
  }
}
