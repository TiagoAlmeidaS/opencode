import 'dart:convert';

import 'package:http/http.dart' as http;

/// Lists repos for a GitHub PAT (mobile → GitHub API only; token is not sent to OpenCode until add).
class GithubApi {
  GithubApi({http.Client? client}) : _http = client ?? http.Client();

  final http.Client _http;

  static const _ua = 'OpenCodeFlutter/1';

  /// Recent repos the token can access (first page, up to [perPage]).
  Future<({List<GithubRepoBrief> repos, String? error})> listRepos(String pat, {int perPage = 100}) async {
    final t = pat.trim();
    if (t.isEmpty) return (repos: <GithubRepoBrief>[], error: 'Token is empty');
    final uri = Uri.parse('https://api.github.com/user/repos').replace(
      queryParameters: {'per_page': '$perPage', 'sort': 'updated'},
    );
    final r = await _http.get(
      uri,
      headers: {
        'Authorization': 'Bearer $t',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': _ua,
      },
    );
    if (r.statusCode == 401 || r.statusCode == 403) {
      return (repos: <GithubRepoBrief>[], error: 'Invalid or expired token (repo scope required)');
    }
    if (r.statusCode != 200) {
      return (repos: <GithubRepoBrief>[], error: 'GitHub API HTTP ${r.statusCode}');
    }
    final b = r.body.trimLeft();
    if (!b.startsWith('[')) return (repos: <GithubRepoBrief>[], error: 'Unexpected response');
    try {
      final raw = jsonDecode(r.body) as List<dynamic>;
      final out = <GithubRepoBrief>[];
      for (final e in raw) {
        if (e is! Map) continue;
        final m = Map<String, dynamic>.from(e);
        final full = m['full_name'] as String?;
        if (full == null) continue;
        out.add(GithubRepoBrief(
          fullName: full,
          htmlUrl: m['html_url'] as String? ?? 'https://github.com/$full',
          private: m['private'] as bool? ?? false,
        ));
      }
      return (repos: out, error: null);
    } catch (_) {
      return (repos: <GithubRepoBrief>[], error: 'Could not parse repo list');
    }
  }
}

class GithubRepoBrief {
  GithubRepoBrief({required this.fullName, required this.htmlUrl, required this.private});

  final String fullName;
  final String htmlUrl;
  final bool private;
}
