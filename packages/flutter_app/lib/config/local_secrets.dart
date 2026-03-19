import 'dart:io';

import 'package:flutter/foundation.dart';

/// `API_TOKEN` for standalone `/api/*` (Bearer). Not used on web.
String? readApiTokenFromEnvServer() {
  if (kIsWeb) return null;
  final candidates = [
    File('../../.env.server'),
    File('../.env.server'),
    File('.env.server'),
  ];
  for (final f in candidates) {
    if (!f.existsSync()) continue;
    for (final line in f.readAsLinesSync()) {
      final t = line.trim();
      if (t.isEmpty || t.startsWith('#')) continue;
      if (!t.startsWith('API_TOKEN=')) continue;
      var v = t.substring('API_TOKEN='.length).trim();
      if (v.length >= 2) {
        final q0 = v.codeUnitAt(0);
        final q1 = v.codeUnitAt(v.length - 1);
        if (q0 == 0x22 && q1 == 0x22) v = v.substring(1, v.length - 1);
        if (q0 == 0x27 && q1 == 0x27) v = v.substring(1, v.length - 1);
      }
      if (v.isNotEmpty) return v;
    }
  }
  return null;
}

/// Build-time: `flutter run --dart-define=API_TOKEN=...`
String apiTokenFromDartDefine() {
  const v = String.fromEnvironment('API_TOKEN', defaultValue: '');
  return v.trim();
}

/// Prefer compile-time define, then repo `.env.server` (desktop dev).
String? defaultStandaloneApiToken() {
  final d = apiTokenFromDartDefine();
  if (d.isNotEmpty) return d;
  return readApiTokenFromEnvServer();
}
