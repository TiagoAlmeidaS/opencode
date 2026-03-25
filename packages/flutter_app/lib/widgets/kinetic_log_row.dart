import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../theme/kinetic_tokens.dart';

/// Terminal-style log line: badge, timestamp, mono body, left border by severity.
class KineticLogRow extends StatelessWidget {
  const KineticLogRow({
    super.key,
    required this.badge,
    required this.timestamp,
    required this.message,
    this.borderColor,
    this.badgeBackground,
    this.badgeForeground,
  });

  final String badge;
  final String timestamp;
  final String message;
  final Color? borderColor;
  final Color? badgeBackground;
  final Color? badgeForeground;

  static KineticLogRow fromLevel({
    required String level,
    required int createdAtUnix,
    required String message,
  }) {
    final lower = level.toLowerCase();
    Color border;
    Color? bg;
    Color fg;
    String label;

    if (lower.contains('warn') || lower == 'error') {
      border = KineticTokens.error.withValues(alpha: 0.5);
      bg = KineticTokens.error.withValues(alpha: 0.12);
      fg = KineticTokens.error;
      label = 'WARNING';
    } else if (lower == 'info' || lower.startsWith('info')) {
      border = KineticTokens.outlineVariant.withValues(alpha: 0.5);
      bg = KineticTokens.surfaceContainerHighest.withValues(alpha: 0.9);
      fg = KineticTokens.onSurfaceVariant;
      label = 'INFO';
    } else {
      border = KineticTokens.primaryContainer.withValues(alpha: 0.45);
      bg = KineticTokens.primaryContainer.withValues(alpha: 0.1);
      fg = KineticTokens.primaryFixedDim;
      label = level.toUpperCase().length > 12 ? level.substring(0, 12).toUpperCase() : level.toUpperCase();
    }

    final dt = DateTime.fromMillisecondsSinceEpoch(createdAtUnix * 1000).toLocal();
    final ts =
        '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}:${dt.second.toString().padLeft(2, '0')}';

    return KineticLogRow(
      badge: label,
      timestamp: ts,
      message: message,
      borderColor: border,
      badgeBackground: bg,
      badgeForeground: fg,
    );
  }

  @override
  Widget build(BuildContext context) {
    final b = borderColor ?? KineticTokens.primaryContainer.withValues(alpha: 0.4);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: KineticTokens.surfaceContainerLow,
        borderRadius: BorderRadius.circular(KineticTokens.radiusLg),
        border: Border(left: BorderSide(color: b, width: 2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: badgeBackground ?? KineticTokens.primaryContainer.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  badge,
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 10,
                    color: badgeForeground ?? KineticTokens.primaryFixedDim,
                  ),
                ),
              ),
              Text(
                timestamp,
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 10,
                  color: KineticTokens.onSurfaceVariant,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            message,
            style: GoogleFonts.jetBrainsMono(
              fontSize: 12,
              height: 1.45,
              color: KineticTokens.onSurface,
            ),
          ),
        ],
      ),
    );
  }
}
