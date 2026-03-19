import 'dart:convert';

import 'package:faker_dart/faker_dart.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:flutter_app/api/server_api_client.dart';

void main() {
  final faker = Faker.instance;

  Map<String, dynamic> _statusJson({int total = 0, int enabled = 0}) => {
        'pipelines': {'total': total, 'enabled': enabled},
        'jobs': {'running': 0},
        'proposals': {'pending': 0},
      };

  group('ServerApiClient', () {
    test('status sends Bearer and hits correct URL', () async {
      final tok = faker.datatype.uuid();
      final srv = ServerApiClient(
        baseUrl: 'http://stand:3000/api',
        token: tok,
        client: MockClient((req) async {
          expect(req.url.toString(), 'http://stand:3000/api/status');
          expect(req.headers['authorization'], 'Bearer $tok');
          return http.Response(jsonEncode(_statusJson(total: 2, enabled: 1)), 200);
        }),
      );

      final s = await srv.status();
      expect(s, isNotNull);
      expect(s!.pipelinesTotal, 2);
      expect(s.pipelinesEnabled, 1);
    });

    test('no auth header when token is null', () async {
      final srv = ServerApiClient(
        baseUrl: 'http://stand:3000',
        client: MockClient((req) async {
          expect(req.headers['authorization'], isNull);
          return http.Response(jsonEncode(_statusJson()), 200);
        }),
      );
      await srv.status();
    });

    test('token with Bearer prefix is cleaned', () async {
      final srv = ServerApiClient(
        baseUrl: 'http://stand:3000/api',
        token: 'Bearer abc-token',
        client: MockClient((req) async {
          expect(req.headers['authorization'], 'Bearer abc-token');
          return http.Response(jsonEncode(_statusJson()), 200);
        }),
      );
      await srv.status();
    });

    test('dashboard memory discovery', () async {
      final srv = ServerApiClient(
        baseUrl: 'http://stand:3000/api',
        client: MockClient((req) async {
          if (req.url.path == '/api/dashboard') {
            return http.Response(jsonEncode({'health': 'HEALTHY', 'metrics': {}}), 200);
          }
          if (req.url.path == '/api/memory/retrieve') {
            return http.Response(jsonEncode({'chunks': []}), 200);
          }
          if (req.url.path == '/api/discovery' && req.method == 'GET') {
            return http.Response(jsonEncode([]), 200);
          }
          if (req.url.path == '/api/discovery' && req.method == 'POST') {
            return http.Response(jsonEncode({'id': 'n1', 'status': 'pending'}), 201);
          }
          return http.Response('', 404);
        }),
      );

      expect((await srv.dashboard())?['health'], 'HEALTHY');
      expect((await srv.memory('q'))?['chunks'], isList);
      expect(await srv.discovery(), isEmpty);
      expect((await srv.discoveryEnqueue('idea'))?['id'], 'n1');
    });

    test('pipelines and jobs', () async {
      final pid = faker.datatype.uuid();
      final srv = ServerApiClient(
        baseUrl: 'http://stand:3000/api',
        token: 'tok',
        client: MockClient((req) async {
          if (req.url.path == '/api/pipelines' && req.method == 'GET') {
            return http.Response(jsonEncode([
              {'id': pid, 'name': 'p1'}
            ]), 200);
          }
          if (req.url.path == '/api/jobs') {
            return http.Response(jsonEncode([]), 200);
          }
          if (req.url.path == '/api/pipelines/$pid/run') {
            return http.Response(jsonEncode({'jobId': 'j1'}), 202);
          }
          return http.Response('', 404);
        }),
      );

      final pipes = await srv.pipelines();
      expect(pipes?.length, 1);
      expect(pipes!.first['id'], pid);

      final jobs = await srv.jobs();
      expect(jobs, isEmpty);

      final run = await srv.pipelineRun(pid);
      expect(run?['ok'], true);
    });

    test('normalizes base URL without /api suffix', () async {
      final srv = ServerApiClient(
        baseUrl: 'http://stand:3000',
        client: MockClient((req) async {
          expect(req.url.toString(), startsWith('http://stand:3000/api/'));
          return http.Response(jsonEncode(_statusJson()), 200);
        }),
      );
      await srv.status();
    });

    test('hasToken reflects token presence', () {
      final with_ = ServerApiClient(baseUrl: 'http://h:3000', token: 'abc');
      final without = ServerApiClient(baseUrl: 'http://h:3000');
      expect(with_.hasToken, true);
      expect(without.hasToken, false);
    });
  });

  group('detectServerToken', () {
    test('extracts token from injected script', () async {
      final tok = faker.datatype.uuid();
      final html = '<html><head>'
          '<script>try{localStorage.setItem("api_token","$tok")}catch(e){}</script>'
          '</head><body></body></html>';
      final mock = MockClient((_) async => http.Response(html, 200));
      final result = await detectServerToken('http://host:3000', client: mock);
      expect(result, tok);
    });

    test('returns null when no script injected', () async {
      final mock = MockClient((_) async => http.Response('<html></html>', 200));
      final result = await detectServerToken('http://host:3000', client: mock);
      expect(result, isNull);
    });

    test('returns null on non-200', () async {
      final mock = MockClient((_) async => http.Response('', 404));
      final result = await detectServerToken('http://host:3000', client: mock);
      expect(result, isNull);
    });
  });
}
