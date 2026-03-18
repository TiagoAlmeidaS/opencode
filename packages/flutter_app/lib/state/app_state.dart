import 'dart:async';

import 'package:flutter/foundation.dart';

import '../api/models.dart';
import '../api/opencode_client.dart';
import '../services/sse_client.dart';

class ServerConfig {
  ServerConfig({
    required this.url,
    this.displayName,
    this.username,
    this.password,
  });

  final String url;
  final String? displayName;
  final String? username;
  final String? password;

  String get key => url;
}

class AppState extends ChangeNotifier {
  AppState();

  List<ServerConfig> _servers = [];
  String? _activeKey;
  OpenCodeClient? _client;
  SseClient? _sse;
  StreamSubscription<GlobalEvent>? _sseSub;

  List<ServerConfig> get servers => List.unmodifiable(_servers);
  String? get activeKey => _activeKey;
  OpenCodeClient? get client => _client;

  bool _connected = false;
  bool get connected => _connected;

  PathInfo? _path;
  PathInfo? get path => _path;

  List<Project> _projects = [];
  List<Project> get projects => List.unmodifiable(_projects);

  String? _activeDirectory;
  String? get activeDirectory => _activeDirectory;

  List<Session> _sessions = [];
  List<Session> get sessions => List.unmodifiable(_sessions);

  bool _daemonAvailable = false;
  bool get daemonAvailable => _daemonAvailable;

  ServerStatus? _serverStatus;
  ServerStatus? get serverStatus => _serverStatus;

  void addServer(ServerConfig cfg) {
    if (_servers.any((s) => s.key == cfg.key)) return;
    _servers = [..._servers, cfg];
    notifyListeners();
  }

  void removeServer(String key) {
    _servers = _servers.where((s) => s.key != key).toList();
    if (_activeKey == key) setActive(null);
    notifyListeners();
  }

  void setActive(String? key) {
    _activeKey = key;
    _client = null;
    _sse = null;
    _connected = false;
    _path = null;
    _projects = [];
    _sessions = [];
    _daemonAvailable = false;
    _serverStatus = null;
    _sseSub?.cancel();

    if (key != null) {
      final cfg = _servers.firstWhere((s) => s.key == key, orElse: () => ServerConfig(url: key));
      _client = OpenCodeClient(
        baseUrl: cfg.url,
        username: cfg.username,
        password: cfg.password,
      );
      _sse = SseClient(
        baseUrl: cfg.url,
        username: cfg.username,
        password: cfg.password,
      );
    }
    notifyListeners();
  }

  Future<bool> connect() async {
    final c = _client;
    if (c == null) return false;

    final health = await c.health();
    if (health == null || !health.healthy) {
      _connected = false;
      notifyListeners();
      return false;
    }

    _connected = true;

    final path = await c.path();
    _path = path;

    final projs = await c.projectList();
    _projects = projs ?? [];

    try {
      final status = await c.serverStatus();
      _daemonAvailable = status != null;
      _serverStatus = status;
    } catch (_) {
      _daemonAvailable = false;
    }

    _sseSub?.cancel();
    _sseSub = _sse?.connect(onError: (_) {}).listen((e) {
      if (e.payload is Map && e.directory != null) {
        _onSseEvent(e.directory!, e.payload as Map<String, dynamic>);
      }
    });

    notifyListeners();
    return true;
  }

  void _onSseEvent(String directory, Map<String, dynamic> payload) {
    final type = payload['type'] as String?;
    if (type == 'session.created' || type == 'session.updated' || type == 'session.deleted') {
      loadSessions(directory);
    }
    notifyListeners();
  }

  Future<void> loadSessions(String directory) async {
    final c = _client;
    if (c == null) return;

    _activeDirectory = directory;
    final list = await c.sessionList(directory, roots: true, limit: 50);
    _sessions = list ?? [];
    notifyListeners();
  }

  Future<Session?> createSession(String directory, {String? title}) async {
    final c = _client;
    if (c == null) return null;

    final s = await c.sessionCreate(directory, title: title);
    if (s != null) loadSessions(directory);
    return s;
  }

  Future<void> loadProjects() async {
    final c = _client;
    if (c == null) return;

    final list = await c.projectList();
    _projects = list ?? [];
    notifyListeners();
  }

  Future<void> refreshServerStatus() async {
    final c = _client;
    if (c == null) return;

    try {
      final status = await c.serverStatus();
      _serverStatus = status;
      notifyListeners();
    } catch (_) {}
  }

  Future<Project?> addProjectByUrl(String url, {String? branch}) async {
    final c = _client;
    if (c == null) return null;

    final p = await c.projectAddByUrl(url, branch: branch);
    if (p != null) loadProjects();
    return p;
  }

  @override
  void dispose() {
    _sseSub?.cancel();
    super.dispose();
  }
}
