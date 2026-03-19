import 'dart:async';

import 'package:flutter/foundation.dart';

import '../api/daemon_url.dart';
import '../api/models.dart';
import '../api/opencode_client.dart';
import '../api/server_api_client.dart';
import '../services/sse_client.dart';

class ServerConfig {
  ServerConfig({
    required this.url,
    this.displayName,
    this.username,
    this.password,
    this.daemonApiBase,
    this.apiToken,
  });

  final String url;
  final String? displayName;
  final String? username;
  final String? password;
  /// Standalone `packages/server`: e.g. `http://host:3000/api`. Empty = auto `http://host:3000/api` for non-localhost, else `{url}/server/*`.
  final String? daemonApiBase;
  /// Bearer for standalone when `API_TOKEN` is set (optional).
  final String? apiToken;

  String get key => url;
}

class AppState extends ChangeNotifier {
  AppState();

  List<ServerConfig> _servers = [];
  String? _activeKey;
  OpenCodeClient? _client;
  ServerApiClient? _server;
  SseClient? _sse;
  StreamSubscription<GlobalEvent>? _sseSub;

  final StreamController<({String dir, String sid})> _chat = StreamController.broadcast();
  Stream<({String dir, String sid})> get chatReload => _chat.stream;

  final StreamController<String> _attention = StreamController.broadcast();
  Stream<String> get sessionAttention => _attention.stream;

  final Map<String, Timer> _debounce = {};

  List<ServerConfig> get servers => List.unmodifiable(_servers);
  String? get activeKey => _activeKey;
  OpenCodeClient? get client => _client;
  ServerApiClient? get server => _server;

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

  String? _githubToken;
  String? get githubToken => _githubToken;
  void setGithubToken(String? token) {
    _githubToken = token;
    notifyListeners();
  }

  String? _currentBranch;
  String? get currentBranch => _currentBranch;

  final Map<String, String?> _sessionModels = {};
  String? getSessionModel(String sessionID) => _sessionModels[sessionID];
  void setSessionModel(String sessionID, String? modelId) {
    _sessionModels[sessionID] = modelId;
    notifyListeners();
  }

