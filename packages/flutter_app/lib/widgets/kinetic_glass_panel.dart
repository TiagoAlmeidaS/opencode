import 'dart:ui';

import 'package:flutter/material.dart';

import '../theme/kinetic_theme.dart';
import '../theme/kinetic_tokens.dart';

/// Frosted glass panel (HTML `.glass-panel`): blur + semi-transparent fill.
class KineticGlassPanel extends StatelessWidget {
  const KineticGlassPanel({
    super.key,
    required this.child,
    this.padding,
    this.borderRadius,
    this.border,
  });

  final Widget child;
  final EdgeInsetsGeometry? padding;
  final double? borderRadius;
  final BoxBorder? border;

  @override
  Widget build(BuildContext context) {
    final ext = Theme.of(context).extension<KineticThemeExtension>() ?? KineticThemeExtension.dark;
    final r = borderRadius ?? KineticTokens.radiusLg;
    return ClipRRect(
      borderRadius: BorderRadius.circular(r),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: ext.blurSigma, sigmaY: ext.blurSigma),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: ext.glassFill,
            borderRadius: BorderRadius.circular(r),
            border: border ?? Border.all(color: Colors.white.withValues(alpha: 0.06)),
          ),
          child: Padding(
            padding: padding ?? EdgeInsets.zero,
            child: child,
          ),
        ),
      ),
    );
  }
}
