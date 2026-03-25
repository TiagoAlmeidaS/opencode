import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'kinetic_tokens.dart';

/// Extra theme data for KINETIC (glass, nav bar chrome).
@immutable
class KineticThemeExtension extends ThemeExtension<KineticThemeExtension> {
  const KineticThemeExtension({
    required this.glassFill,
    required this.blurSigma,
    required this.navBarColor,
    required this.neonAccent,
  });

  final Color glassFill;
  final double blurSigma;
  final Color navBarColor;
  final Color neonAccent;

  static const KineticThemeExtension dark = KineticThemeExtension(
    glassFill: KineticTokens.glassFill,
    blurSigma: KineticTokens.blurGlass,
    navBarColor: Color(0x99181C22),
    neonAccent: KineticTokens.primaryContainer,
  );

  @override
  KineticThemeExtension copyWith({
    Color? glassFill,
    double? blurSigma,
    Color? navBarColor,
    Color? neonAccent,
  }) {
    return KineticThemeExtension(
      glassFill: glassFill ?? this.glassFill,
      blurSigma: blurSigma ?? this.blurSigma,
      navBarColor: navBarColor ?? this.navBarColor,
      neonAccent: neonAccent ?? this.neonAccent,
    );
  }

  @override
  KineticThemeExtension lerp(ThemeExtension<KineticThemeExtension>? other, double t) {
    if (other == null || other is! KineticThemeExtension) return this;
    return KineticThemeExtension(
      glassFill: Color.lerp(glassFill, other.glassFill, t)!,
      blurSigma: blurSigma + (other.blurSigma - blurSigma) * t,
      navBarColor: Color.lerp(navBarColor, other.navBarColor, t)!,
      neonAccent: Color.lerp(neonAccent, other.neonAccent, t)!,
    );
  }
}

/// Builds Material 3 `ThemeData` for KINETIC dark (Space Grotesk + Inter + JetBrains Mono).
abstract final class KineticTheme {
  KineticTheme._();

  static ThemeData build() {
    final scheme = ColorScheme.fromSeed(
      seedColor: KineticTokens.primaryContainer,
      brightness: Brightness.dark,
    ).copyWith(
      primary: KineticTokens.primaryContainer,
      onPrimary: KineticTokens.onPrimaryFixed,
      secondary: KineticTokens.secondaryContainer,
      onSecondary: KineticTokens.onSurface,
      surface: KineticTokens.surface,
      onSurface: KineticTokens.onSurface,
      onSurfaceVariant: KineticTokens.onSurfaceVariant,
      outline: KineticTokens.outline,
      outlineVariant: KineticTokens.outlineVariant,
      surfaceContainerHighest: KineticTokens.surfaceContainerHighest,
      surfaceContainerHigh: KineticTokens.surfaceContainerHigh,
      surfaceContainer: KineticTokens.surfaceContainer,
      surfaceContainerLow: KineticTokens.surfaceContainerLow,
      surfaceContainerLowest: KineticTokens.surfaceContainerLowest,
      error: KineticTokens.error,
      onError: KineticTokens.onError,
    );

    final body = GoogleFonts.interTextTheme();

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: scheme,
      scaffoldBackgroundColor: KineticTokens.background,
      extensions: const [KineticThemeExtension.dark],
      textTheme: TextTheme(
        headlineLarge: GoogleFonts.spaceGrotesk(
          fontSize: 30,
          fontWeight: FontWeight.w700,
          color: KineticTokens.primaryContainer,
          height: 1.2,
          letterSpacing: -0.5,
        ),
        headlineMedium: GoogleFonts.spaceGrotesk(
          fontSize: 18,
          fontWeight: FontWeight.w700,
          color: KineticTokens.onSurface,
          height: 1.25,
        ),
        headlineSmall: GoogleFonts.spaceGrotesk(
          fontSize: 14,
          fontWeight: FontWeight.w700,
          color: KineticTokens.primary,
          letterSpacing: 0.5,
        ),
        titleMedium: GoogleFonts.spaceGrotesk(
          fontSize: 16,
          fontWeight: FontWeight.w600,
          color: KineticTokens.onSurface,
        ),
        bodyLarge: body.bodyLarge?.copyWith(color: KineticTokens.onSurface, fontSize: 14,
            height: 1.5),
        bodyMedium: body.bodyMedium?.copyWith(color: KineticTokens.onSurface, fontSize: 13,
            height: 1.5),
        bodySmall: body.bodySmall?.copyWith(color: KineticTokens.onSurfaceVariant, fontSize: 12,
            height: 1.5),
        labelLarge: body.labelLarge?.copyWith(
          color: KineticTokens.onSurface,
          fontWeight: FontWeight.w500,
          fontSize: 14,
        ),
        labelSmall: GoogleFonts.jetBrainsMono(
          fontSize: 10,
          color: KineticTokens.primaryFixedDim,
          fontWeight: FontWeight.w400,
          letterSpacing: 1.2,
        ),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: KineticTokens.headerBar,
        foregroundColor: KineticTokens.onSurface,
        elevation: 0,
        scrolledUnderElevation: 0,
        titleTextStyle: GoogleFonts.spaceGrotesk(
          fontSize: 14,
          fontWeight: FontWeight.w700,
          color: KineticTokens.primary,
          letterSpacing: 0.5,
        ),
      ),
      cardTheme: CardThemeData(
        color: KineticTokens.surfaceContainerLow,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(KineticTokens.radiusLg),
          side: KineticTokens.borderSubtle(),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: KineticTokens.headerBar.withValues(alpha: 0.85),
        indicatorColor: KineticTokens.primaryContainer.withValues(alpha: 0.12),
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        height: 72,
        labelTextStyle: WidgetStateProperty.resolveWith((s) {
          final selected = s.contains(WidgetState.selected);
          return GoogleFonts.inter(
            fontSize: 11,
            fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
            color: selected ? KineticTokens.primaryFixedDim : KineticTokens.outlineVariant,
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((s) {
          final selected = s.contains(WidgetState.selected);
          return IconThemeData(
            color: selected ? KineticTokens.primaryFixedDim : KineticTokens.outlineVariant,
            size: 24,
          );
        }),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: KineticTokens.surfaceContainer,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(KineticTokens.radiusMd)),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(KineticTokens.radiusMd),
          borderSide: BorderSide(color: KineticTokens.outlineVariant.withValues(alpha: 0.4)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(KineticTokens.radiusMd),
          borderSide: const BorderSide(color: KineticTokens.primaryContainer, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      ),
      dividerColor: KineticTokens.outlineVariant.withValues(alpha: 0.35),
    );
  }
}
