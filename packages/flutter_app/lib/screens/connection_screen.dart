import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../theme/button_style.dart';
import '../theme/oc2_colors.dart';
import '../widgets/opencode_button.dart';

class ConnectionScreen extends StatefulWidget {
  const ConnectionScreen({super.key});

  @override
  State<ConnectionScreen> createState() => _ConnectionScreenState();
}

class _ConnectionScreenState extends State<ConnectionScreen> {
  final _urlController = TextEditingController(text: 'http://100.98.213.86:4096');
  final _passwordController = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _urlController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _connect() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    final url = _urlController.text.trim();
    if (url.isEmpty) {
      setState(() {
        _loading = false;
        _error = 'URL is required';
      });
      return;
    }

    final withProtocol = url.startsWith('http') ? url : 'http://$url';
    final cfg = ServerConfig(
      url: withProtocol.replaceAll(RegExp(r'/+$'), ''),
      username: 'opencode',
      password: _passwordController.text.isEmpty ? null : _passwordController.text,
    );

    final state = context.read<AppState>();
    state.addServer(cfg);
    state.setActive(cfg.key);

    final ok = await state.connect();
    setState(() => _loading = false);

    if (!ok) {
      setState(() => _error = 'Connection failed');
      return;
    }

    if (mounted) {
      Navigator.of(context).pushReplacementNamed('/main');
    }
  }

  void _selectServer(ServerConfig cfg) async {
    final state = context.read<AppState>();
    state.setActive(cfg.key);
    setState(() => _loading = true);
    final ok = await state.connect();
    setState(() => _loading = false);
    if (ok && mounted) {
      Navigator.of(context).pushReplacementNamed('/main');
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).brightness == Brightness.dark ? Oc2Colors.dark : Oc2Colors.light;
    final state = context.watch<AppState>();

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 400),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'OpenCode',
                    style: Theme.of(context).textTheme.headlineLarge,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Connect to OpenCode Server',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: palette.textWeak),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 32),
                  TextField(
                    controller: _urlController,
                    decoration: const InputDecoration(
                      labelText: 'Server URL',
                      hintText: 'http://100.98.213.86:4096',
                    ),
                    keyboardType: TextInputType.url,
                    autocorrect: false,
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _passwordController,
                    decoration: const InputDecoration(
                      labelText: 'Password (optional)',
                      hintText: 'OPENCODE_SERVER_PASSWORD',
                    ),
                    obscureText: true,
                    autocorrect: false,
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(
                      _error!,
                      style: TextStyle(color: palette.surfaceCriticalStrong),
                    ),
                  ],
                  const SizedBox(height: 24),
                  OpenCodeButton(
                    onPressed: _loading ? null : _connect,
                    variant: OpenCodeButtonVariant.primary,
                    size: OpenCodeButtonSize.large,
                    child: _loading ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Connect'),
                  ),
                  if (state.servers.isNotEmpty) ...[
                    const SizedBox(height: 32),
                    Text('Saved servers', style: Theme.of(context).textTheme.labelMedium),
                    const SizedBox(height: 8),
                    ...state.servers.map(
                      (cfg) => Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: OpenCodeButton(
                          onPressed: () => _selectServer(cfg),
                          variant: OpenCodeButtonVariant.secondary,
                          child: Text(cfg.displayName ?? cfg.url.replaceFirst(RegExp(r'^https?://'), '')),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
