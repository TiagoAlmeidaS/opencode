import 'dart:convert';

import 'package:http/http.dart' as http;

import 'daemon_url.dart';
import 'models.dart';

final _tokenRe = RegExp(r'''localStorage\.setItem\(\s*["']api_token["']\s*,\s*["']([^"']+)["']\s*\)''');

/// Fetch the API token that the standalone server injects into the dashboard HTML.
///
/// The server renders `<script>…localStorage.setItem("api_token","<TOKEN>")…</script>`
/// in `GET /` when `DASHBOARD_INJECT_TOKEN` is enabled (default when API_TOKEN is set).
/// Works from any platform (web, mobile, desktop) — no filesystem access needed.
Future<String?> detectServerToken(String serverOrigin, {http.Client? client}) async {
  final origin = serverOrigin.replaceAll(RegExp(r'/+$'), '');
  final h = client ?? http.Client();
  try {
    final r = await h.get(Uri.parse(origin), headers: {'Accept': 'text/html'}).timeout(const Duration(seconds: 5));
    if (r.statusCode != 200) return null;
    final m = _tokenRe.firstMatch(r.body);
    return m?.group(1);
  } catch (_) {
    return null;
  }
}

/// Dedicated HTTP client for standalone Server API (`packages/server`, port 3000).
///
/// Always uses Bearer token auth when [token] is set.
/// Base URL is normalized via [normalizeDaemonApiBase] (e.g. `http://host:3000` → `http://host:3000/api`).
class ServerApiClient {
  ServerApiClient({
    required String baseUrl,
    String? token,
    http.Client? client,
  })  : _base = normalizeDaemonApiBase(baseUrl),
        _token = _clean(token),
        _http = client ?? http.Client();

  final String _base;
  final String? _token;
  final http.Client _http;

  bool get hasToken => _token != null;

  static String? _clean(String? raw) {
    if (raw == null) return null;
    final t = raw
        .trim()
        .replaceFirst(RegExp(r'^Bearer\s+', caseSensitive: false), '')
        .trim();
    return t.isEmpty ? null : t;
  }

  Map<String, String> get _headers {
    final h = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (_token != null) h['Authorization'] = 'Bearer $_token';
    return h;
  }

  Uri _uri(String path, [Map<String, String>? query]) {
    final root = _base.endsWith('/') ? _base : '$_base/';
    final rel = path.startsWith('/') ? path.substring(1) : path;
    var u = Uri.parse(root).resolve(rel);
    if (query == null || query.isEmpty) return u;
    return u.replace(queryParameters: {...u.queryParameters, ...query});
  }

  // ---------------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------------

  Future<ServerStatus?> status() async {
    final r = await _http.get(_uri('status'), headers: _headers);
    if (r.statusCode != 200) return null;
    return ServerStatus.fromJson(jsonDecode(r.body) as Map<String, dynamic>);
  }

  // ---------------------------------------------------------------------------
  // Pipelines
  // ---------------------------------------------------------------------------

  Future<List<Map<String, dynamic>>?> pipelines() async {
    final r = await _http.get(_uri('pipelines'), headers: _headers);
    if (r.statusCode != 200) return null;
    final list = jsonDecode(r.body) as List<dynamic>?;
    return list?.map((e) => e as Map<String, dynamic>).toList();
  }

  Future<bool> pipelineEnable(String id) async {
    final r = await _http.post(_uri('pipelines/$id/enable'), headers: _headers);
    return r.statusCode == 200;
  }

  Future<bool> pipelineDisable(String id) async {
    final r = await _http.post(_uri('pipelines/$id/disable'), headers: _headers);
    return r.statusCode == 200;
  }

  Future<Map<String, dynamic>?> pipelineRun(String id) async {
    final r = await _http.post(_uri('pipelines/$id/run'), headers: _headers);
    Map<String, dynamic>? j;
    try {
      final d = jsonDecode(r.body);
      if (d is Map<String, dynamic>) j = d;
    } catch (_) {}
    if (r.statusCode == 202) return {...?j, 'ok': true};
    if (r.statusCode == 400) return {'ok': false, 'error': j?['error']?.toString() ?? 'Run failed'};
    return null;
  }

  Future<Map<String, dynamic>?> pipelineCreate({
    required String name,
    required String strategy,
    Map<String, dynamic>? config,
    String? cron,
    int? maxRuns,
  }) async {
    final body = <String, dynamic>{
      'name': name,
      'strategy': strategy,
      if (config != null) 'config_json': config,
      if (cron != null) 'schedule_cron': cron,
      if (maxRuns != null) 'max_runs_per_day': maxRuns,
    };
    final r = await _http.post(_uri('pipelines'), headers: _headers, body: jsonEncode(body));
    if (r.statusCode != 201) return null;
    return jsonDecode(r.body) as Map<String, dynamic>?;
  }

