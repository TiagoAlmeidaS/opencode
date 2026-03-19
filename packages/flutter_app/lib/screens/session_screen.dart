import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/models.dart';
import '../state/app_state.dart';
import '../theme/button_style.dart';
import '../theme/oc2_colors.dart';
import '../widgets/opencode_button.dart';
import '../widgets/session_pending_dialogs.dart';
import 'files_screen.dart';
import 'terminal_screen.dart';

class SessionScreen extends StatefulWidget {
  const SessionScreen({super.key, required this.directory, required this.sessionID});

  final String directory;
  final String sessionID;

  @override
  State<SessionScreen> createState() => _SessionScreenState();
}

class _SessionScreenState extends State<SessionScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _promptController = TextEditingController();
  final _scrollController = ScrollController();
  List<Message> _messages = [];
  bool _loading = true;
  bool _sending = false;
  StreamSubscription<({String dir, String sid})>? _sub;
  StreamSubscription<String>? _att;
  Timer? _poll;
  bool _pendingBusy = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadMessages();
    WidgetsBinding.instance.addPostFrameCallback((_) => _wire());
  }

  void _wire() {
    if (!mounted) return;
    final state = context.read<AppState>();
    _sub = state.chatReload.listen((k) {
      if (k.dir == widget.directory && k.sid == widget.sessionID && mounted) {
        _loadMessages();
      }
    });
    _att = state.sessionAttention.listen((sid) {
      if (sid == widget.sessionID && mounted) _pending();
    });
    _poll = Timer.periodic(const Duration(seconds: 3), (_) {
      if (mounted) _pending();
    });
  }

  Future<void> _pending() async {
    if (_pendingBusy || !mounted) return;
    final state = context.read<AppState>();
    final c = state.client;
    if (c == null) return;
    _pendingBusy = true;
    try {
      await SessionPendingDialogs.pollAndShow(
        context,
        client: c,
        directory: widget.directory,
        sessionID: widget.sessionID,
        onAfter: () {
          if (mounted) _loadMessages();
        },
      );
    } finally {
      _pendingBusy = false;
    }
  }

  @override
  void dispose() {
    _sub?.cancel();
    _att?.cancel();
    _poll?.cancel();
    _tabController.dispose();
    _promptController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _loadMessages() async {
    final state = context.read<AppState>();
    final client = state.client;
    if (client == null) return;

    final items = await client.sessionMessages(widget.directory, widget.sessionID, limit: 100);
    if (!mounted) return;

    setState(() {
      _loading = false;
      if (items != null) {
        _messages = items
            .map((e) {
              final info = e['info'] as Map<String, dynamic>?;
              final parts = (e['parts'] as List<dynamic>?)?.map((p) => Part.fromJson(Map<String, dynamic>.from(p as Map))).toList();
              return info != null ? Message.fromJson({...info, 'parts': parts}) : null;
            })
            .whereType<Message>()
            .toList();
      }
    });
  }

  Future<void> _sendPrompt() async {
    final text = _promptController.text.trim();
    if (text.isEmpty) return;

    final state = context.read<AppState>();
    final client = state.client;
    if (client == null) return;

    setState(() => _sending = true);
    _promptController.clear();

    await client.sessionPrompt(widget.directory, widget.sessionID, text);
    if (!mounted) return;

    setState(() => _sending = false);
    await _loadMessages();
    await _pending();
  }

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).brightness == Brightness.dark ? Oc2Colors.dark : Oc2Colors.light;

    return Column(
      children: [
        TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'Chat', icon: Icon(Icons.chat)),
            Tab(text: 'Files', icon: Icon(Icons.folder_open)),
            Tab(text: 'Terminal', icon: Icon(Icons.terminal)),
          ],
        ),
        Expanded(
          child: TabBarView(
            controller: _tabController,
            children: [
              _buildChat(context, palette),
              FilesScreen(directory: widget.directory),
              TerminalScreen(directory: widget.directory, sessionID: widget.sessionID),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildChat(BuildContext context, Oc2Palette palette) {
    return Column(
      children: [
        _buildChatToolbar(palette),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : ListView.builder(
                  controller: _scrollController,
                  padding: const EdgeInsets.all(24),
                  itemCount: _messages.length,
                  itemBuilder: (_, i) {
                    final m = _messages[i];
                    return _MessageBubble(
                      role: m.role ?? 'user',
                      text: m.parts?.map((p) => p.text ?? '').join() ?? '',
                    );
                  },
                ),
        ),
        _buildPromptInput(palette),
      ],
    );
  }

  Widget _buildChatToolbar(Oc2Palette palette) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: palette.backgroundWeak,
        border: Border(bottom: BorderSide(color: palette.borderWeak)),
      ),
      child: Row(
        children: [
          OpenCodeButton(
            onPressed: () async {
              final state = context.read<AppState>();
              final client = state.client;
              if (client == null) return;
              await client.sessionAbort(widget.directory, widget.sessionID);
              if (mounted) _loadMessages();
            },
            variant: OpenCodeButtonVariant.secondary,
            size: OpenCodeButtonSize.small,
            icon: Icons.stop,
            child: const Text('Abort'),
          ),
          const SizedBox(width: 8),
          OpenCodeButton(
            onPressed: () async {
              final last = _messages.isNotEmpty ? _messages.last : null;
              if (last == null) return;
              final state = context.read<AppState>();
              final client = state.client;
              if (client == null) return;
              final s = await client.sessionFork(widget.directory, widget.sessionID, last.id);
              if (s != null && mounted) {
                // Navigate would need to be handled by parent - for now just reload
                _loadMessages();
              }
            },
            variant: OpenCodeButtonVariant.secondary,
            size: OpenCodeButtonSize.small,
            icon: Icons.call_split,
            child: const Text('Fork'),
          ),
        ],
      ),
    );
  }

  Widget _buildPromptInput(Oc2Palette palette) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: palette.backgroundStrong,
        border: Border(top: BorderSide(color: palette.borderWeak)),
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _promptController,
              decoration: const InputDecoration(
                hintText: 'Type a message...',
                border: OutlineInputBorder(),
              ),
              maxLines: 3,
              minLines: 1,
              onSubmitted: (_) => _sendPrompt(),
            ),
          ),
          const SizedBox(width: 12),
          OpenCodeButton(
            onPressed: _sending ? null : _sendPrompt,
            variant: OpenCodeButtonVariant.primary,
            icon: Icons.send,
            child: const Text('Send'),
          ),
        ],
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.role, required this.text});

  final String role;
  final String text;

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).brightness == Brightness.dark ? Oc2Colors.dark : Oc2Colors.light;
    final isUser = role == 'user';

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Align(
        alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 400),
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: isUser ? palette.surfaceInteractive : palette.backgroundWeak,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              text,
              style: TextStyle(color: palette.textStrong, fontSize: 14),
            ),
          ),
        ),
      ),
    );
  }
}
