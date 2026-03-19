import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:flutter_app/services/github_api.dart';

void main() {
  test('listRepos parses entries', () async {
    final mock = MockClient((req) async {
      expect(req.url.host, 'api.github.com');
      expect(req.headers['authorization'], 'Bearer mypat');
      return http.Response(
        jsonEncode([
          {
            'full_name': 'org/app',
            'html_url': 'https://github.com/org/app',
            'private': true,
          },
        ]),
        200,
      );
    });
    final api = GithubApi(client: mock);
    final out = await api.listRepos('mypat');
    expect(out.error, isNull);
    expect(out.repos.length, 1);
    expect(out.repos.first.fullName, 'org/app');
    expect(out.repos.first.private, true);
  });

  test('listRepos 401 yields error', () async {
    final api = GithubApi(
      client: MockClient((_) async => http.Response('{}', 401)),
    );
    final out = await api.listRepos('bad');
    expect(out.repos, isEmpty);
    expect(out.error, isNotNull);
  });
}
