import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

/// SSE client for GET /global/event.
/// Parses Server-Sent Events and yields decoded JSON payloads.
class SseClient {
  SseClient({
    required this.baseUrl,
    this.username,
    this.password,
  }) : _base = baseUrl.replaceFirst(RegExp(r'/+$'), '');

  final String baseUrl;
  final String? username;
  final String? password;
  final String _base;

  Map<String, String> get _headers {
    final h = {'Accept': 'text/event-stream'};
    if (username != null && password != null) {
      final cred = base64Encode(utf8.encode('$username:$password'));
      h['Authorization'] = 'Basic $cred';
    }
    return h;
  }

  /// Connects to /global/event and yields events.
  /// Each event has optional directory and payload (decoded JSON).
  Stream<GlobalEvent> connect({void Function(Object)? onError}) async* {
    final uri = Uri.parse('$_base/global/event');
    final req = http.Request('GET', uri)..headers.addAll(_headers);

    http.StreamedResponse response;
    try {
      response = await req.send();
    } catch (e) {
      onError?.call(e);
      return;
    }

    if (response.statusCode != 200) {
      onError?.call(Exception('SSE status ${response.statusCode}'));
      return;
    }

    String buffer = '';
    await for (final chunk in response.stream.transform(utf8.decoder)) {
      buffer += chunk;
      final lines = buffer.split('\n');
      buffer = lines.removeLast();

      String? eventType;
      String? data;
      for (final line in lines) {
        if (line.startsWith('event:')) {
          eventType = line.substring(6).trim();
        } else if (line.startsWith('data:')) {
          data = line.substring(5).trim();
        } else if (line.isEmpty && data != null) {
          try {
            final payload = data.isEmpty ? null : jsonDecode(data);
            yield GlobalEvent(
              type: eventType,
              directory: payload is Map ? payload['directory'] as String? : null,
              payload: payload,
            );
          } catch (_) {}
          data = null;
          eventType = null;
        }
      }
    }
  }
}

class GlobalEvent {
  GlobalEvent({this.type, this.directory, this.payload});

  final String? type;
  final String? directory;
  final dynamic payload;
}
