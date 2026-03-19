import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/models.dart';
import '../services/pty_websocket.dart';
import '../state/app_state.dart';
import '../theme/oc2_colors.dart';

class TerminalScreen extends StatefulWidget {
  const TerminalScreen({
    super.key,
    required this.directory,
    required this.sessionID,
  });

  final String directory;
  final String sessionID;

  @override
  State<TerminalScreen> createState() => _TerminalScreenState();
}

class _TerminalScreenState extends State<TerminalScreen> {
  final _outputController = ScrollController();
  final List<String> _lines = [];
  PtyWebSocket? _ws;
  bool _connecting = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _connect();
  }

  @override
  void dispose() {
    _outputController.dispose();
    _ws?.close();
    super.dispose();
  }

  Future<void> _connect() async {
    final state = context.read<AppState>();
    final client = state.client;
    if (client == null) return;

    final ptys = await client.ptyList(widget.directory);
    PtyInfo? existing;
    if (ptys != null) {
      try {
        existing = ptys.firstWhere((p) => p.sessionID == widget.sessionID);
      } catch (_) {}
    }

    String ptyID;
    if (existing != null) {
      ptyID = existing.id;
    } else {
      final created = await client.ptyCreate(widget.directory, sessionID: widget.sessionID);
      if (created == null) {
        setState(() {
          _connecting = false;
          _error = 'Failed to create terminal';
        });
        return;
      }
      ptyID = created.id;
    }

    ServerConfig cfg = ServerConfig(url: state.activeKey ?? '');
    for (final s in state.servers) {
      if (s.key == state.activeKey) {
        cfg = s;
        break;
      }
    }
    final ws = PtyWebSocket(
      client.ptyConnectUrl(ptyID),
      username: cfg.username,
      password: cfg.password,
    );

    await ws.connect();
    if (!mounted) return;

    setState(() => _connecting = false);
    _ws = ws;

    ws.stream.listen(
      (data) {
        if (mounted) {
          setState(() => _lines.add(data));
          WidgetsBinding.instance.addPostFrameCallback((_) {
            _outputController.jumpTo(_outputController.position.maxScrollExtent);
          });
        }
      },
      onError: (e) {
        if (mounted) setState(() => _error = e.toString());
      },
    );
  }

  void _sendKey(String key) {
    _ws?.send(key);
  }

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).brightness == Brightness.dark ? Oc2Colors.dark : Oc2Colors.light;

    if (_connecting) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.error_outline, size: 48, color: palette.surfaceCriticalStrong),
            const SizedBox(height: 16),
            Text(_error!, style: TextStyle(color: palette.surfaceCriticalStrong)),
          ],
        ),
      );
    }

    return Column(
      children: [
        Expanded(
          child: Container(
            color: palette.surfaceFloatBase,
            child: ListView.builder(
              controller: _outputController,
              padding: const EdgeInsets.all(8),
              itemCount: _lines.length,
              itemBuilder: (_, i) => Text(
                _lines[i],
                style: TextStyle(
                  fontFamily: 'monospace',
                  fontSize: 13,
                  color: palette.textStrong,
                ),
              ),
            ),
          ),
        ),
        Container(
          height: 48,
          color: palette.backgroundWeak,
          child: Row(
            children: [
              IconButton(
                icon: const Icon(Icons.keyboard_return),
                onPressed: () => _sendKey('\r'),
                tooltip: 'Enter',
              ),
              IconButton(
                icon: const Icon(Icons.cleaning_services),
                onPressed: () => setState(() => _lines.clear()),
                tooltip: 'Clear',
              ),
            ],
          ),
        ),
      ],
    );
  }
}
