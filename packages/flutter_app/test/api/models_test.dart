import 'package:faker_dart/faker_dart.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:flutter_app/api/models.dart';

void main() {
  final faker = Faker.instance;

  String word() => faker.lorem.word();
  String uuid() => faker.datatype.uuid();
  int num(int min, int max) => faker.datatype.number(min: min, max: max);
  T pick<T>(List<T> list) => list[num(0, list.length - 1)];

  group('PathInfo', () {
    test('fromJson with fake data', () {
      final state = uuid();
      final config = faker.internet.domainName();
      final worktree = '/$word/$word';
      final directory = '$worktree/$word';
      final home = '/home/${faker.name.firstName().toLowerCase()}';

      final j = {
        'state': state,
        'config': config,
        'worktree': worktree,
        'directory': directory,
        'home': home,
      };

      final p = PathInfo.fromJson(j);
      expect(p.state, state);
      expect(p.config, config);
      expect(p.worktree, worktree);
      expect(p.directory, directory);
      expect(p.home, home);
    });

    test('fromJson with null values uses empty string', () {
      final p = PathInfo.fromJson({});
      expect(p.state, '');
      expect(p.config, '');
      expect(p.worktree, '');
      expect(p.directory, '');
      expect(p.home, '');
    });
  });

  group('HealthInfo', () {
    test('fromJson with fake data', () {
      final version = '${num(1, 9)}.${num(0, 9)}.${num(0, 9)}';
      final j = {'healthy': true, 'version': version};
      final h = HealthInfo.fromJson(j);
      expect(h.healthy, true);
      expect(h.version, version);
    });

    test('fromJson with missing fields', () {
      final h = HealthInfo.fromJson({});
      expect(h.healthy, false);
      expect(h.version, isNull);
    });
  });

  group('Project', () {
    test('fromJson with fake data', () {
      final id = uuid();
      final worktree = '/tmp/$word';
      final name = faker.company.companyName();
      final sandboxes = [word(), word()];

      final j = {
        'id': id,
        'worktree': worktree,
        'name': name,
        'sandboxes': sandboxes,
      };
      final p = Project.fromJson(j);
      expect(p.id, id);
      expect(p.worktree, worktree);
      expect(p.name, name);
      expect(p.sandboxes, sandboxes);
    });
  });

  group('Session', () {
    test('fromJson with fake data', () {
      final id = uuid();
      final directory = '/tmp/$word';
      final title = faker.lorem.sentence();
      final parentID = uuid();
      final created = num(1000000, 9999999);

      final j = {
        'id': id,
        'directory': directory,
        'title': title,
        'parentID': parentID,
        'time': {
          'created': created,
          'updated': created + 100,
          'archived': null,
        },
      };

      final s = Session.fromJson(j);
      expect(s.id, id);
      expect(s.directory, directory);
      expect(s.title, title);
      expect(s.parentID, parentID);
      expect(s.time?.created, created);
    });
  });

  group('Message', () {
    test('fromJson with info and parts', () {
      final id = uuid();
      final role = pick(['user', 'assistant']);
      final text = faker.lorem.sentence();
      final partId = uuid();

      final j = {
        'info': {'id': id, 'role': role},
        'parts': [
          {'id': partId, 'type': 'text', 'text': text},
        ],
      };

      final m = Message.fromJson(j);
      expect(m.id, id);
      expect(m.role, role);
      expect(m.parts?.length, 1);
      expect(m.parts?.first.text, text);
    });

    test('fromJson accepts prebuilt Part list (session screen path)', () {
      final id = uuid();
      final p = Part(id: uuid(), type: 'text', text: 'hi');
      final m = Message.fromJson({
        'id': id,
        'role': 'assistant',
        'parts': [p],
      });
      expect(m.parts?.single.text, 'hi');
    });
  });

  group('Part', () {
    test('fromJson with fake data', () {
      final id = uuid();
      final type = 'text';
      final text = faker.lorem.paragraph();

      final j = {'id': id, 'type': type, 'text': text};
      final p = Part.fromJson(j);
      expect(p.id, id);
      expect(p.type, type);
      expect(p.text, text);
    });
  });

  group('PtyInfo', () {
    test('fromJson with fake data', () {
      final id = uuid();
      final directory = '/tmp/$word';
      final sessionID = uuid();

      final j = {'id': id, 'directory': directory, 'sessionID': sessionID};
      final p = PtyInfo.fromJson(j);
      expect(p.id, id);
      expect(p.directory, directory);
      expect(p.sessionID, sessionID);
    });
  });

  group('FileNode', () {
    test('fromJson with fake data', () {
      final name = '${word()}.txt';
      final path = '$word/$name';
      final absolute = '/home/${faker.name.firstName().toLowerCase()}/$path';
      final type = pick(['file', 'directory']);
      final ignored = faker.datatype.boolean();

      final j = {
        'name': name,
        'path': path,
        'absolute': absolute,
        'type': type,
        'ignored': ignored,
      };
      final n = FileNode.fromJson(j);
      expect(n.name, name);
      expect(n.path, path);
      expect(n.absolute, absolute);
      expect(n.type, type);
      expect(n.ignored, ignored);
    });
  });

  group('FileContent', () {
    test('fromJson with fake data', () {
      final content = faker.lorem.text(paragraphCount: 2);
      final mimeType = 'text/plain';

      final j = {'type': 'text', 'content': content, 'mimeType': mimeType};
      final fc = FileContent.fromJson(j);
      expect(fc.type, 'text');
      expect(fc.content, content);
      expect(fc.mimeType, mimeType);
    });
  });

  group('FileStatusEntry', () {
    test('fromJson with fake data', () {
      final path = '$word/${word()}.dart';
      final status = pick(['added', 'modified', 'deleted']);
      final added = num(0, 10);
      final removed = num(0, 5);

      final j = {
        'path': path,
        'status': status,
        'added': added,
        'removed': removed,
      };
      final e = FileStatusEntry.fromJson(j);
      expect(e.path, path);
      expect(e.status, status);
      expect(e.added, added);
      expect(e.removed, removed);
    });
  });

  group('ServerStatus', () {
    test('fromJson with fake data', () {
      final total = num(1, 20);
      final enabled = num(0, total);
      final running = num(0, 5);
      final pending = num(0, 10);

      final j = {
        'pipelines': {'total': total, 'enabled': enabled},
        'jobs': {'running': running},
        'proposals': {'pending': pending},
      };

      final s = ServerStatus.fromJson(j);
      expect(s.pipelinesTotal, total);
      expect(s.pipelinesEnabled, enabled);
      expect(s.jobsRunning, running);
      expect(s.proposalsPending, pending);
    });
  });

  group('LlmModelChoice', () {
    test(
      'fromProvidersBody builds provider/model ids with faker-shaped payload',
      () {
        final pid = faker.lorem.word();
        final mid = word();
        final name = faker.company.companyName();
        final body = {
          'providers': [
            {
              'id': pid,
              'models': {
                mid: {'name': name},
              },
            },
          ],
          'default': {pid: mid},
        };
        final list = LlmModelChoice.fromProvidersBody(body);
        expect(list.length, 1);
        expect(list.first.id, '$pid/$mid');
        expect(list.first.label, contains(name));
        expect(list.first.label, contains(pid));
      },
    );
  });
}
