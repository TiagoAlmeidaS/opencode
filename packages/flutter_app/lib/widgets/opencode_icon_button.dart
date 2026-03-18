import 'package:flutter/material.dart';

import '../theme/button_style.dart';
import '../theme/oc2_colors.dart';

/// Icon-only button aligned with OpenCode dashboard design.
/// Variants: primary, secondary, ghost. Sizes: small, normal, large.
class OpenCodeIconButton extends StatelessWidget {
  const OpenCodeIconButton({
    super.key,
    required this.icon,
    this.onPressed,
    this.variant = OpenCodeButtonVariant.ghost,
    this.size = OpenCodeButtonSize.normal,
    this.tooltip,
  });

  final IconData icon;
  final VoidCallback? onPressed;
  final OpenCodeButtonVariant variant;
  final OpenCodeButtonSize size;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? Oc2Colors.dark
        : Oc2Colors.light;
    final dims = _dims(size);

    Widget btn = Material(
      color: _backgroundColor(palette, variant),
      borderRadius: BorderRadius.circular(6),
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(6),
        child: SizedBox(
          width: dims.size,
          height: dims.size,
          child: Icon(
            icon,
            size: dims.iconSize,
            color: _iconColor(palette, variant),
          ),
        ),
      ),
    );

    if (tooltip != null) {
      btn = Tooltip(
        message: tooltip!,
        child: btn,
      );
    }

    return btn;
  }

  Color _backgroundColor(Oc2Palette p, OpenCodeButtonVariant v) {
    switch (v) {
      case OpenCodeButtonVariant.primary:
        return p.buttonPrimary;
      case OpenCodeButtonVariant.secondary:
        return p.buttonSecondary;
      case OpenCodeButtonVariant.ghost:
        return Colors.transparent;
    }
  }

  Color _iconColor(Oc2Palette p, OpenCodeButtonVariant v) {
    switch (v) {
      case OpenCodeButtonVariant.primary:
        return p.backgroundStrong;
      case OpenCodeButtonVariant.secondary:
      case OpenCodeButtonVariant.ghost:
        return p.iconBase;
    }
  }

  ({double size, double iconSize}) _dims(OpenCodeButtonSize s) {
    switch (s) {
      case OpenCodeButtonSize.small:
        return (size: 24, iconSize: 14);
      case OpenCodeButtonSize.normal:
        return (size: 32, iconSize: 16);
      case OpenCodeButtonSize.large:
        return (size: 40, iconSize: 20);
    }
  }
}
