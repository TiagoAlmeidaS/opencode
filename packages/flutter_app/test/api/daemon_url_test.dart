import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/api/daemon_url.dart';

void main() {
  group('normalizeDaemonApiBase', () {
    test('adds /api for host root', () {
      expect(normalizeDaemonApiBase('http://100.98.213.86:3000'), 'http://100.98.213.86:3000/api');
      expect(normalizeDaemonApiBase('http://100.98.213.86:3000/'), 'http://100.98.213.86:3000/api');
    });

    test('keeps /api', () {
      expect(normalizeDaemonApiBase('http://h:3000/api'), 'http://h:3000/api');
    });

    test('keeps /server path', () {
      expect(normalizeDaemonApiBase('http://h:4096/server'), 'http://h:4096/server');
    });
  });

  group('suggestDaemonApiBaseForOpenCodeUrl', () {
    test('null for localhost', () {
      expect(suggestDaemonApiBaseForOpenCodeUrl('http://localhost:4096'), isNull);
      expect(suggestDaemonApiBaseForOpenCodeUrl('http://127.0.0.1:4096'), isNull);
    });

    test('remote host port 3000 api', () {
      expect(
        suggestDaemonApiBaseForOpenCodeUrl('http://100.98.213.86:4096'),
        'http://100.98.213.86:3000/api',
      );
    });
  });

  group('resolveDaemonApiBase', () {
    test('configured wins', () {
      expect(
        resolveDaemonApiBase(
          openCodeUrl: 'http://100.98.213.86:4096',
          configuredDaemon: 'http://custom:3000',
        ),
        'http://custom:3000/api',
      );
    });

    test('fallback suggest for remote', () {
      expect(
        resolveDaemonApiBase(openCodeUrl: 'http://100.98.213.86:4096', configuredDaemon: null),
        'http://100.98.213.86:3000/api',
      );
    });

    test('no fallback for localhost', () {
      expect(
        resolveDaemonApiBase(openCodeUrl: 'http://localhost:4096', configuredDaemon: null),
        isNull,
      );
    });
  });
}
