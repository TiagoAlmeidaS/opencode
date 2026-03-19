import 'dart:convert';

import 'package:faker_dart/faker_dart.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:flutter_app/api/models.dart';
import 'package:flutter_app/api/opencode_client.dart';

void main() {
  final faker = Faker.instance;

  OpenCodeClient clientWithMock(http.Client mock) => OpenCodeClient(
        baseUrl: 'http://test',
        client: mock,
      );

  group('OpenCodeClient', () {
    test('health returns HealthInfo when healthy', () async {
      final version = '${faker.datatype.number(min: 1, max: 9)}.0.0';
      final client = clientWithMock(MockClient((req) async {
        expect(req.url.path, '/global/health');
        return http.Response(jsonEncode({'healthy': true, 'version': version}), 200);
      }));

      final h = await client.health();
      expect(h, isNotNull);
      expect(h!.healthy, true);
      expect(h.version, version);
    });

    test('health returns null on non-200', () async {
      final client = clientWithMock(MockClient((_) async => http.Response('', 500)));
      expect(await client.health(), isNull);
    });

    test('path returns PathInfo', () async {
      final worktree = '/tmp/${faker.lorem.word()}';
      final client = clientWithMock(MockClient((req) async {
        expect(req.url.path, '/path');
        return http.Response(
          jsonEncode({
            'state': 'ok',
            'config': '/cfg',
            'worktree': worktree,
            'directory': worktree,
            'home': '/home',
          }),
          200,
        );
      }));

      final p = await client.path();
      expect(p, isNotNull);
      expect(p!.worktree, worktree);
    });

    test('projectList returns list', () async {
      final id = faker.datatype.uuid();
      final worktree = '/tmp/${faker.lorem.word()}';
      final client = clientWithMock(MockClient((req) async {
        expect(req.url.path, '/project');
        return http.Response(jsonEncode([{'id': id, 'worktree': worktree}]), 200);
      }));

      final list = await client.projectList();
      expect(list, isNotNull);
      expect(list!.length, 1);
      expect(list.first.id, id);
      expect(list.first.worktree, worktree);
    });

    test('projectAddByUrl returns Project', () async {
      final id = faker.datatype.uuid();
      final worktree = '/tmp/repo';
      final url = 'https://github.com/owner/repo';
      final client = clientWithMock(MockClient((req) async {
        expect(req.url.path, '/project/add-by-url');
        expect(req.method, 'POST');
        final body = jsonDecode(req.body) as Map<String, dynamic>;
        expect(body['url'], url);
        return http.Response(jsonEncode({'id': id, 'worktree': worktree}), 200);
      }));

      final p = await client.projectAddByUrl(url);
      expect(p, isNotNull);
      expect(p!.id, id);
      expect(p.worktree, worktree);
    });

    test('sessionList returns list', () async {
      final id = faker.datatype.uuid();
      final dir = '/tmp/${faker.lorem.word()}';
      final client = clientWithMock(MockClient((req) async {
        expect(req.url.path, '/session');
        expect(req.url.queryParameters['directory'], dir);
        return http.Response(
          jsonEncode([{'id': id, 'directory': dir, 'title': 'Session'}]),
          200,
        );
      }));

      final list = await client.sessionList(dir);
      expect(list, isNotNull);
      expect(list!.length, 1);
      expect(list.first.id, id);
    });

    test('sessionPrompt sends correct body', () async {
      final dir = '/tmp/proj';
      final sid = faker.datatype.uuid();
      final text = faker.lorem.sentence();
      final client = clientWithMock(MockClient((req) async {
        expect(req.url.path, '/session/$sid/message');
        expect(req.method, 'POST');
        final body = jsonDecode(req.body) as Map<String, dynamic>;
        expect(body['parts'], isNotNull);
        expect((body['parts'] as List).first['text'], text);
        return http.Response('', 200);
      }));

      final ok = await client.sessionPrompt(dir, sid, text);
      expect(ok, true);
    });

    test('ptyConnectUrl converts http to ws', () {
      final client = OpenCodeClient(baseUrl: 'http://host:4096');
      expect(client.ptyConnectUrl('abc'), 'ws://host:4096/pty/abc/connect');
    });

    test('ptyConnectUrl converts https to wss', () {
      final client = OpenCodeClient(baseUrl: 'https://host:4096');
      expect(client.ptyConnectUrl('xyz'), 'wss://host:4096/pty/xyz/connect');
    });

    test('fileFind returns paths', () async {
      final dir = '/tmp/proj';
      final query = faker.lorem.word();
      final paths = ['src/main.dart', 'lib/foo.dart'];
      final client = clientWithMock(MockClient((req) async {
        expect(req.url.path, '/find/file');
        expect(req.url.queryParameters['query'], query);
        return http.Response(jsonEncode(paths), 200);
      }));

      final list = await client.fileFind(dir, query: query);
      expect(list, paths);
    });

    test('fileRead returns FileContent', () async {
      final dir = '/tmp/proj';
      final path = 'lib/main.dart';
      final content = faker.lorem.paragraph();
      final client = clientWithMock(MockClient((req) async {
        expect(req.url.path, '/file/content');
        expect(req.url.queryParameters['path'], path);
        return http.Response(jsonEncode({'type': 'text', 'content': content}), 200);
      }));

      final fc = await client.fileRead(dir, path: path);
      expect(fc, isNotNull);
      expect(fc!.content, content);
    });
  });
}
