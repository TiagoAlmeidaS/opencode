import 'dart:ui';

import 'package:flutter/material.dart';

import '../theme/kinetic_theme.dart';
import '../theme/kinetic_tokens.dart';

/// Floating-style bottom bar: blur + rounded top (KINETIC shell).
class KineticBottomBarChrome extends StatelessWidget {
  const KineticBottomBarChrome({
    super.key,
    required this.child,
  });

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final ext = Theme.of(context).extension<KineticThemeExtension>() ?? KineticThemeExtension.dark;
    return ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(KineticTokens.radiusLg)),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: ext.blurSigma, sigmaY: ext.blurSigma),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: ext.navBarColor,
            border: Border(top: BorderSide(color: KineticTokens.primaryContainer.withValues(alpha: 0.08))),
            boxShadow: [
              BoxShadow(
                color: KineticTokens.primaryContainer.withValues(alpha: 0.06),
                blurRadius: 32,
                offset: const Offset(0, -8),
              ),
            ],
          ),
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.only(top: 6, bottom: 4),
              child: child,
            ),
          ),
        ),
      ),
    );
  }
}
