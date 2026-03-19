import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/models.dart';
import '../state/app_state.dart';
import '../theme/button_style.dart';
import '../theme/oc2_colors.dart';
import '../widgets/opencode_button.dart';

/// Configure default LLM on the server: global (`PATCH /global/config`) and per-project (`PATCH /config`).
class LlmSettingsScreen extends StatefulWidget {
  const LlmSettingsScreen({super.key, this.catalogDirectory});

  /// Used to list models and edit project config; may differ from current UI selection.
  final String? catalogDirectory;

  @override
  State<LlmSettingsScreen> createState() => _LlmSettingsScreenState();
}

class _LlmSettingsScreenState extends State<LlmSettingsScreen> {
  final _globalModel = TextEditingController();
  final _globalSmall = TextEditingController();
  List<LlmModelChoice> _choices = [];
  String? _projectModel;
  bool _busy = true;
  String? _err;

  Oc2Palette get _pal =>
      Theme.of(context).brightness == Brightness.dark ? Oc2Colors.dark : Oc2Colors.light;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  @override
  void dispose() {
    _globalModel.dispose();
    _globalSmall.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    final c = context.read<AppState>().client;
    if (c == null) {
      setState(() {
        _busy = false;
        _err = 'Not connected';
      });
      return;
    }
    setState(() {
      _busy = true;
      _err = null;
    });
    final g = await c.globalConfigGet();
    final dir = widget.catalogDirectory;
    Map<String, dynamic>? proj;
    Map<String, dynamic>? prov;
    if (dir != null) {
      proj = await c.configGet(dir);
      prov = await c.configProviders(dir);
    }
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (g != null) {
        _globalModel.text = g['model']?.toString() ?? '';
        _globalSmall.text = g['small_model']?.toString() ?? '';
      }
      if (prov != null) _choices = LlmModelChoice.fromProvidersBody(prov);
      _projectModel = proj?['model']?.toString();
      if (_projectModel != null &&
          _projectModel!.isNotEmpty &&
          !_choices.any((x) => x.id == _projectModel)) {
        _choices = [
          ..._choices,
          LlmModelChoice(id: _projectModel!, label: '$_projectModel (current)'),
        ]..sort((a, b) => a.label.compareTo(b.label));
      }
    });
  }

  Future<void> _saveGlobal() async {
    final c = context.read<AppState>().client;
    if (c == null) return;
    final patch = <String, dynamic>{};
    final m = _globalModel.text.trim();
    final s = _globalSmall.text.trim();
    if (m.isNotEmpty) patch['model'] = m;
    if (s.isNotEmpty) patch['small_model'] = s;
    if (patch.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter at least one model id')));
      return;
    }
    final next = await c.globalConfigPatch(patch);
    if (!mounted) return;
    if (next == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Global config update failed')));
      return;
    }
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Global default saved')));
  }

  Future<void> _saveProject() async {
    final dir = widget.catalogDirectory;
    final c = context.read<AppState>().client;
    if (dir == null || c == null) return;
    final mid = _projectModel?.trim();
    if (mid == null || mid.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Pick a model')));
      return;
    }
    final next = await c.configPatch(dir, {'model': mid});
    if (!mounted) return;
    if (next == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Project config update failed')));
      return;
    }
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Project model saved')));
  }

  @override
  Widget build(BuildContext context) {
    final dir = widget.catalogDirectory;
    return Scaffold(
      appBar: AppBar(
        title: const Text('LLM & provider'),
        backgroundColor: _pal.backgroundBase,
        foregroundColor: _pal.textStrong,
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _busy ? null : _reload),
        ],
      ),
      backgroundColor: _pal.backgroundWeak,
      body: _busy
          ? Center(child: CircularProgressIndicator(color: _pal.iconBase))
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (_err != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(_err!, style: TextStyle(color: _pal.surfaceCriticalStrong)),
                  ),
                Text(
                  'Model ids use provider/model (e.g. anthropic/claude-sonnet-4-20250514). '
                  'API keys and OAuth are configured on the machine running OpenCode Server.',
                  style: TextStyle(fontSize: 13, color: _pal.textWeak),
                ),
                const SizedBox(height: 20),
                Text('Global default', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                TextField(
                  controller: _globalModel,
                  decoration: const InputDecoration(
                    labelText: 'model',
                    border: OutlineInputBorder(),
                    hintText: 'provider/model',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _globalSmall,
                  decoration: const InputDecoration(
                    labelText: 'small_model (optional)',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                OpenCodeButton(
                  onPressed: _saveGlobal,
                  variant: OpenCodeButtonVariant.primary,
                  child: const Text('Save global'),
                ),
                if (dir != null) ...[
                  const SizedBox(height: 28),
                  Text('This project', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 8),
                  Text(
                    dir,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 12, color: _pal.textWeak),
                  ),
                  const SizedBox(height: 12),
                  if (_choices.isEmpty)
                    Text('No providers returned for this workspace.', style: TextStyle(color: _pal.textWeak))
                  else ...[
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Text('Model', style: TextStyle(fontSize: 12, color: _pal.textWeak)),
                    ),
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      decoration: BoxDecoration(
                        border: Border.all(color: _pal.borderWeak),
                        borderRadius: BorderRadius.circular(4),
                        color: _pal.backgroundBase,
                      ),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<String>(
                          isExpanded: true,
                          hint: const Text('Select model'),
                          value: _projectModel != null && _choices.any((x) => x.id == _projectModel)
                              ? _projectModel
                              : null,
                          items: _choices
                              .map(
                                (x) => DropdownMenuItem(
                                  value: x.id,
                                  child: Text(x.label, overflow: TextOverflow.ellipsis),
                                ),
                              )
                              .toList(),
                          onChanged: (v) => setState(() => _projectModel = v),
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 12),
                  OpenCodeButton(
                    onPressed: _choices.isEmpty ? null : _saveProject,
                    variant: OpenCodeButtonVariant.secondary,
                    child: const Text('Save for this project only'),
                  ),
                ] else
                  Padding(
                    padding: const EdgeInsets.only(top: 24),
                    child: Text(
                      'Open or select a project to pick a model from the server provider list.',
                      style: TextStyle(color: _pal.textWeak),
                    ),
                  ),
              ],
            ),
    );
  }
}