  void addServer(ServerConfig cfg) {
    _servers = [
      ..._servers.where((s) => s.key != cfg.key),
      cfg,
    ];
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
    _server = null;
    _sse = null;
    _connected = false;
    _path = null;
    _projects = [];
    _sessions = [];
    _daemonAvailable = false;
    _serverStatus = null;
    _githubToken = null;
    _sseSub?.cancel();

    if (key != null) {
      final cfg = _servers.firstWhere((s) => s.key == key, orElse: () => ServerConfig(url: key));
      _client = OpenCodeClient(
        baseUrl: cfg.url,
        username: cfg.username,
        password: cfg.password,
      );
      final daemon = resolveDaemonApiBase(openCodeUrl: cfg.url, configuredDaemon: cfg.daemonApiBase);
      if (daemon != null && daemon.isNotEmpty) {
        _server = ServerApiClient(baseUrl: daemon, token: cfg.apiToken);
      }
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

    if (_server != null) {
      try {
        var status = await _server!.status();
        if (status == null && _server!.hasToken == false) {
          final cfg = _servers.firstWhere((s) => s.key == _activeKey, orElse: () => ServerConfig(url: _activeKey!));
          final daemon = resolveDaemonApiBase(openCodeUrl: cfg.url, configuredDaemon: cfg.daemonApiBase);
          if (daemon != null) {
            final origin = Uri.tryParse(daemon)?.origin;
            if (origin != null) {
              final tok = await detectServerToken(origin);
              if (tok != null && tok.isNotEmpty) {
                _server = ServerApiClient(baseUrl: daemon, token: tok);
                _servers = [
                  ..._servers.where((s) => s.key != cfg.key),
                  ServerConfig(
                    url: cfg.url,
                    displayName: cfg.displayName,
                    username: cfg.username,
                    password: cfg.password,
                    daemonApiBase: cfg.daemonApiBase,
                    apiToken: tok,
                  ),
                ];
                status = await _server!.status();
              }
            }
          }
        }
        _daemonAvailable = status != null;
        _serverStatus = status;
      } catch (_) {
        _daemonAvailable = false;
      }
    }

    _sseSub?.cancel();
    _sseSub = _sse?.connect(onError: (_) {}).listen((e) {
      if (e.payload is! Map) return;
      final raw = Map<String, dynamic>.from(e.payload as Map);
      final dir = e.directory ?? raw['directory'] as String?;
      if (dir == null) return;
      _onSse(dir, raw);
    });

    notifyListeners();
    return true;
  }

  void _pulse(String dir, String sid) {
    final k = '$dir\x00$sid';
    _debounce[k]?.cancel();
    _debounce[k] = Timer(const Duration(milliseconds: 400), () {
      _debounce.remove(k);
      if (!_chat.isClosed) _chat.add((dir: dir, sid: sid));
    });
  }

  String? _sid(String? t, Map<String, dynamic>? p) {
    if (p == null || t == null) return null;
    if (t.startsWith('message.part.') && t != 'message.part.updated') return p['sessionID'] as String?;
    if (t == 'message.removed') return p['sessionID'] as String?;
    if (t == 'message.updated') {
      final info = p['info'];
      if (info is Map) return info['sessionID'] as String?;
    }
    if (t == 'message.part.updated') {
      final part = p['part'];
      if (part is Map) return part['sessionID'] as String?;
    }
    if (t == 'session.status' || t == 'session.idle') return p['sessionID'] as String?;
    if (t == 'permission.asked' || t == 'question.asked') return p['sessionID'] as String?;
    if (t == 'permission.replied' || t == 'question.replied' || t == 'question.rejected') {
      return p['sessionID'] as String?;
    }
    return null;
  }

  bool _msg(String? t) {
    if (t == null) return false;
    return t.startsWith('message.') || t == 'session.status' || t == 'session.idle';
  }

  void _onSse(String directory, Map<String, dynamic> raw) {
    final inner = raw['payload'];
    final body = inner is Map ? Map<String, dynamic>.from(inner) : null;
    final type = body?['type'] as String? ?? raw['type'] as String?;
    final props = body?['properties'];
    final prop = props is Map ? Map<String, dynamic>.from(props) : null;

    if (type == 'session.created' || type == 'session.updated' || type == 'session.deleted') {
      loadSessions(directory);
      final info = prop?['info'];
      if (info is Map && info['id'] is String) {
        _pulse(directory, info['id'] as String);
      }
    }

    final sid = _sid(type, prop);
    if (sid != null && _msg(type)) {
      _pulse(directory, sid);
    }
    if (type == 'permission.asked' || type == 'question.asked') {
      if (sid != null && !_attention.isClosed) _attention.add(sid);
    }
    if (sid != null && (type == 'permission.replied' || type == 'question.replied' || type == 'question.rejected')) {
      _pulse(directory, sid);
    }

    notifyListeners();
  }

  Future<void> loadBranch(String directory) async {
    final c = _client;
    if (c == null) return;
    final branch = await c.vcsGetBranch(directory);
    _currentBranch = branch;
    notifyListeners();
  }

  Future<void> loadSessions(String directory) async {
    final c = _client;
    if (c == null) return;

    _activeDirectory = directory;
    final list = await c.sessionList(directory, roots: true, limit: 50);
    _sessions = list ?? [];
    loadBranch(directory);
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
    final s = _server;
    if (s == null) {
      _daemonAvailable = false;
      _serverStatus = null;
      notifyListeners();
      return;
    }

    try {
      final status = await s.status();
      _daemonAvailable = status != null;
      _serverStatus = status;
      notifyListeners();
    } catch (_) {
      _daemonAvailable = false;
      _serverStatus = null;
      notifyListeners();
    }
  }

  Future<Project?> addProjectByUrl(String url, {String? branch, String? token}) async {
    final c = _client;
    if (c == null) return null;

    final p = await c.projectAddByUrl(url, branch: branch, token: token);
    if (p != null) loadProjects();
    return p;
  }

  @override
  void dispose() {
    _sseSub?.cancel();
    for (final t in _debounce.values) {
      t.cancel();
    }
    _debounce.clear();
    _chat.close();
    _attention.close();
    super.dispose();
  }
}
