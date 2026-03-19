import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/models.dart';
import '../state/app_state.dart';
import '../theme/oc2_colors.dart';

/// Files tab: search, list, and view file content.
class FilesScreen extends StatefulWidget {
  const FilesScreen({super.key, required this.directory});

  final String directory;

  @override
  State<FilesScreen> createState() => _FilesScreenState();
}

class _FilesScreenState extends State<FilesScreen> {
  List<FileNode>? _nodes;
  List<String>? _searchResults;
  String? _content;
  String _currentPath = '';
  bool _loading = false;
  bool _searchMode = false;

  @override
  void initState() {
    super.initState();
    _loadList('.');
  }

  Future<void> _loadList(String path) async {
    final state = context.read<AppState>();
    final client = state.client;
    if (client == null) return;

    setState(() {
      _loading = true;
      _currentPath = path;
      _searchMode = false;
    });

    final list = await client.fileList(widget.directory, path: path);
    if (!mounted) return;

    setState(() {
      _nodes = list;
      _loading = false;
    });
  }

  Future<void> _search(String query) async {
    if (query.isEmpty) {
      setState(() {
        _searchResults = null;
        _searchMode = false;
      });
      return;
    }

    final state = context.read<AppState>();
    final client = state.client;
    if (client == null) return;

    setState(() {
      _loading = true;
      _searchMode = true;
    });

    final list = await client.fileFind(widget.directory, query: query, limit: 50);
    if (!mounted) return;

    setState(() {
      _searchResults = list;
      _loading = false;
    });
  }

  Future<void> _openFile(String path) async {
    final state = context.read<AppState>();
    final client = state.client;
    if (client == null) return;

    setState(() => _loading = true);

    final fc = await client.fileRead(widget.directory, path: path);
    if (!mounted) return;

    setState(() {
      _content = fc?.content;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).brightness == Brightness.dark ? Oc2Colors.dark : Oc2Colors.light;

    return Column(
      children: [
        _buildToolbar(palette),
        Expanded(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(
                width: 260,
                child: _buildList(palette),
              ),
              Container(
                width: 1,
                color: palette.borderWeak,
              ),
              Expanded(child: _buildContent(palette)),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildToolbar(Oc2Palette palette) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: palette.backgroundWeak,
        border: Border(bottom: BorderSide(color: palette.borderWeak)),
      ),
      child: Row(
        children: [
          Icon(Icons.folder_open, size: 20, color: palette.iconBase),
          const SizedBox(width: 8),
          Expanded(
            child: TextField(
              decoration: InputDecoration(
                hintText: 'Search files…',
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
              ),
              onSubmitted: _search,
              onChanged: (_) {},
            ),
          ),
          const SizedBox(width: 8),
          if (_currentPath.isNotEmpty && _currentPath != '.')
            TextButton.icon(
              onPressed: () => _loadList(_parentPath(_currentPath)),
              icon: const Icon(Icons.arrow_upward, size: 18),
              label: const Text('Up'),
            ),
        ],
      ),
    );
  }

  String _parentPath(String p) {
    if (p.isEmpty || p == '.') return '.';
    final parts = p.split(RegExp(r'[/\\]'));
    if (parts.length <= 1) return '.';
    parts.removeLast();
    return parts.isEmpty ? '.' : parts.join('/');
  }

  Widget _buildList(Oc2Palette palette) {
    if (_loading && _nodes == null && _searchResults == null) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_searchMode && _searchResults != null) {
      if (_searchResults!.isEmpty) {
        return Center(
          child: Text('No matches', style: TextStyle(color: palette.textWeak)),
        );
      }
      return ListView.builder(
        padding: const EdgeInsets.all(8),
        itemCount: _searchResults!.length,
        itemBuilder: (_, i) {
          final path = _searchResults![i];
          return ListTile(
            dense: true,
            leading: Icon(Icons.insert_drive_file, size: 20, color: palette.iconBase),
            title: Text(path, style: const TextStyle(fontSize: 13), overflow: TextOverflow.ellipsis),
            onTap: () => _openFile(path),
          );
        },
      );
    }

    if (_nodes == null || _nodes!.isEmpty) {
      return Center(
        child: Text(
          _currentPath.isEmpty ? 'Select a folder' : 'Empty',
          style: TextStyle(color: palette.textWeak),
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(8),
      itemCount: _nodes!.length,
      itemBuilder: (_, i) {
        final n = _nodes![i];
        final isDir = n.type == 'directory';
        return ListTile(
          dense: true,
          leading: Icon(
            isDir ? Icons.folder : Icons.insert_drive_file,
            size: 20,
            color: palette.iconBase,
          ),
          title: Text(n.name, style: const TextStyle(fontSize: 13), overflow: TextOverflow.ellipsis),
          onTap: () {
            if (isDir) {
              _loadList(n.path);
            } else {
              _openFile(n.path);
            }
          },
        );
      },
    );
  }

  Widget _buildContent(Oc2Palette palette) {
    if (_loading && _content == null) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_content == null) {
      return Center(
        child: Text(
          'Select a file',
          style: TextStyle(color: palette.textWeak),
        ),
      );
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: SelectableText(
        _content!,
        style: const TextStyle(fontFamily: 'monospace', fontSize: 13),
      ),
    );
  }
}
