import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'screens/connection_screen.dart';
import 'screens/main_layout.dart';
import 'services/notification_service.dart';
import 'state/app_state.dart';
import 'theme/opencode_theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await NotificationService.instance.init();
  await NotificationService.instance.requestPermission();
  runApp(const OpenCodeApp());
}

class OpenCodeApp extends StatelessWidget {
  const OpenCodeApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => AppState(),
      child: MaterialApp(
        title: 'OpenCode',
        theme: OpenCodeTheme.light,
        darkTheme: OpenCodeTheme.dark,
        themeMode: ThemeMode.system,
        initialRoute: '/',
        routes: {
          '/': (ctx) => const ConnectionScreen(),
          '/main': (ctx) => const MainLayout(),
        },
      ),
    );
  }
}
