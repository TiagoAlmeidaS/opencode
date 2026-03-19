/// Normalizes standalone daemon base URLs for [OpenCodeClient.daemonApiBase].
///
/// - `http://host:3000` → `http://host:3000/api`
/// - `http://host:3000/api` → `http://host:3000/api`
/// - `http://host:4096/server` → OpenCode daemon on same host
String normalizeDaemonApiBase(String raw) {
  var s = raw.trim();
  if (s.isEmpty) return '';
  s = s.replaceAll(RegExp(r'/+$'), '');
  final u = Uri.tryParse(s);
  if (u == null || !u.hasScheme || u.host.isEmpty) return s;
  final origin = u.origin;
  final segs = u.pathSegments.where((e) => e.isNotEmpty).toList();
  if (segs.isEmpty) {
    return '$origin/api';
  }
  if (segs.length == 1 && segs[0] == 'api') {
    return '$origin/api';
  }
  if (segs.isNotEmpty && segs.last == 'server') {
    return '$origin/${segs.join('/')}';
  }
  return s;
}

/// Suggested standalone [packages/server] API base when OpenCode runs on a remote host.
String? suggestDaemonApiBaseForOpenCodeUrl(String openCodeUrl) {
  final u = Uri.tryParse(openCodeUrl.trim());
  if (u == null || !u.hasScheme || u.host.isEmpty) return null;
  final h = u.host.toLowerCase();
  if (h == 'localhost' || h == '127.0.0.1' || h == '::1') return null;
  return '${u.scheme}://${u.host}:3000/api';
}

/// User override or [suggestDaemonApiBaseForOpenCodeUrl] for remotes.
String? resolveDaemonApiBase({required String openCodeUrl, String? configuredDaemon}) {
  final c = configuredDaemon?.trim();
  if (c != null && c.isNotEmpty) {
    final n = normalizeDaemonApiBase(c);
    return n.isEmpty ? null : n;
  }
  final s = suggestDaemonApiBaseForOpenCodeUrl(openCodeUrl);
  if (s == null) return null;
  return normalizeDaemonApiBase(s);
}
