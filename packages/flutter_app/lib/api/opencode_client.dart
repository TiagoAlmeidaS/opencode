import 'dart:convert';

import 'package:http/http.dart' as http;

import 'models.dart';

/// OpenCode API client for REST endpoints.
class OpenCodeClient {
  OpenCodeClient({
    required this.baseUrl,
    this.username,
    this.password,
    http.Client? client,
  })  : _base = baseUrl.replaceFirst(RegExp(r'/+$'), ''),
        _http = client ?? http.Client();

  final String baseUrl;
  final String? username;
  final String? password;
  final String _base;
  final http.Client _http;

  Map<String, String> get _headers {
    final h = {'Content-Type': 'application/json', 'Accept': 'application/json'};
    if (username != null && password != null) {
      final cred = base64Encode(utf8.encode('$username:$password'));
      h['Authorization'] = 'Basic $cred';
    }
    return h;
  }

  Map<String, String> _dirQuery(String directory, [String? workspace]) {
    final q = <String, String>{'directory': directory};
    if (workspace != null) q['workspace'] = workspace;
    return q;
  }

  static String _hintNonJson(String body) {
    final b = body.trimLeft();
    final lower = b.toLowerCase();
    if (lower.startsWith('<!doctype') || lower.startsWith('<html')) {
      return 'The server returned HTML, not the API. Use the OpenCode API URL (e.g. http://host:4096), '
          'not a web app. If the server uses a password, set Basic auth in connection settings.';
    }
    if (!b.startsWith('[') && !b.startsWith('{')) {
      return 'Response was not JSON. Check base URL and authentication.';
    }
    return 'Invalid JSON from server.';
  }

  Future<T?> _get<T>(String path, T Function(Map<String, dynamic>) fromJson) async {
    final r = await _http.get(Uri.parse('$_base$path'), headers: _headers);
    if (r.statusCode != 200) return null;
    return fromJson(jsonDecode(r.body) as Map<String, dynamic>);
  }

  Future<T?> _post<T>(
    String path,
    Map<String, dynamic>? body,
    T Function(Map<String, dynamic>) fromJson,
  ) async {
    final r = await _http.post(
      Uri.parse('$_base$path'),
      headers: _headers,
      body: body != null ? jsonEncode(body) : null,
    );
    if (r.statusCode != 200) return null;
    return fromJson(jsonDecode(r.body) as Map<String, dynamic>);
  }

  // Global
  Future<HealthInfo?> health() =>
      _get('/global/health', HealthInfo.fromJson);

  Future<PathInfo?> path() => _get('/path', PathInfo.fromJson);

  /// Workspace config merge (writes project `config.json` under that directory).
  Future<Map<String, dynamic>?> configGet(String directory, {String? workspace}) async {
    final uri = Uri.parse('$_base/config').replace(queryParameters: _dirQuery(directory, workspace));
    final r = await _http.get(uri, headers: _headers);
    if (r.statusCode != 200) return null;
    return jsonDecode(r.body) as Map<String, dynamic>?;
  }

  Future<Map<String, dynamic>?> configPatch(
    String directory,
    Map<String, dynamic> patch, {
    String? workspace,
  }) async {
    final uri = Uri.parse('$_base/config').replace(queryParameters: _dirQuery(directory, workspace));
    final r = await _http.patch(uri, headers: _headers, body: jsonEncode(patch));
    if (r.statusCode != 200) return null;
    return jsonDecode(r.body) as Map<String, dynamic>?;
  }

  /// Configured providers + models for the instance (`provider/model` ids).
  Future<Map<String, dynamic>?> configProviders(String directory, {String? workspace}) async {
    final uri = Uri.parse('$_base/config/providers').replace(queryParameters: _dirQuery(directory, workspace));
    final r = await _http.get(uri, headers: _headers);
    if (r.statusCode != 200) return null;
    return jsonDecode(r.body) as Map<String, dynamic>?;
  }

  Future<Map<String, dynamic>?> globalConfigGet() async {
    final r = await _http.get(Uri.parse('$_base/global/config'), headers: _headers);
    if (r.statusCode != 200) return null;
    return jsonDecode(r.body) as Map<String, dynamic>?;
  }