  Future<Map<String, dynamic>?> pipelinePatch(
    String id, {
    String? name,
    String? cron,
    int? maxRuns,
    Map<String, dynamic>? config,
  }) async {
    final body = <String, dynamic>{
      if (name != null) 'name': name,
      if (cron != null) 'schedule_cron': cron,
      if (maxRuns != null) 'max_runs_per_day': maxRuns,
      if (config != null) 'config_json': config,
    };
    if (body.isEmpty) return null;
    final r = await _http.patch(_uri('pipelines/$id'), headers: _headers, body: jsonEncode(body));
    if (r.statusCode != 200) return null;
    return jsonDecode(r.body) as Map<String, dynamic>?;
  }

  // ---------------------------------------------------------------------------
  // Jobs
  // ---------------------------------------------------------------------------

  Future<List<Map<String, dynamic>>?> jobs({String? pipelineId, String? status}) async {
    final q = <String, String>{};
    if (pipelineId != null) q['pipeline_id'] = pipelineId;
    if (status != null) q['status'] = status;
    final r = await _http.get(_uri('jobs', q.isEmpty ? null : q), headers: _headers);
    if (r.statusCode != 200) return null;
    final list = jsonDecode(r.body) as List<dynamic>?;
    return list?.map((e) => e as Map<String, dynamic>).toList();
  }

  // ---------------------------------------------------------------------------
  // Goals / Proposals
  // ---------------------------------------------------------------------------

  Future<List<Map<String, dynamic>>?> goals() async {
    final r = await _http.get(_uri('goals'), headers: _headers);
    if (r.statusCode != 200) return null;
    final list = jsonDecode(r.body) as List<dynamic>?;
    return list?.map((e) => e as Map<String, dynamic>).toList();
  }

  Future<List<Map<String, dynamic>>?> proposals() async {
    final r = await _http.get(_uri('proposals'), headers: _headers);
    if (r.statusCode != 200) return null;
    final list = jsonDecode(r.body) as List<dynamic>?;
    return list?.map((e) => e as Map<String, dynamic>).toList();
  }

  Future<Map<String, dynamic>?> proposal(String id) async {
    final r = await _http.get(_uri('proposals/$id'), headers: _headers);
    if (r.statusCode != 200) return null;
    return jsonDecode(r.body) as Map<String, dynamic>?;
  }

  Future<bool> proposalApprove(String id) async {
    final r = await _http.post(_uri('proposals/$id/approve'), headers: _headers);
    return r.statusCode == 200;
  }

  Future<bool> proposalReject(String id) async {
    final r = await _http.post(_uri('proposals/$id/reject'), headers: _headers);
    return r.statusCode == 200;
  }

  // ---------------------------------------------------------------------------
  // Dashboard / Memory / Discovery
  // ---------------------------------------------------------------------------

  Future<Map<String, dynamic>?> dashboard({int days = 30}) async {
    final r = await _http.get(_uri('dashboard', {'days': '$days'}), headers: _headers);
    if (r.statusCode != 200) return null;
    return jsonDecode(r.body) as Map<String, dynamic>?;
  }

  Future<Map<String, dynamic>?> memory(String q, {int limit = 5}) async {
    final r = await _http.get(_uri('memory/retrieve', {'q': q, 'limit': '$limit'}), headers: _headers);
    if (r.statusCode != 200) return null;
    return jsonDecode(r.body) as Map<String, dynamic>?;
  }

