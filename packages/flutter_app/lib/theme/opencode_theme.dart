import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'oc2_colors.dart';

/// OpenCode theme aligned with dashboard design system.
/// Uses OC-2 palette, Inter (sans) and IBM Plex Mono (mono).
class OpenCodeTheme {
  OpenCodeTheme._();

  static ThemeData get light => _build(Oc2Colors.light, Brightness.light);
  static ThemeData get dark => _build(Oc2Colors.dark, Brightness.dark);

  static ThemeData _build(Oc2Palette palette, Brightness brightness) {
    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: ColorScheme(
        brightness: brightness,
        primary: palette.textInteractive,
        onPrimary: palette.buttonPrimary,
        secondary: palette.surfaceBrand,
        onSecondary: palette.textStrong,
        error: palette.surfaceCriticalStrong,
        onError: Colors.white,
        surface: palette.backgroundBase,
        onSurface: palette.textStrong,
        surfaceContainerHighest: palette.backgroundStrong,
      ),
      scaffoldBackgroundColor: palette.backgroundBase,
      textTheme: _textTheme(palette),
      appBarTheme: AppBarTheme(
        backgroundColor: palette.backgroundBase,
        foregroundColor: palette.textStrong,
        elevation: 0,
        scrolledUnderElevation: 0,
      ),
      cardTheme: CardThemeData(
        color: palette.backgroundStrong,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(6),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: palette.inputBase,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(6),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(6),
          borderSide: BorderSide(color: palette.borderWeak),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(6),
          borderSide: BorderSide(color: palette.textInteractive, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      ),
      dividerColor: palette.borderWeak,
    );
  }

  static TextTheme _textTheme(Oc2Palette palette) {
    final base = TextTheme(
      headlineLarge: GoogleFonts.inter(
        fontSize: 20,
        fontWeight: FontWeight.w500,
        color: palette.textStrong,
        height: 1.3,
      ),
      headlineMedium: GoogleFonts.inter(
        fontSize: 16,
        fontWeight: FontWeight.w500,
        color: palette.textStrong,
        height: 1.5,
      ),
      bodyLarge: GoogleFonts.inter(
        fontSize: 14,
        fontWeight: FontWeight.w400,
        color: palette.textBase,
        height: 1.5,
      ),
      bodyMedium: GoogleFonts.inter(
        fontSize: 13,
        fontWeight: FontWeight.w400,
        color: palette.textBase,
        height: 1.5,
      ),
      bodySmall: GoogleFonts.inter(
        fontSize: 12,
        fontWeight: FontWeight.w400,
        color: palette.textWeak,
        height: 1.5,
      ),
      labelLarge: GoogleFonts.inter(
        fontSize: 14,
        fontWeight: FontWeight.w500,
        color: palette.textStrong,
        height: 1.5,
      ),
      labelMedium: GoogleFonts.inter(
        fontSize: 13,
        fontWeight: FontWeight.w500,
        color: palette.textBase,
        height: 1.5,
      ),
    );
    return base;
  }
}
