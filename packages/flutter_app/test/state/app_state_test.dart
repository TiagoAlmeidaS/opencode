import 'package:faker_dart/faker_dart.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:flutter_app/state/app_state.dart';

void main() {
  final faker = Faker.instance;

  group('AppState', () {
    test('addServer adds config', () {
      final state = AppState();
      final url = 'http://${faker.internet.domainName()}:4096';
      state.addServer(ServerConfig(url: url));
      expect(state.servers.length, 1);
      expect(state.servers.first.url, url);
    });

    test('addServer replaces same url so apiToken updates', () {
      final state = AppState();
      final url = 'http://host:4096';
      state.addServer(ServerConfig(url: url));
      final tok = faker.datatype.uuid();
      state.addServer(ServerConfig(url: url, apiToken: tok));
      expect(state.servers.length, 1);
      expect(state.servers.first.apiToken, tok);
    });

    test('removeServer removes config', () {
      final state = AppState();
      final url = 'http://host:4096';
      state.addServer(ServerConfig(url: url));
      state.removeServer(url);
      expect(state.servers.length, 0);
    });

    test('setActive creates client', () {
      final state = AppState();
      final url = 'http://host:4096';
      state.addServer(ServerConfig(url: url));
      state.setActive(url);
      expect(state.client, isNotNull);
      expect(state.client!.baseUrl, url);
    });

    test('setActive with null clears client', () {
      final state = AppState();
      state.addServer(ServerConfig(url: 'http://host:4096'));
      state.setActive('http://host:4096');
      state.setActive(null);
      expect(state.client, isNull);
      expect(state.connected, false);
    });
  });

  group('ServerConfig', () {
    test('key equals url', () {
      final url = 'http://${faker.internet.domainName()}';
      final cfg = ServerConfig(url: url);
      expect(cfg.key, url);
    });
  });
}
