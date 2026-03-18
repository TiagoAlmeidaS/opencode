import 'package:flutter/material.dart';

/// OC-2 theme colors extracted from packages/ui theme.css and oc-2.json.
/// Aligned with OpenCode dashboard design system.
class Oc2Colors {
  Oc2Colors._();

  static Oc2Palette get light => _light;
  static Oc2Palette get dark => _dark;

  static const _light = Oc2Palette(
    backgroundBase: Color(0xFFF8F8F8),
    backgroundWeak: Color(0xFFF3F3F3),
    backgroundStrong: Color(0xFFFCFCFC),
    textStrong: Color(0xFF171717),
    textBase: Color(0xFF6F6F6F),
    textWeak: Color(0xFF8F8F8F),
    textInteractive: Color(0xFF034CFF),
    borderWeak: Color(0xFFE5E5E5),
    iconBase: Color(0xFF8F8F8F),
    surfaceBrand: Color(0xFFDCDE8D),
    surfaceInteractive: Color(0xFFECF3FF),
    surfaceCritical: Color(0xFFFFF2F0),
    surfaceSuccess: Color(0xFFDBFED7),
    surfaceCriticalStrong: Color(0xFFFC533A),
    surfaceSuccessStrong: Color(0xFF12C905),
    buttonPrimary: Color(0xFF171717),
    buttonSecondary: Color(0xFFFCFCFC),
    inputBase: Color(0xFFFCFCFC),
    surfaceFloatBase: Color(0xFF161616),
  );

  static const _dark = Oc2Palette(
    backgroundBase: Color(0xFF101010),
    backgroundWeak: Color(0xFF1E1E1E),
    backgroundStrong: Color(0xFF121212),
    textStrong: Color(0xFFEDEDED),
    textBase: Color(0xFF9E9E9E),
    textWeak: Color(0xFF6B6B6B),
    textInteractive: Color(0xFF9DBEFE),
    borderWeak: Color(0xFF282828),
    iconBase: Color(0xFF7E7E7E),
    surfaceBrand: Color(0xFFFAB283),
    surfaceInteractive: Color(0xFF091F52),
    surfaceCritical: Color(0xFF1F0603),
    surfaceSuccess: Color(0xFF062D04),
    surfaceCriticalStrong: Color(0xFFFC533A),
    surfaceSuccessStrong: Color(0xFF12C905),
    buttonPrimary: Color(0xFFEDEDED),
    buttonSecondary: Color(0xFF1C1C1C),
    inputBase: Color(0xFF1C1C1C),
    surfaceFloatBase: Color(0xFF161616),
  );
}

class Oc2Palette {
  const Oc2Palette({
    required this.backgroundBase,
    required this.backgroundWeak,
    required this.backgroundStrong,
    required this.textStrong,
    required this.textBase,
    required this.textWeak,
    required this.textInteractive,
    required this.borderWeak,
    required this.iconBase,
    required this.surfaceBrand,
    required this.surfaceInteractive,
    required this.surfaceCritical,
    required this.surfaceSuccess,
    required this.surfaceCriticalStrong,
    required this.surfaceSuccessStrong,
    required this.buttonPrimary,
    required this.buttonSecondary,
    required this.inputBase,
    required this.surfaceFloatBase,
  });

  final Color backgroundBase;
  final Color backgroundWeak;
  final Color backgroundStrong;
  final Color textStrong;
  final Color textBase;
  final Color textWeak;
  final Color textInteractive;
  final Color borderWeak;
  final Color iconBase;
  final Color surfaceBrand;
  final Color surfaceInteractive;
  final Color surfaceCritical;
  final Color surfaceSuccess;
  final Color surfaceCriticalStrong;
  final Color surfaceSuccessStrong;
  final Color buttonPrimary;
  final Color buttonSecondary;
  final Color inputBase;
  final Color surfaceFloatBase;
}
