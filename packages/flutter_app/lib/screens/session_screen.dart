import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/models.dart';
import '../state/app_state.dart';
import '../theme/button_style.dart';
import '../theme/oc2_colors.dart';
import '../widgets/file_mention_overlay.dart';
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

  // Feature 1: per-session model selection
  String? _selectedModelId;
  List<LlmModelChoice> _modelChoices = [];
  bool _modelChoicesLoaded = false;

  // Feature 2: file attachments
  List<String> _attachedFiles = [];

  // Feature 3: @ mention suggestions
  String? _mentionQuery;
  List<String> _mentionSuggestions = [];
  Timer? _mentionDebounce;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadMessages();
    _promptController.addListener(_onPromptChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _wire();
      // Restore session model override from AppState
      final state = context.read<AppState>();
      final saved = state.getSessionModel(widget.sessionID);
      if (saved != null) setState(() => _selectedModelId = saved);
    });
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
    _mentionDebounce?.cancel();
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

  // ── Feature 1: Model selection ──────────────────────────────────────────────

  Future<void> _loadModelChoices() async {
    _modelChoicesLoaded = true;
    final state = context.read<AppState>();
    final client = state.client;
    if (client == null) return;
    final prov = await client.configProviders(widget.directory);
    if (!mounted) return;
    if (prov != null) setState(() => _modelChoices = LlmModelChoice.fromProvidersBody(prov));
  }

  Future<void> _showModelPicker() async {
    if (!_modelChoicesLoaded) await _loadModelChoices();
    if (!mounted) return;

    final palette = Theme.of(context).brightness == Brightness.dark ? Oc2Colors.dark : Oc2Colors.light;

    showModalBottomSheet<void>(
      context: context,
      builder: (ctx) {
        return Column(
          children: [
            ListTile(
              title: const Text('Select model for this session'),
              trailing: TextButton(
                onPressed: () {
                  setState(() => _selectedModelId = null);
                  context.read<AppState>().setSessionModel(widget.sessionID, null);
                  Navigator.pop(ctx);
                },
                child: const Text('Use default'),
              ),
            ),
            const Divider(height: 1),
            if (_modelChoices.isEmpty)
              Padding(
                padding: const EdgeInsets.all(24),
                child: Text('No models available.', style: TextStyle(color: palette.textWeak)),
              )
            else
              Expanded(
                child: ListView.builder(
                  itemCount: _modelChoices.length,
                  itemBuilder: (_, i) {
                    final choice = _modelChoices[i];
                    return ListTile(
                      title: Text(choice.label),
                      selected: _selectedModelId == choice.id,
                      selectedColor: palette.textInteractive,
                      onTap: () {
                        setState(() => _selectedModelId = choice.id);
                        context.read<AppState>().setSessionModel(widget.sessionID, choice.id);
                        Navigator.pop(ctx);
                      },
                    );
                  },
                ),
              ),
          ],
        );
      },
    );
  }

  // ── Feature 2: File attachment ───────────────────────────────────────────────

  Future<void> _showFilePicker() async {
    final state = context.read<AppState>();
    final client = state.client;
    if (client == null) return;

    final palette = Theme.of(context).brightness == Brightness.dark ? Oc2Colors.dark : Oc2Colors.light;

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        List<String> results = [];
        return StatefulBuilder(
          builder: (ctx, sheetSetState) {
            return Padding(
              padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: TextField(
                      autofocus: true,
                      decoration: const InputDecoration(
                        hintText: 'Search files...',
                        prefixIcon: Icon(Icons.search),
                        border: OutlineInputBorder(),
                      ),
                      onChanged: (v) async {
                        if (v.isEmpty) {
                          sheetSetState(() => results = []);
                          return;
                        }
                        final r = await client.fileFind(widget.directory, query: v, limit: 20);
                        if (r.paths != null) sheetSetState(() => results = r.paths!);
                      },
                    ),
                  ),
                  SizedBox(
                    height: 300,
                    child: results.isEmpty
                        ? Center(child: Text('Type to search files', style: TextStyle(color: palette.textWeak)))
                        : ListView.builder(
                            itemCount: results.length,
                            itemBuilder: (_, i) {
                              final path = results[i];
                              final name = path.split('/').last;
                              return ListTile(
                                leading: const Icon(Icons.insert_drive_file_outlined),
                                title: Text(name),
                                subtitle: Text(path, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12)),
                                onTap: () {
                                  if (!_attachedFiles.contains(path)) {
                                    setState(() => _attachedFiles = [..._attachedFiles, path]);
                                  }
                                  Navigator.pop(ctx);
                                },
                              );
                            },
                          ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  // ── Feature 3: @ mention ─────────────────────────────────────────────────────

  void _onPromptChanged() {
    final text = _promptController.text;
    final cursor = _promptController.selection.baseOffset;
    if (cursor < 0) {
      _dismissMentions();
      return;
    }

    final before = text.substring(0, cursor);
    final atIdx = before.lastIndexOf('@');
    if (atIdx < 0) {
      _dismissMentions();
      return;
    }

    final query = before.substring(atIdx + 1);
    if (query.contains(' ') || query.contains('\n')) {
      _dismissMentions();
      return;
    }

    if (query == _mentionQuery) return;
    setState(() => _mentionQuery = query);

    _mentionDebounce?.cancel();
    _mentionDebounce = Timer(const Duration(milliseconds: 300), () => _searchMentions(query));
  }

  void _dismissMentions() {
    if (_mentionQuery == null && _mentionSuggestions.isEmpty) return;
    setState(() {
      _mentionQuery = null;
      _mentionSuggestions = [];
    });
  }

  Future<void> _searchMentions(String query) async {
    final state = context.read<AppState>();
    final client = state.client;
    if (client == null) return;

    if (query.isEmpty) {
      if (mounted) setState(() => _mentionSuggestions = []);
      return;
    }

    final r = await client.fileFind(widget.directory, query: query, limit: 10);
    if (!mounted || _mentionQuery != query) return;
    setState(() => _mentionSuggestions = r.paths ?? []);
  }

  void _selectMention(String path) {
    final text = _promptController.text;
    final cursor = _promptController.selection.baseOffset;
    final before = cursor >= 0 ? text.substring(0, cursor) : text;
    final atIdx = before.lastIndexOf('@');
    if (atIdx < 0) return;

    final basename = path.split('/').last;
    final after = cursor >= 0 && cursor < text.length ? text.substring(cursor) : '';
    final newText = '${text.substring(0, atIdx)}@$basename$after';
    final newCursor = atIdx + basename.length + 1;

    _promptController.value = TextEditingValue(
      text: newText,
      selection: TextSelection.collapsed(offset: newCursor),
    );

    setState(() {
      if (!_attachedFiles.contains(path)) _attachedFiles = [..._attachedFiles, path];
      _mentionQuery = null;
      _mentionSuggestions = [];
    });
  }

  // ── Send ─────────────────────────────────────────────────────────────────────

  Future<void> _sendPrompt() async {
    final text = _promptController.text.trim();
    if (text.isEmpty && _attachedFiles.isEmpty) return;

    final state = context.read<AppState>();
    final client = state.client;
    if (client == null) return;

    setState(() => _sending = true);
    _promptController.clear();
    _dismissMentions();

    // Build file parts
    final extraParts = _attachedFiles
        .map((path) => <String, dynamic>{
              'type': 'file',
              'mime': 'text/plain',
              'url': 'file://$path',
              'filename': path.split('/').last,
            })
        .toList();

    // Build model override
    Map<String, String>? model;
    final mid = _selectedModelId;
    if (mid != null) {
      final idx = mid.indexOf('/');
      if (idx > 0) {
        model = {
          'providerID': mid.substring(0, idx),
          'modelID': mid.substring(idx + 1),
        };
      }
    }

    await client.sessionPrompt(
      widget.directory,
      widget.sessionID,
      text,
      model: model,
      extraParts: extraParts.isNotEmpty ? extraParts : null,
    );

    if (!mounted) return;
    setState(() {
      _sending = false;
      _attachedFiles = [];
    });
    await _loadMessages();
    await _pending();
  }

  // ── Build ─────────────────────────────────────────────────────────────────────

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
        if (_mentionSuggestions.isNotEmpty)
          FileMentionOverlay(
            suggestions: _mentionSuggestions,
            onSelect: _selectMention,
            palette: palette,
          ),
        _buildPromptInput(palette),
      ],
    );
  }

  Widget _buildChatToolbar(Oc2Palette palette) {
    return Consumer<AppState>(
      builder: (context, state, _) {
        final branch = state.currentBranch;
        final modelLabel = _selectedModelId != null
            ? _selectedModelId!.substring(_selectedModelId!.indexOf('/') + 1)
            : 'Model';

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
                  final c = context.read<AppState>().client;
                  if (c == null) return;
                  await c.sessionAbort(widget.directory, widget.sessionID);
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
                  final c = context.read<AppState>().client;
                  if (c == null) return;
                  final s = await c.sessionFork(widget.directory, widget.sessionID, last.id);
                  if (s != null && mounted) _loadMessages();
                },
                variant: OpenCodeButtonVariant.secondary,
                size: OpenCodeButtonSize.small,
                icon: Icons.call_split,
                child: const Text('Fork'),
              ),
              const Spacer(),
              if (branch != null) ...[
                Icon(Icons.account_tree_outlined, size: 14, color: palette.textWeak),
                const SizedBox(width: 4),
                Text(branch, style: TextStyle(fontSize: 12, color: palette.textWeak)),
                const SizedBox(width: 12),
              ],
              GestureDetector(
                onTap: _showModelPicker,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    border: Border.all(color: palette.borderWeak),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.tune, size: 14, color: palette.iconBase),
                      const SizedBox(width: 4),
                      Text(modelLabel, style: TextStyle(fontSize: 12, color: palette.textStrong)),
                      const SizedBox(width: 2),
                      Icon(Icons.arrow_drop_down, size: 16, color: palette.textWeak),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildPromptInput(Oc2Palette palette) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: palette.backgroundStrong,
        border: Border(top: BorderSide(color: palette.borderWeak)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (_attachedFiles.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Wrap(
                spacing: 8,
                runSpacing: 4,
                children: _attachedFiles.map((path) {
                  final name = path.split('/').last;
                  return Chip(
                    label: Text(name, style: const TextStyle(fontSize: 12)),
                    onDeleted: () => setState(() => _attachedFiles = [..._attachedFiles]..remove(path)),
                    deleteIcon: const Icon(Icons.close, size: 14),
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  );
                }).toList(),
              ),
            ),
          Row(
            children: [
              IconButton(
                icon: Icon(Icons.attach_file, color: palette.iconBase),
                onPressed: _showFilePicker,
                tooltip: 'Attach file',
                padding: const EdgeInsets.all(8),
                constraints: const BoxConstraints(),
              ),
              const SizedBox(width: 4),
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
