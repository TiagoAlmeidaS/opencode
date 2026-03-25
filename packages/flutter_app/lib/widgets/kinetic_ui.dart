import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../theme/kinetic_tokens.dart';
import 'kinetic_glass_panel.dart';

bool isKineticDark(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark;

/// Glass card for list rows (dashboard + full screens).
class KineticGlassCard extends StatelessWidget {
  const KineticGlassCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(14),
    this.marginBottom = 10,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final double marginBottom;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: marginBottom),
      child: KineticGlassPanel(
        padding: padding,
        child: child,
      ),
    );
  }
}

/// Filter chips aligned with KINETIC (neon selection).
class KineticFilterChip extends StatelessWidget {
  const KineticFilterChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onSelected,
  });

  final String label;
  final bool selected;
  final ValueChanged<bool> onSelected;

  @override
  Widget build(BuildContext context) {
    return FilterChip(
      label: Text(
        label,
        style: GoogleFonts.inter(
          fontSize: 12,
          fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
          color: selected ? KineticTokens.primaryFixedDim : KineticTokens.onSurfaceVariant,
        ),
      ),
      selected: selected,
      onSelected: onSelected,
      backgroundColor: KineticTokens.surfaceContainerLow,
      selectedColor: KineticTokens.primaryContainer.withValues(alpha: 0.14),
      checkmarkColor: KineticTokens.primaryContainer,
      side: BorderSide(
        color: selected
            ? KineticTokens.primaryContainer.withValues(alpha: 0.45)
            : KineticTokens.outlineVariant.withValues(alpha: 0.45),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 4),
    );
  }
}

/// Filter chip with solid cyan selection + glow (AI opportunities / HTML prototype).
class KineticFilledFilterChip extends StatelessWidget {
  const KineticFilledFilterChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = label.toLowerCase();
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(KineticTokens.radiusXl),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
          decoration: BoxDecoration(
            color: selected ? KineticTokens.primaryContainer : KineticTokens.surfaceContainerHigh.withValues(alpha: 0.6),
            borderRadius: BorderRadius.circular(KineticTokens.radiusXl),
            border: Border.all(
              color: selected ? KineticTokens.primaryContainer.withValues(alpha: 0.35) : KineticTokens.outlineVariant.withValues(alpha: 0.2),
            ),
            boxShadow: selected
                ? [
                    BoxShadow(
                      color: KineticTokens.primaryContainer.withValues(alpha: 0.3),
                      blurRadius: 15,
                      spreadRadius: 0,
                    ),
                  ]
                : null,
          ),
          child: Text(
            t,
            style: GoogleFonts.inter(
              fontSize: 13,
              fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
              color: selected ? KineticTokens.onPrimaryFixed : KineticTokens.onSurfaceVariant,
            ),
          ),
        ),
      ),
    );
  }
}