  Future<List<Map<String, dynamic>>?> discovery({String? status, int limit = 50, int offset = 0}) async {
    final q = <String, String>{'limit': '$limit', 'offset': '$offset'};
    if (status != null) q['status'] = status;
    final r = await _http.get(_uri('discovery', q), headers: _headers);
    if (r.statusCode != 200) return null;
    final list = jsonDecode(r.body) as List<dynamic>?;
    return list?.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<Map<String, dynamic>?> discoveryEnqueue(String text, {String? sessionId, bool trigger = false}) async {
    final r = await _http.post(
      _uri('discovery'),
      headers: _headers,
      body: jsonEncode({
        'idea_text': text,
        if (sessionId != null) 'session_id': sessionId,
        'trigger_pipeline': trigger,
      }),
    );
    if (r.statusCode != 201) return null;
    return jsonDecode(r.body) as Map<String, dynamic>?;
  }

  // ---------------------------------------------------------------------------
  // Repo Issue Jobs
  // ---------------------------------------------------------------------------

  Future<List<Map<String, dynamic>>?> repoIssueJobs({String? status, String? repo, int limit = 50}) async {
    final q = <String, String>{'limit': '$limit'};
    if (status != null) q['status'] = status;
    if (repo != null) q['repo'] = repo;
    final r = await _http.get(_uri('repo-issue-jobs', q), headers: _headers);
    if (r.statusCode != 200) return null;
    final list = jsonDecode(r.body) as List<dynamic>?;
    return list?.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<Map<String, dynamic>?> repoIssueJob(String id) async {
    final r = await _http.get(_uri('repo-issue-jobs/$id'), headers: _headers);
    if (r.statusCode != 200) return null;
    return jsonDecode(r.body) as Map<String, dynamic>?;
  }

  Future<List<Map<String, dynamic>>?> repoIssueJobErrors(String id) async {
    final r = await _http.get(_uri('repo-issue-jobs/$id/errors'), headers: _headers);
    if (r.statusCode != 200) return null;
    final list = jsonDecode(r.body) as List<dynamic>?;
    return list?.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<List<Map<String, dynamic>>?> repoIssueJobSteps(String id) async {
    final r = await _http.get(_uri('repo-issue-jobs/$id/steps'), headers: _headers);
    if (r.statusCode != 200) return null;
    final list = jsonDecode(r.body) as List<dynamic>?;
    return list?.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<Map<String, dynamic>?> repoIssueJobRetry(String id) async {
    final r = await _http.post(_uri('repo-issue-jobs/$id/retry'), headers: _headers);
    if (r.statusCode != 200) return null;
    return jsonDecode(r.body) as Map<String, dynamic>?;
  }

  Future<Map<String, dynamic>?> repoIssueJobCancel(String id) async {
    final r = await _http.post(_uri('repo-issue-jobs/$id/cancel'), headers: _headers);
    if (r.statusCode != 200) return null;
    return jsonDecode(r.body) as Map<String, dynamic>?;
  }

  // ---------------------------------------------------------------------------
  // Reports
  // ---------------------------------------------------------------------------

  Future<List<Map<String, dynamic>>?> reports({String? type, int limit = 30}) async {
    final q = <String, String>{'limit': '$limit'};
    if (type != null) q['report_type'] = type;
    final r = await _http.get(_uri('reports', q), headers: _headers);
    if (r.statusCode != 200) return null;
    final list = jsonDecode(r.body) as List<dynamic>?;
    return list?.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<Map<String, dynamic>?> report(String id) async {
    final r = await _http.get(_uri('reports/$id'), headers: _headers);
    if (r.statusCode != 200) return null;
    return jsonDecode(r.body) as Map<String, dynamic>?;
  }

  // ---------------------------------------------------------------------------
  // Learnings
  // ---------------------------------------------------------------------------

  Future<List<Map<String, dynamic>>?> learnings({String? category, int limit = 50}) async {
    final q = <String, String>{'limit': '$limit'};
    if (category != null) q['category'] = category;
    final r = await _http.get(_uri('learnings', q), headers: _headers);
    if (r.statusCode != 200) return null;
    final list = jsonDecode(r.body) as List<dynamic>?;
    return list?.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<Map<String, dynamic>?> learningExtract() async {
    final r = await _http.post(_uri('learnings/extract'), headers: _headers);
    if (r.statusCode != 200 && r.statusCode != 201 && r.statusCode != 202) return null;
    try {
      return jsonDecode(r.body) as Map<String, dynamic>?;
    } catch (_) {
      return {'ok': true};
    }
  }

  // ---------------------------------------------------------------------------
  // Opportunities
  // ---------------------------------------------------------------------------

  Future<Map<String, dynamic>?> opportunitiesStats() async {
    final r = await _http.get(_uri('opportunities/stats'), headers: _headers);
    if (r.statusCode != 200) return null;
    return jsonDecode(r.body) as Map<String, dynamic>?;
  }

  Future<List<Map<String, dynamic>>?> opportunities({String? status, double? minScore, int limit = 50}) async {
    final q = <String, String>{'limit': '$limit'};
    if (status != null) q['status'] = status;
    if (minScore != null) q['min_score'] = '$minScore';
    final r = await _http.get(_uri('opportunities', q), headers: _headers);
    if (r.statusCode != 200) return null;
    final list = jsonDecode(r.body) as List<dynamic>?;
    return list?.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<bool> opportunityShortlist(String id) async {
    final r = await _http.post(_uri('opportunities/$id/shortlist'), headers: _headers);
    return r.statusCode == 200;
  }

  Future<bool> opportunityIgnore(String id) async {
    final r = await _http.post(_uri('opportunities/$id/ignore'), headers: _headers);
    return r.statusCode == 200;
  }

  // ---------------------------------------------------------------------------
  // Submissions
  // ---------------------------------------------------------------------------

  Future<List<Map<String, dynamic>>?> submissions({String? status, int limit = 30}) async {
    final q = <String, String>{'limit': '$limit'};
    if (status != null) q['status'] = status;
    final r = await _http.get(_uri('submissions', q), headers: _headers);
    if (r.statusCode != 200) return null;
    final list = jsonDecode(r.body) as List<dynamic>?;
    return list?.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<bool> submissionApprove(String id) async {
    final r = await _http.post(_uri('submissions/$id/approve'), headers: _headers);
    return r.statusCode == 200;
  }

  Future<bool> submissionReject(String id) async {
    final r = await _http.post(_uri('submissions/$id/reject'), headers: _headers);
    return r.statusCode == 200;
  }
}
