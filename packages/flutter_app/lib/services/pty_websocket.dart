import 'dart:async';

import 'package:web_socket_channel/web_socket_channel.dart';

/// WebSocket client for PTY connect.
/// Sends/receives text for terminal I/O.
class PtyWebSocket {
  PtyWebSocket(this.url, {this.username, this.password});

  final String url;
  final String? username;
  final String? password;

  WebSocketChannel? _channel;
  StreamSubscription? _sub;

  Stream<String> get stream => _controller.stream;
  final _controller = StreamController<String>.broadcast();

  bool get isConnected => _channel != null;

  Future<void> connect() async {
    if (_channel != null) return;

    var wsUrl = url;
    if (username != null && password != null) {
      final auth = '$username:$password';
      final encoded = Uri.encodeComponent(auth);
      final sep = wsUrl.contains('?') ? '&' : '?';
      wsUrl = '$wsUrl${sep}auth=$encoded';
    }

    _channel = WebSocketChannel.connect(Uri.parse(wsUrl));
    _sub = _channel!.stream.listen(
      (data) {
        if (data is String) _controller.add(data);
      },
      onError: _controller.addError,
      onDone: () => _channel = null,
      cancelOnError: false,
    );
  }

  void send(String text) {
    _channel?.sink.add(text);
  }

  Future<void> close() async {
    await _sub?.cancel();
    await _channel?.sink.close();
    _channel = null;
    await _controller.close();
  }
}
