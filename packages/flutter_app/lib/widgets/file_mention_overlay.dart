import 'package:flutter/material.dart';

import '../theme/oc2_colors.dart';

/// Inline suggestion list shown above the input when the user types `@query`.
class FileMentionOverlay extends StatelessWidget {
  const FileMentionOverlay({
    super.key,
    required this.suggestions,
    required this.onSelect,
    required this.palette,
  });

  final List<String> suggestions;
  final void Function(String path) onSelect;
  final Oc2Palette palette;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(maxHeight: 200),
      decoration: BoxDecoration(
        color: palette.backgroundBase,
        border: Border(
          top: BorderSide(color: palette.borderWeak),
          left: BorderSide(color: palette.borderWeak),
          right: BorderSide(color: palette.borderWeak),
        ),
      ),
      child: ListView.builder(
        shrinkWrap: true,
        padding: EdgeInsets.zero,
        itemCount: suggestions.length,
        itemBuilder: (_, i) {
          final path = suggestions[i];
          final name = path.split('/').last;
          return ListTile(
            dense: true,
            leading: Icon(Icons.insert_drive_file_outlined, size: 16, color: palette.iconBase),
            title: Text(name, style: TextStyle(fontSize: 13, color: palette.textStrong)),
            subtitle: Text(
              path,
              style: TextStyle(fontSize: 11, color: palette.textWeak),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            onTap: () => onSelect(path),
          );
        },
      ),
    );
  }
}
