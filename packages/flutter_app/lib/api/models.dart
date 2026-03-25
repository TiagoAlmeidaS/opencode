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
    time: j['time'] != null
        ? SessionTime.fromJson(Map<String, dynamic>.from(j['time'] as Map))
        : null,
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
    final raw = j['parts'] as List<dynamic>? ?? info['parts'] as List<dynamic>?;
    return Message(
      id: info['id'] as String? ?? '',
      role: info['role'] as String?,
      parts: raw
          ?.map(
            (e) => e is Part
                ? e
                : Part.fromJson(Map<String, dynamic>.from(e as Map)),
          )
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
  FileNode({
    required this.name,
    required this.path,
    required this.absolute,
    required this.type,
    this.ignored = false,
  });

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
  FileContent({
    required this.type,
    required this.content,
    this.diff,
    this.mimeType,
  });

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
    this.revenueUsd30d,
    this.goalsActive,
    this.goalsAtRisk,
    this.contentPublishedLast7d,
    this.serverStartedAt,
    this.jobsCompletedLast12h,
    this.loadIndex,
    this.jobsLastHour,
    this.jobsPerHourAvg12h,
    this.chartHighlightSlot,
  });

  factory ServerStatus.fromJson(Map<String, dynamic> j) {
    final pip = j['pipelines'] as Map<String, dynamic>? ?? {};
    final jobs = j['jobs'] as Map<String, dynamic>? ?? {};
    final props = j['proposals'] as Map<String, dynamic>? ?? {};
    final rev = j['revenue'] as Map<String, dynamic>? ?? {};
    final goals = j['goals'] as Map<String, dynamic>? ?? {};
    final content = j['content'] as Map<String, dynamic>? ?? {};
    final server = j['server'] as Map<String, dynamic>? ?? {};
    final metrics = j['metrics'] as Map<String, dynamic>? ?? {};
    final spark = metrics['jobs_completed_last_12h'];
    List<int>? last12;
    if (spark is List) {
      last12 = spark.map((e) => (e as num).toInt()).toList();
    }
    return ServerStatus(
      pipelinesTotal: (pip['total'] as num?)?.toInt(),
      pipelinesEnabled: (pip['enabled'] as num?)?.toInt(),
      jobsRunning: (jobs['running'] as num?)?.toInt(),
      proposalsPending: (props['pending'] as num?)?.toInt(),
      revenueUsd30d: (rev['total_usd_30d'] as num?)?.toDouble(),
      goalsActive: (goals['active'] as num?)?.toInt(),
      goalsAtRisk: (goals['at_risk'] as num?)?.toInt(),
      contentPublishedLast7d: (content['published_last_7d'] as num?)?.toInt(),
      serverStartedAt: (server['started_at'] as num?)?.toInt(),
      jobsCompletedLast12h: last12,
      loadIndex: (metrics['load_index'] as num?)?.toDouble(),
      jobsLastHour: (metrics['jobs_last_hour'] as num?)?.toInt(),
      jobsPerHourAvg12h: (metrics['jobs_per_hour_avg_12h'] as num?)?.toDouble(),
      chartHighlightSlot: (metrics['chart_highlight_slot'] as num?)?.toInt(),
    );
  }

  final int? pipelinesTotal;
  final int? pipelinesEnabled;
  final int? jobsRunning;
  final int? proposalsPending;
  final double? revenueUsd30d;
  final int? goalsActive;
  final int? goalsAtRisk;
  final int? contentPublishedLast7d;
  final int? serverStartedAt;
  final List<int>? jobsCompletedLast12h;
  final double? loadIndex;
  final int? jobsLastHour;
  final double? jobsPerHourAvg12h;
  final int? chartHighlightSlot;
}

/// Discovery report from project/venture idea validation.
class DiscoveryReport {
  DiscoveryReport({
    required this.id,
    required this.ideaText,
    this.description,
    required this.status,
    this.reportJson,
    this.sessionId,
    this.jobId,
    required this.createdAt,
    this.updatedAt,
  });

  factory DiscoveryReport.fromJson(Map<String, dynamic> j) => DiscoveryReport(
    id: j['id'] as String? ?? '',
    ideaText: j['idea_text'] as String? ?? '',
    description: j['description'] as String?,
    status: DiscoveryStatus.fromJson(j['status'] as String? ?? 'pending'),
    reportJson: j['report_json'] as String?,
    sessionId: j['session_id'] as String?,
    jobId: j['job_id'] as String?,
    createdAt: (j['created_at'] as num?)?.toInt(),
    updatedAt: (j['updated_at'] as num?)?.toInt(),
  );

  final String id;
  final String ideaText;
  final String? description;
  final DiscoveryStatus status;
  final String? reportJson;
  final String? sessionId;
  final String? jobId;
  final int? createdAt;
  final int? updatedAt;
}

enum DiscoveryStatus {
  pending,
  completed,
  failed;

  factory DiscoveryStatus.fromJson(String? json) {
    switch (json?.toLowerCase()) {
      case 'pending':
        return DiscoveryStatus.pending;
      case 'completed':
        return DiscoveryStatus.completed;
      case 'failed':
        return DiscoveryStatus.failed;
      default:
        return DiscoveryStatus.pending;
    }
  }

  String toJson() {
    return toString().split('.').last;
  }
}

/// One selectable model from [GET /config/providers] (`id` = `provider/model`).
class LlmModelChoice {
  LlmModelChoice({required this.id, required this.label});

  final String id;
  final String label;

  static List<LlmModelChoice> fromProvidersBody(Map<String, dynamic> body) {
    final out = <LlmModelChoice>[];
    final list = body['providers'];
    if (list is! List<dynamic>) return out;
    for (final item in list) {
      if (item is! Map) continue;
      final pid = item['id']?.toString();
      if (pid == null || pid.isEmpty) continue;
      final models = item['models'];
      if (models is! Map) continue;
      for (final e in models.entries) {
        final mid = e.key.toString();
        var label = mid;
        final v = e.value;
        if (v is Map && v['name'] != null) label = v['name'].toString();
        out.add(LlmModelChoice(id: '$pid/$mid', label: '$label · $pid'));
      }
    }
    out.sort((a, b) => a.label.compareTo(b.label));
    return out;
  }
}
