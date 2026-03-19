/// API models aligned with OpenCode Server responses.
class PathInfo {
  PathInfo({
    required this.state,
    required this.config,
    required this.worktree,
    required this.directory,
    required this.home,
  });

  factory PathInfo.fromJson(Map<String, dynamic> j) => PathInfo(
        state: j['state'] as String? ?? '',
        config: j['config'] as String? ?? '',
        worktree: j['worktree'] as String? ?? '',
        directory: j['directory'] as String? ?? '',
        home: j['home'] as String? ?? '',
      );

  final String state;
  final String config;
  final String worktree;
  final String directory;
  final String home;
}

class HealthInfo {
  HealthInfo({required this.healthy, this.version});

  factory HealthInfo.fromJson(Map<String, dynamic> j) => HealthInfo(
        healthy: j['healthy'] as bool? ?? false,
        version: j['version'] as String?,
      );

  final bool healthy;
  final String? version;
}

class Project {
  Project({
    required this.id,
    required this.worktree,
    this.name,
    this.sandboxes,
  });

  factory Project.fromJson(Map<String, dynamic> j) => Project(
        id: j['id'] as String? ?? '',
        worktree: j['worktree'] as String? ?? '',
        name: j['name'] as String?,
        sandboxes: (j['sandboxes'] as List<dynamic>?)
            ?.map((e) => e as String)
            .toList(),
      );

  final String id;
  final String worktree;
  final String? name;
  final List<String>? sandboxes;
}

class Session {
  Session({
    required this.id,
    required this.directory,
    this.title,
    this.parentID,
    this.time,
  });

  factory Session.fromJson(Map<String, dynamic> j) => Session(
        id: j['id'] as String? ?? '',
        directory: j['directory'] as String? ?? '',
        title: j['title'] as String?,
        parentID: j['parentID'] as String?,
        time: j['time'] != null ? SessionTime.fromJson(Map<String, dynamic>.from(j['time'] as Map)) : null,
      );

  final String id;
  final String directory;
  final String? title;
  final String? parentID;
  final SessionTime? time;
}

class SessionTime {
  SessionTime({this.created, this.updated, this.archived});

  factory SessionTime.fromJson(Map<String, dynamic> j) => SessionTime(
        created: j['created'] as int?,
        updated: j['updated'] as int?,
        archived: j['archived'] as int?,
      );

  final int? created;
  final int? updated;
  final int? archived;
}

class Message {
  Message({required this.id, this.role, this.parts});

  factory Message.fromJson(Map<String, dynamic> j) {
    final info = j['info'] as Map<String, dynamic>? ?? j;
    return Message(
      id: info['id'] as String? ?? '',
      role: info['role'] as String?,
      parts: (j['parts'] as List<dynamic>? ?? info['parts'] as List<dynamic>?)
          ?.map((e) => Part.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList(),
    );
  }

  final String id;
  final String? role;
  final List<Part>? parts;
}

class Part {
  Part({required this.id, this.type, this.text});

  factory Part.fromJson(Map<String, dynamic> j) => Part(
        id: j['id'] as String? ?? '',
        type: j['type'] as String?,
        text: j['text'] as String?,
      );

  final String id;
  final String? type;
  final String? text;
}

class PtyInfo {
  PtyInfo({required this.id, this.directory, this.sessionID});

  factory PtyInfo.fromJson(Map<String, dynamic> j) => PtyInfo(
        id: j['id'] as String? ?? '',
        directory: j['directory'] as String?,
        sessionID: j['sessionID'] as String?,
      );

  final String id;
  final String? directory;
  final String? sessionID;
}

class FileNode {
  FileNode({required this.name, required this.path, required this.absolute, required this.type, this.ignored = false});

  factory FileNode.fromJson(Map<String, dynamic> j) => FileNode(
        name: j['name'] as String? ?? '',
        path: j['path'] as String? ?? '',
        absolute: j['absolute'] as String? ?? '',
        type: j['type'] as String? ?? 'file',
        ignored: j['ignored'] as bool? ?? false,
      );

  final String name;
  final String path;
  final String absolute;
  final String type;
  final bool ignored;
}

class FileContent {
  FileContent({required this.type, required this.content, this.diff, this.mimeType});

  factory FileContent.fromJson(Map<String, dynamic> j) => FileContent(
        type: j['type'] as String? ?? 'text',
        content: j['content'] as String? ?? '',
        diff: j['diff'] as String?,
        mimeType: j['mimeType'] as String?,
      );

  final String type;
  final String content;
  final String? diff;
  final String? mimeType;
}

class FileStatusEntry {
  FileStatusEntry({required this.path, this.status, this.added, this.removed});

  factory FileStatusEntry.fromJson(Map<String, dynamic> j) => FileStatusEntry(
        path: j['path'] as String? ?? '',
        status: j['status'] as String?,
        added: j['added'] as int?,
        removed: j['removed'] as int?,
      );

  final String path;
  final String? status;
  final int? added;
  final int? removed;
}

class ServerStatus {
  ServerStatus({
    this.pipelinesTotal,
    this.pipelinesEnabled,
    this.jobsRunning,
    this.proposalsPending,
  });

  factory ServerStatus.fromJson(Map<String, dynamic> j) => ServerStatus(
        pipelinesTotal: j['pipelinesTotal'] as int?,
        pipelinesEnabled: j['pipelinesEnabled'] as int?,
        jobsRunning: j['jobsRunning'] as int?,
        proposalsPending: j['proposalsPending'] as int?,
      );

  final int? pipelinesTotal;
  final int? pipelinesEnabled;
  final int? jobsRunning;
  final int? proposalsPending;
}