  Future<Map<String, dynamic>?> globalConfigPatch(Map<String, dynamic> patch) async {
    final r = await _http.patch(
      Uri.parse('$_base/global/config'),
      headers: _headers,
      body: jsonEncode(patch),
    );
    if (r.statusCode != 200) return null;
    return jsonDecode(r.body) as Map<String, dynamic>?;
  }

  // Project
  Future<List<Project>?> projectList({String? directory, String? workspace}) async {
    final q = <String, String>{};
    if (directory != null) q['directory'] = directory;
    if (workspace != null) q['workspace'] = workspace;
    var uri = Uri.parse('$_base/project');
    if (q.isNotEmpty) uri = uri.replace(queryParameters: q);
    final r = await _http.get(uri, headers: _headers);
    if (r.statusCode != 200) return null;
    final list = jsonDecode(r.body) as List<dynamic>?;
    return list?.map((e) => Project.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Project?> projectAddByUrl(String url, {String? branch, String? token}) {
    final body = <String, dynamic>{'url': url};
    if (branch != null && branch.trim().isNotEmpty) body['branch'] = branch.trim();
    if (token != null && token.trim().isNotEmpty) body['token'] = token.trim();
    return _post('/project/add-by-url', body, Project.fromJson);
  }

  // Session
  Future<List<Session>?> sessionList(
    String directory, {
    String? workspace,
    bool? roots,
    int? limit,
  }) async {
    final q = Map<String, String>.from(_dirQuery(directory, workspace));
    if (roots != null) q['roots'] = roots.toString();
    if (limit != null) q['limit'] = limit.toString();
    final uri = Uri.parse('$_base/session').replace(queryParameters: q);
    final r = await _http.get(uri, headers: _headers);
    if (r.statusCode != 200) return null;
    final list = jsonDecode(r.body) as List<dynamic>?;
    return list?.map((e) => Session.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Session?> sessionCreate(String directory, {String? title, String? parentID}) async {
    final q = _dirQuery(directory);
    final uri = Uri.parse('$_base/session').replace(queryParameters: q);
    final body = <String, dynamic>{};
    if (title != null) body['title'] = title;
    if (parentID != null) body['parentID'] = parentID;
    final r = await _http.post(uri, headers: _headers, body: jsonEncode(body));
    if (r.statusCode != 200) return null;
    return Session.fromJson(jsonDecode(r.body) as Map<String, dynamic>);
  }

  Future<Session?> sessionGet(String directory, String sessionID) async {
    final uri = Uri.parse('$_base/session/$sessionID').replace(queryParameters: _dirQuery(directory));
    final r = await _http.get(uri, headers: _headers);
    if (r.statusCode != 200) return null;
    return Session.fromJson(jsonDecode(r.body) as Map<String, dynamic>);
  }

  /// Returns list of {info: Message, parts: Part[]}
  Future<List<Map<String, dynamic>>?> sessionMessages(
    String directory,
    String sessionID, {
    String? workspace,
    int? limit,
    String? cursor,
  }) async {
    final q = _dirQuery(directory, workspace);
    if (limit != null) q['limit'] = limit.toString();
    if (cursor != null) q['cursor'] = cursor;
    final uri = Uri.parse('$_base/session/$sessionID/message').replace(queryParameters: q);
    final r = await _http.get(uri, headers: _headers);
    if (r.statusCode != 200) return null;
    final list = jsonDecode(r.body) as List<dynamic>?;
    return list?.map((e) => e as Map<String, dynamic>).toList();
  }

  Future<bool> sessionPrompt(
    String directory,
    String sessionID,
    String text, {
    String? workspace,
    Map<String, String>? model,
    List<Map<String, dynamic>>? extraParts,
  }) async {
    final uri = Uri.parse('$_base/session/$sessionID/message').replace(queryParameters: _dirQuery(directory, workspace));
    final parts = <Map<String, dynamic>>[
      {'type': 'text', 'text': text},
      if (extraParts != null) ...extraParts,
    ];
    final body = <String, dynamic>{'parts': parts};
    if (model != null) body['model'] = {'providerID': model['providerID'], 'modelID': model['modelID']};
    final r = await _http.post(uri, headers: _headers, body: jsonEncode(body));
    return r.statusCode == 200;
  }

  Future<bool> sessionAbort(String directory, String sessionID) async {
    final uri = Uri.parse('$_base/session/$sessionID/abort').replace(queryParameters: _dirQuery(directory));
    final r = await _http.post(uri, headers: _headers);
    return r.statusCode == 200;
  }

  Future<Session?> sessionFork(String directory, String sessionID, String messageID) async {
    final uri = Uri.parse('$_base/session/$sessionID/fork').replace(queryParameters: _dirQuery(directory));
    final r = await _http.post(uri, headers: _headers, body: jsonEncode({'messageID': messageID}));
    if (r.statusCode != 200) return null;
    return Session.fromJson(jsonDecode(r.body) as Map<String, dynamic>);
  }

  // PTY
  Future<List<PtyInfo>?> ptyList(String directory, {String? workspace}) async {
    final uri = Uri.parse('$_base/pty').replace(queryParameters: _dirQuery(directory, workspace));
    final r = await _http.get(uri, headers: _headers);
    if (r.statusCode != 200) return null;
    final list = jsonDecode(r.body) as List<dynamic>?;
    return list?.map((e) => PtyInfo.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<PtyInfo?> ptyCreate(String directory, {String? sessionID}) async {
    final uri = Uri.parse('$_base/pty').replace(queryParameters: _dirQuery(directory));
    final r = await _http.post(uri, headers: _headers, body: jsonEncode({'sessionID': sessionID}));
    if (r.statusCode != 200) return null;
    return PtyInfo.fromJson(jsonDecode(r.body) as Map<String, dynamic>);
  }

  String ptyConnectUrl(String ptyID) => '$_base/pty/$ptyID/connect'
      .replaceFirst('http://', 'ws://')
      .replaceFirst('https://', 'wss://');

  // Server (daemon)
  Future<ServerStatus?> serverStatus() =>
      _get('/server/status', ServerStatus.fromJson);

  Future<List<Map<String, dynamic>>?> serverPipelines() async {
    final r = await _http.get(Uri.parse('$_base/server/pipelines'), headers: _headers);
    if (r.statusCode != 200) return null;
    final list = jsonDecode(r.body) as List<dynamic>?;
    return list?.map((e) => e as Map<String, dynamic>).toList();
  }

  Future<List<Map<String, dynamic>>?> serverJobs({String? pipelineId, String? status}) async {
    final q = <String, String>{};
    if (pipelineId != null) q['pipeline_id'] = pipelineId;
    if (status != null) q['status'] = status;
    var uri = Uri.parse('$_base/server/jobs');
    if (q.isNotEmpty) uri = uri.replace(queryParameters: q);
    final r = await _http.get(uri, headers: _headers);
    if (r.statusCode != 200) return null;
    final list = jsonDecode(r.body) as List<dynamic>?;
    return list?.map((e) => e as Map<String, dynamic>).toList();
  }

  Future<bool> serverPipelineEnable(String id) async {
    final r = await _http.post(Uri.parse('$_base/server/pipelines/$id/enable'), headers: _headers);
    return r.statusCode == 200;
  }

  Future<bool> serverPipelineDisable(String id) async {
    final r = await _http.post(Uri.parse('$_base/server/pipelines/$id/disable'), headers: _headers);
    return r.statusCode == 200;
  }

  /// Returns `{ok: true, jobId}` on 202, `{ok: false, error}` on 400 (e.g. daily limit).
  Future<Map<String, dynamic>?> serverPipelineRun(String id) async {
    final r = await _http.post(Uri.parse('$_base/server/pipelines/$id/run'), headers: _headers);
    Map<String, dynamic>? j;
    try {
      final d = jsonDecode(r.body);
      if (d is Map<String, dynamic>) j = d;
    } catch (_) {}
    if (r.statusCode == 202) return {...?j, 'ok': true};
    if (r.statusCode == 400) return {'ok': false, 'error': j?['error']?.toString() ?? 'Run failed'};
    return null;
  }

  Future<Map<String, dynamic>?> serverPipelineCreate({
    required String name,
    required String strategy,
    Map<String, dynamic>? configJson,
    String? scheduleCron,
    int? maxRunsPerDay,
  }) async {
    final body = <String, dynamic>{
      'name': name,
      'strategy': strategy,
      if (configJson != null) 'config_json': configJson,
      if (scheduleCron != null) 'schedule_cron': scheduleCron,
      if (maxRunsPerDay != null) 'max_runs_per_day': maxRunsPerDay,
    };
    final r = await _http.post(
      Uri.parse('$_base/server/pipelines'),
      headers: _headers,
      body: jsonEncode(body),
    );
    if (r.statusCode != 201) return null;
    return jsonDecode(r.body) as Map<String, dynamic>?;
  }

  Future<Map<String, dynamic>?> serverPipelinePatch(
    String id, {
    String? name,
    String? scheduleCron,
    int? maxRunsPerDay,
    Map<String, dynamic>? configJson,
  }) async {
    final body = <String, dynamic>{
      if (name != null) 'name': name,
      if (scheduleCron != null) 'schedule_cron': scheduleCron,
      if (maxRunsPerDay != null) 'max_runs_per_day': maxRunsPerDay,
      if (configJson != null) 'config_json': configJson,
    };
    if (body.isEmpty) return null;
    final r = await _http.patch(
      Uri.parse('$_base/server/pipelines/$id'),
      headers: _headers,
      body: jsonEncode(body),
    );
    if (r.statusCode != 200) return null;
    return jsonDecode(r.body) as Map<String, dynamic>?;
  }

  Future<List<Map<String, dynamic>>?> serverGoals() async {
    final r = await _http.get(Uri.parse('$_base/server/goals'), headers: _headers);
    if (r.statusCode != 200) return null;
    final list = jsonDecode(r.body) as List<dynamic>?;
    return list?.map((e) => e as Map<String, dynamic>).toList();
  }

  Future<List<Map<String, dynamic>>?> serverProposals() async {
    final r = await _http.get(Uri.parse('$_base/server/proposals'), headers: _headers);
    if (r.statusCode != 200) return null;
    final list = jsonDecode(r.body) as List<dynamic>?;
    return list?.map((e) => e as Map<String, dynamic>).toList();
  }

  Future<bool> serverProposalApprove(String id) async {
    final r = await _http.post(Uri.parse('$_base/server/proposals/$id/approve'), headers: _headers);
    return r.statusCode == 200;
  }

  Future<bool> serverProposalReject(String id) async {
    final r = await _http.post(Uri.parse('$_base/server/proposals/$id/reject'), headers: _headers);
    return r.statusCode == 200;
  }

  // File
  Future<({List<String>? paths, String? error})> fileFind(
    String directory, {
    String? workspace,
    required String query,
    String? type,
    int? limit,
  }) async {
    final q = _dirQuery(directory, workspace);
    q['query'] = query;
    if (type != null) q['type'] = type;
    if (limit != null) q['limit'] = limit.toString();
    final uri = Uri.parse('$_base/find/file').replace(queryParameters: q);
    final r = await _http.get(uri, headers: _headers);
    if (r.statusCode != 200) return (paths: null, error: 'HTTP ${r.statusCode}');
    final t = r.body.trimLeft();
    if (!t.startsWith('[')) return (paths: null, error: _hintNonJson(r.body));
    try {
      final v = jsonDecode(r.body);
      if (v is! List) return (paths: null, error: 'Expected JSON array');
      return (
        paths: v.map((e) => e.toString()).toList(),
        error: null,
      );
    } catch (_) {
      return (paths: null, error: 'Invalid JSON');
    }
  }

  /// [nodes] null means failure; see [error].
  Future<({List<FileNode>? nodes, String? error})> fileList(
    String directory, {
    String? workspace,
    required String path,
  }) async {
    final q = _dirQuery(directory, workspace);
    q['path'] = path;
    final uri = Uri.parse('$_base/file').replace(queryParameters: q);
    final r = await _http.get(uri, headers: _headers);
    if (r.statusCode != 200) return (nodes: null, error: 'HTTP ${r.statusCode}');
    final t = r.body.trimLeft();
    if (!t.startsWith('[')) return (nodes: null, error: _hintNonJson(r.body));
    try {
      final v = jsonDecode(r.body);
      if (v is! List) return (nodes: null, error: 'Expected JSON array');
      final nodes = <FileNode>[];
      for (final e in v) {
        if (e is! Map) return (nodes: null, error: 'Invalid file entry');
        nodes.add(FileNode.fromJson(Map<String, dynamic>.from(e)));
      }
      return (nodes: nodes, error: null);
    } catch (_) {
      return (nodes: null, error: 'Invalid JSON');
    }
  }

  /// [content] null with [error] set means failure.
  Future<({FileContent? content, String? error})> fileRead(
    String directory, {
    String? workspace,
    required String path,
  }) async {
    final q = _dirQuery(directory, workspace);
    q['path'] = path;
    final uri = Uri.parse('$_base/file/content').replace(queryParameters: q);
    final r = await _http.get(uri, headers: _headers);
    if (r.statusCode != 200) return (content: null, error: 'HTTP ${r.statusCode}');
    final t = r.body.trimLeft();
    if (!t.startsWith('{')) return (content: null, error: _hintNonJson(r.body));
    try {
      final m = jsonDecode(r.body);
      if (m is! Map) return (content: null, error: 'Expected JSON object');
      return (content: FileContent.fromJson(Map<String, dynamic>.from(m)), error: null);
    } catch (_) {
      return (content: null, error: 'Invalid JSON');
    }
  }

  Future<List<FileStatusEntry>?> fileStatus(String directory, {String? workspace}) async {
    final uri = Uri.parse('$_base/file/status').replace(queryParameters: _dirQuery(directory, workspace));
    final r = await _http.get(uri, headers: _headers);
    if (r.statusCode != 200) return null;
    final list = jsonDecode(r.body) as List<dynamic>?;
    return list?.map((e) => FileStatusEntry.fromJson(e as Map<String, dynamic>)).toList();
  }

  // Session diff
  Future<Map<String, dynamic>?> sessionDiff(String directory, String sessionID, {String? workspace}) async {
    final uri = Uri.parse('$_base/session/$sessionID/diff').replace(queryParameters: _dirQuery(directory, workspace));
    final r = await _http.get(uri, headers: _headers);
    if (r.statusCode != 200) return null;
    return jsonDecode(r.body) as Map<String, dynamic>?;
  }

  // Permission / question (agent prompts)
  Future<List<Map<String, dynamic>>?> permissionList(String directory, {String? workspace}) async {
    final uri = Uri.parse('$_base/permission').replace(queryParameters: _dirQuery(directory, workspace));
    final r = await _http.get(uri, headers: _headers);
    if (r.statusCode != 200) return null;
    final list = jsonDecode(r.body) as List<dynamic>?;
    return list?.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<bool> permissionReply(String directory, String requestID, {required String reply, String? message, String? workspace}) async {
    final body = <String, dynamic>{'reply': reply};
    if (message != null) body['message'] = message;
    final uri = Uri.parse('$_base/permission/$requestID/reply').replace(queryParameters: _dirQuery(directory, workspace));
    final r = await _http.post(uri, headers: _headers, body: jsonEncode(body));
    return r.statusCode == 200;
  }

  Future<List<Map<String, dynamic>>?> questionList(String directory, {String? workspace}) async {
    final uri = Uri.parse('$_base/question').replace(queryParameters: _dirQuery(directory, workspace));
    final r = await _http.get(uri, headers: _headers);
    if (r.statusCode != 200) return null;
    final list = jsonDecode(r.body) as List<dynamic>?;
    return list?.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<bool> questionReply(String directory, String requestID, List<List<String>> answers, {String? workspace}) async {
    final uri = Uri.parse('$_base/question/$requestID/reply').replace(queryParameters: _dirQuery(directory, workspace));
    final r = await _http.post(
      uri,
      headers: _headers,
      body: jsonEncode({'answers': answers}),
    );
    return r.statusCode == 200;
  }

  Future<bool> questionReject(String directory, String requestID, {String? workspace}) async {
    final uri = Uri.parse('$_base/question/$requestID/reject').replace(queryParameters: _dirQuery(directory, workspace));
    final r = await _http.post(uri, headers: _headers);
    return r.statusCode == 200;
  }

  // GitHub OAuth Device Flow (proxied – client_secret stays on server)

  /// Start Device Flow. Returns map with deviceCode, userCode, verificationUri,
  /// interval, expiresIn — or {error: ...} if the server is not configured.
  Future<Map<String, dynamic>?> githubAuthStart() async {
    final r = await _http.post(Uri.parse('$_base/github/auth/start'), headers: _headers);
    try {
      return jsonDecode(r.body) as Map<String, dynamic>?;
    } catch (_) {
      return null;
    }
  }

  /// Poll for token. Returns {status: pending|done|expired|denied|error, token?}.
  Future<Map<String, dynamic>?> githubAuthPoll(String deviceCode) async {
    final r = await _http.post(
      Uri.parse('$_base/github/auth/poll'),
      headers: _headers,
      body: jsonEncode({'deviceCode': deviceCode}),
    );
    try {
      return jsonDecode(r.body) as Map<String, dynamic>?;
    } catch (_) {
      return null;
    }
  }

  // VCS
  Future<String?> vcsGetBranch(String directory, {String? workspace}) async {
    final uri = Uri.parse('$_base/vcs').replace(queryParameters: _dirQuery(directory, workspace));
    final r = await _http.get(uri, headers: _headers);
    if (r.statusCode != 200) return null;
    try {
      final data = jsonDecode(r.body) as Map<String, dynamic>;
      return data['branch'] as String?;
    } catch (_) {
      return null;
    }
  }

  Future<Map<String, dynamic>?> serverDashboard({int days = 30}) async {
    final uri = Uri.parse('$_base/server/dashboard').replace(queryParameters: {'days': '$days'});
    final r = await _http.get(uri, headers: _headers);
    if (r.statusCode != 200) return null;
    return jsonDecode(r.body) as Map<String, dynamic>?;
  }

  Future<Map<String, dynamic>?> serverMemoryRetrieve(String q, {int limit = 5}) async {
    final uri = Uri.parse('$_base/server/memory/retrieve').replace(queryParameters: {'q': q, 'limit': '$limit'});
    final r = await _http.get(uri, headers: _headers);
    if (r.statusCode != 200) return null;
    return jsonDecode(r.body) as Map<String, dynamic>?;
  }

  Future<List<Map<String, dynamic>>?> serverDiscoveryList({String? status, int limit = 50, int offset = 0}) async {
    final q = <String, String>{'limit': '$limit', 'offset': '$offset'};
    if (status != null) q['status'] = status;
    final uri = Uri.parse('$_base/server/discovery').replace(queryParameters: q);
    final r = await _http.get(uri, headers: _headers);
    if (r.statusCode != 200) return null;
    final list = jsonDecode(r.body) as List<dynamic>?;
    return list?.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<Map<String, dynamic>?> serverDiscoveryEnqueue(String ideaText, {String? sessionId, bool triggerPipeline = false}) async {
    final r = await _http.post(
      Uri.parse('$_base/server/discovery'),
      headers: _headers,
      body: jsonEncode({
        'idea_text': ideaText,
        if (sessionId != null) 'session_id': sessionId,
        'trigger_pipeline': triggerPipeline,
      }),
    );
    if (r.statusCode != 201) return null;
    return jsonDecode(r.body) as Map<String, dynamic>?;
  }

  // Repo Issue Jobs
  Future<List<Map<String, dynamic>>?> serverRepoIssueJobs({String? status, String? repo, int limit = 50}) async {
    final q = <String, String>{'limit': '$limit'};
    if (status != null) q['status'] = status;
    if (repo != null) q['repo'] = repo;
    final uri = Uri.parse('$_base/server/repo-issue-jobs').replace(queryParameters: q);
    final r = await _http.get(uri, headers: _headers);
    if (r.statusCode != 200) return null;
    final list = jsonDecode(r.body) as List<dynamic>?;
    return list?.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<Map<String, dynamic>?> serverRepoIssueJob(String id) async {
    final r = await _http.get(Uri.parse('$_base/server/repo-issue-jobs/$id'), headers: _headers);
    if (r.statusCode != 200) return null;
    return jsonDecode(r.body) as Map<String, dynamic>?;
  }

  Future<Map<String, dynamic>?> serverProposalGet(String id) async {
    final r = await _http.get(Uri.parse('$_base/server/proposals/$id'), headers: _headers);
    if (r.statusCode != 200) return null;
    return jsonDecode(r.body) as Map<String, dynamic>?;
  }

  // Reports
  Future<List<Map<String, dynamic>>?> serverReports({String? reportType, int limit = 30}) async {
    final q = <String, String>{'limit': '$limit'};
    if (reportType != null) q['type'] = reportType;
    final uri = Uri.parse('$_base/server/reports').replace(queryParameters: q);
    final r = await _http.get(uri, headers: _headers);
    if (r.statusCode != 200) return null;
    final list = jsonDecode(r.body) as List<dynamic>?;
    return list?.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<Map<String, dynamic>?> serverReport(String id) async {
    final r = await _http.get(Uri.parse('$_base/server/reports/$id'), headers: _headers);
    if (r.statusCode != 200) return null;
    return jsonDecode(r.body) as Map<String, dynamic>?;
  }

  // Learnings
  Future<List<Map<String, dynamic>>?> serverLearnings({String? category, int limit = 50}) async {
    final q = <String, String>{'limit': '$limit'};
    if (category != null) q['category'] = category;
    final uri = Uri.parse('$_base/server/learnings').replace(queryParameters: q);
    final r = await _http.get(uri, headers: _headers);
    if (r.statusCode != 200) return null;
    final list = jsonDecode(r.body) as List<dynamic>?;
    return list?.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<Map<String, dynamic>?> serverLearningExtract() async {
    final r = await _http.post(Uri.parse('$_base/server/learnings/extract'), headers: _headers);
    if (r.statusCode != 200 && r.statusCode != 201 && r.statusCode != 202) return null;
    try {
      return jsonDecode(r.body) as Map<String, dynamic>?;
    } catch (_) {
      return {'ok': true};
    }
  }

  // Opportunities
  Future<Map<String, dynamic>?> serverOpportunitiesStats() async {
    final r = await _http.get(Uri.parse('$_base/server/opportunities/stats'), headers: _headers);
    if (r.statusCode != 200) return null;
    return jsonDecode(r.body) as Map<String, dynamic>?;
  }

  Future<List<Map<String, dynamic>>?> serverOpportunities({String? status, double? minScore, int limit = 50}) async {
    final q = <String, String>{'limit': '$limit'};
    if (status != null) q['status'] = status;
    if (minScore != null) q['min_score'] = '$minScore';
    final uri = Uri.parse('$_base/server/opportunities').replace(queryParameters: q);
    final r = await _http.get(uri, headers: _headers);
    if (r.statusCode != 200) return null;
    final list = jsonDecode(r.body) as List<dynamic>?;
    return list?.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  // Submissions
  Future<List<Map<String, dynamic>>?> serverSubmissions({String? status, int limit = 30}) async {
    final q = <String, String>{'limit': '$limit'};
    if (status != null) q['status'] = status;
    final uri = Uri.parse('$_base/server/submissions').replace(queryParameters: q);
    final r = await _http.get(uri, headers: _headers);
    if (r.statusCode != 200) return null;
    final list = jsonDecode(r.body) as List<dynamic>?;
    return list?.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<bool> serverSubmissionApprove(String id) async {
    final r = await _http.post(Uri.parse('$_base/server/submissions/$id/approve'), headers: _headers);
    return r.statusCode == 200;
  }

  Future<bool> serverSubmissionReject(String id) async {
    final r = await _http.post(Uri.parse('$_base/server/submissions/$id/reject'), headers: _headers);
    return r.statusCode == 200;
  }

  Future<bool> serverOpportunityShortlist(String id) async {
    final r = await _http.post(Uri.parse('$_base/server/opportunities/$id/shortlist'), headers: _headers);
    return r.statusCode == 200;
  }

  Future<bool> serverOpportunityIgnore(String id) async {
    final r = await _http.post(Uri.parse('$_base/server/opportunities/$id/ignore'), headers: _headers);
    return r.statusCode == 200;
  }
}
