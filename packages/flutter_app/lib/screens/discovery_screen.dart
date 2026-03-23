import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api/models.dart';
import '../state/app_state.dart';
import '../widgets/opencode_button.dart';

class DiscoveryScreen extends StatefulWidget {
  const DiscoveryScreen({super.key});

  @override
  State<DiscoveryScreen> createState() => _DiscoveryScreenState();
}

class _DiscoveryScreenState extends State<DiscoveryScreen> {
  final _formKey = GlobalKey<FormState>();
  final _ideaController = TextEditingController();
  final _sessionIdController = TextEditingController();

  List<DiscoveryReport> _discoveries = [];
  bool _isLoading = false;
  bool _isCreating = false;
  String? _errorMessage;
  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();
    _loadDiscoveries();
    _startAutoRefresh();
  }

  @override
  void dispose() {
    _ideaController.dispose();
    _sessionIdController.dispose();
    _refreshTimer?.cancel();
    super.dispose();
  }

  void _startAutoRefresh() {
    _refreshTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted) _loadDiscoveries();
    });
  }

  Future<void> _loadDiscoveries() async {
    if (_isLoading) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final state = Provider.of<AppState>(context, listen: false);
      final server = state.server;
      if (server == null) {
        setState(() {
          _isLoading = false;
          _errorMessage = 'No server connected';
        });
        return;
      }

      final discoveries = await server.discovery();
      if (mounted) {
        setState(() {
          _discoveries = discoveries != null
              ? discoveries.map((e) => DiscoveryReport.fromJson(e)).toList()
              : [];
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = e.toString();
        });
      }
    }
  }

  Future<void> _createDiscovery() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isCreating = true;
      _errorMessage = null;
    });

    try {
      final server = Provider.of<AppState>(context, listen: false).server;
      if (server == null) {
        setState(() {
          _isCreating = false;
          _errorMessage = 'No server connected';
        });
        return;
      }

      final discovery = await server.discoveryEnqueue(
        _ideaController.text.trim(),
        sessionId: _sessionIdController.text.trim().isEmpty
            ? null
            : _sessionIdController.text.trim(),
      );

      if (mounted) {
        setState(() {
          _isCreating = false;
        });

        if (discovery != null) {
          // Clear form and refresh list
          _ideaController.clear();
          _sessionIdController.clear();
          _formKey.currentState?.reset();
          await _loadDiscoveries();

          // Show success snackbar
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Discovery created successfully')),
            );
          }
        } else {
          if (mounted) {
            setState(() {
              _errorMessage = 'Failed to create discovery';
            });
          }
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isCreating = false;
          _errorMessage = e.toString();
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Discovery & Idea Validation'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _isLoading ? null : _loadDiscoveries,
            tooltip: 'Refresh discoveries',
          ),
        ],
      ),
      body: Column(
        children: [
          // Create discovery form
          Card(
            margin: const EdgeInsets.all(16),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'Validate New Idea',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _ideaController,
                      decoration: const InputDecoration(
                        labelText: 'Idea Description',
                        hintText: 'Describe your project or venture idea...',
                        border: OutlineInputBorder(),
                      ),
                      maxLines: 4,
                      validator: (value) {
                        if (value == null || value.isEmpty) {
                          return 'Please enter an idea description';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _sessionIdController,
                      decoration: const InputDecoration(
                        labelText: 'Session ID (Optional)',
                        hintText: 'Associate with a specific session',
                        border: OutlineInputBorder(),
                        helperText: 'Leave empty for standalone discovery',
                      ),
                    ),
                    const SizedBox(height: 16),
                    OpenCodeButton(
                      onPressed: _isCreating ? null : _createDiscovery,
                      child: const Text('Validate Idea'),
                    ),
                    if (_errorMessage != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(
                          _errorMessage!,
                          style: const TextStyle(color: Colors.red),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),

          // Discoveries list
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _discoveries.isEmpty
                ? const Center(
                    child: Text(
                      'No discoveries yet. Create your first idea validation above.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.grey),
                    ),
                  )
                : ListView.builder(
                    itemCount: _discoveries.length,
                    itemBuilder: (context, index) {
                      final discovery = _discoveries[index];
                      return DiscoveryCard(discovery: discovery);
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class DiscoveryCard extends StatelessWidget {
  final DiscoveryReport discovery;

  const DiscoveryCard({Key? key, required this.discovery}) : super(key: key);

  String _getStatusText(DiscoveryStatus status) {
    switch (status) {
      case DiscoveryStatus.pending:
        return 'Pending';
      case DiscoveryStatus.completed:
        return 'Completed';
      case DiscoveryStatus.failed:
        return 'Failed';
    }
  }

  Color _getStatusColor(DiscoveryStatus status) {
    switch (status) {
      case DiscoveryStatus.pending:
        return Colors.orange;
      case DiscoveryStatus.completed:
        return Colors.green;
      case DiscoveryStatus.failed:
        return Colors.red;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    discovery.ideaText,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: _getStatusColor(discovery.status).withOpacity(0.2),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    _getStatusText(discovery.status),
                    style: TextStyle(
                      color: _getStatusColor(discovery.status),
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            if (discovery.description != null &&
                discovery.description!.isNotEmpty)
              Text(
                discovery.description!,
                style: const TextStyle(fontSize: 14, color: Colors.grey),
              ),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton.icon(
                  icon: const Icon(Icons.remove_red_eye, size: 16),
                  label: const Text('View Details'),
                  onPressed: () {
                    // TODO: Navigate to discovery detail screen
                  },
                ),
                const SizedBox(width: 8),
                if (discovery.status == DiscoveryStatus.completed &&
                    discovery.reportJson != null &&
                    discovery.reportJson!.isNotEmpty)
                  TextButton.icon(
                    icon: const Icon(Icons.description, size: 16),
                    label: const Text('View Report'),
                    onPressed: () {
                      // TODO: Show report in dialog or new screen
                    },
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
