import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:flutter_app/main.dart';

void main() {
  testWidgets('OpenCode app loads connection screen', (WidgetTester tester) async {
    await tester.pumpWidget(const OpenCodeApp());
    expect(find.text('OpenCode'), findsOneWidget);
    expect(find.text('Connect to OpenCode Server'), findsOneWidget);
  });

  testWidgets('Connection screen has Connect button', (WidgetTester tester) async {
    await tester.pumpWidget(const OpenCodeApp());
    expect(find.text('Connect'), findsOneWidget);
  });
}
