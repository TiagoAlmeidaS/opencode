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

  Future<Project?> projectAddByUrl(String url, {String? branch}) =>
      _post('/project/add-by-url', {'url': url, if (branch != null) 'branch': branch}, Project.fromJson);

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
  }) async {
    final uri = Uri.parse('$_base/session/$sessionID/message').replace(queryParameters: _dirQuery(directory, workspace));
    final body = {'parts': [{'type': 'text', 'text': text}]};
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

  Future<Map<String, dynamic>?> serverPipelineRun(String id) async {
    final r = await _http.post(Uri.parse('$_base/server/pipelines/$id/run'), headers: _headers);
    if (r.statusCode != 202) return null;
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
  Future<List<String>?> fileFind(
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
    if (r.statusCode != 200) return null;
    final list = jsonDecode(r.body) as List<dynamic>?;
    return list?.map((e) => e as String).toList();
  }

  Future<List<FileNode>?> fileList(
    String directory, {
    String? workspace,
    required String path,
  }) async {
    final q = _dirQuery(directory, workspace);
    q['path'] = path;
    final uri = Uri.parse('$_base/file').replace(queryParameters: q);
    final r = await _http.get(uri, headers: _headers);
    if (r.statusCode != 200) return null;
    final list = jsonDecode(r.body) as List<dynamic>?;
    return list?.map((e) => FileNode.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<FileContent?> fileRead(
    String directory, {
    String? workspace,
    required String path,
  }) async {
    final q = _dirQuery(directory, workspace);
    q['path'] = path;
    final uri = Uri.parse('$_base/file/content').replace(queryParameters: q);
    final r = await _http.get(uri, headers: _headers);
    if (r.statusCode != 200) return null;
    return FileContent.fromJson(jsonDecode(r.body) as Map<String, dynamic>);
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
}
