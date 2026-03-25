import 'package:flutter/material.dart';

/// KINETIC design tokens (HTML prototype / Tailwind extend colors).
/// Single source for dark cyber UI: surfaces, neon cyan, glass, radii.
abstract final class KineticTokens {
  KineticTokens._();

  // --- Surfaces (Tailwind theme.extend.colors) ---
  static const Color surfaceContainerLowest = Color(0xFF0A0E14);
  static const Color background = Color(0xFF10141A);
  static const Color surface = Color(0xFF10141A);
  static const Color surfaceDim = Color(0xFF10141A);
  static const Color surfaceContainerLow = Color(0xFF181C22);
  static const Color surfaceContainer = Color(0xFF1C2026);
  static const Color headerBar = Color(0xFF181C22);
  static const Color surfaceContainerHigh = Color(0xFF262A31);
  static const Color surfaceContainerHighest = Color(0xFF31353C);
  static const Color surfaceVariant = Color(0xFF31353C);

  /// Glass panel fill (rgba(38, 42, 49, 0.6))
  static const Color glassFill = Color(0x99262A31);

  // --- Primary / accent (neon cyan) ---
  static const Color primary = Color(0xFFC3F5FF);
  static const Color primaryContainer = Color(0xFF00E5FF);
  static const Color primaryFixedDim = Color(0xFF00DAF3);
  static const Color onPrimary = Color(0xFF00363D);
  static const Color onPrimaryContainer = Color(0xFF00626E);
  static const Color onPrimaryFixed = Color(0xFF001F24);

  // --- On-surface & outlines ---
  static const Color onSurface = Color(0xFFDFE2EB);
  static const Color onSurfaceVariant = Color(0xFFBAC9CC);
  static const Color outline = Color(0xFF849396);
  static const Color outlineVariant = Color(0xFF3B494C);

  // --- Semantic ---
  static const Color error = Color(0xFFFFB4AB);
  static const Color onError = Color(0xFF690005);

  /// Health / integrity bars (HTML prototype `HEALTH_INTEGRITY` — neon green).
  static const Color healthIntegrity = Color(0xFF00FF41);

  // --- Secondary (blue accent for glows) ---
  static const Color secondaryContainer = Color(0xFF0068ED);

  // --- Radii (prototype ~12–16px cards) ---
  static const double radiusSm = 4;
  static const double radiusMd = 8;
  static const double radiusLg = 12;
  static const double radiusXl = 16;

  /// Backdrop blur sigma for glass (HTML blur 16px)
  static const double blurGlass = 16;

  static BorderSide borderSubtle([double opacity = 0.05]) =>
      BorderSide(color: Colors.white.withValues(alpha: opacity));
}
