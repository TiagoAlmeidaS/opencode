import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../theme/kinetic_tokens.dart';

/// Primary CTA: solid neon cyan (`primary-container`), uppercase label (KINETIC prototype).
class KineticPrimaryButton extends StatelessWidget {
  const KineticPrimaryButton({
    super.key,
    required this.label,
    this.onPressed,
    this.icon,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: KineticTokens.primaryContainer,
      borderRadius: BorderRadius.circular(KineticTokens.radiusMd),
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(KineticTokens.radiusMd),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 18, color: KineticTokens.onPrimaryFixed),
                const SizedBox(width: 8),
              ],
              Text(
                label.toUpperCase(),
                style: GoogleFonts.spaceGrotesk(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.3,
                  color: KineticTokens.onPrimaryFixed,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
