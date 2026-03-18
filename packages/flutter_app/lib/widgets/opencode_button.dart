import 'package:flutter/material.dart';

import '../theme/button_style.dart';
import '../theme/oc2_colors.dart';

/// Button aligned with OpenCode dashboard design.
/// Variants: primary, secondary, ghost. Sizes: small, normal, large.
class OpenCodeButton extends StatelessWidget {
  const OpenCodeButton({
    super.key,
    this.onPressed,
    required this.child,
    this.variant = OpenCodeButtonVariant.secondary,
    this.size = OpenCodeButtonSize.normal,
    this.icon,
  });

  final VoidCallback? onPressed;
  final Widget child;
  final OpenCodeButtonVariant variant;
  final OpenCodeButtonSize size;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? Oc2Colors.dark
        : Oc2Colors.light;
    final dims = _dims(size);

    return Material(
      color: _backgroundColor(palette, variant, false),
      borderRadius: BorderRadius.circular(6),
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(6),
        child: Container(
          height: dims.height,
          padding: dims.padding,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(6),
            border: variant == OpenCodeButtonVariant.secondary
                ? Border.all(color: palette.borderWeak)
                : null,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (icon != null) ...[
                Icon(
                  icon!,
                  size: dims.iconSize,
                  color: _iconColor(palette, variant),
                ),
                SizedBox(width: dims.gap),
              ],
              DefaultTextStyle(
                style: TextStyle(
                  fontSize: dims.fontSize,
                  fontWeight: FontWeight.w500,
                  color: _textColor(palette, variant),
                ),
                child: child,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Color _backgroundColor(Oc2Palette p, OpenCodeButtonVariant v, bool hover) {
    switch (v) {
      case OpenCodeButtonVariant.primary:
        return p.buttonPrimary;
      case OpenCodeButtonVariant.secondary:
        return p.buttonSecondary;
      case OpenCodeButtonVariant.ghost:
        return Colors.transparent;
    }
  }

  Color _textColor(Oc2Palette p, OpenCodeButtonVariant v) {
    switch (v) {
      case OpenCodeButtonVariant.primary:
        return p.backgroundStrong;
      case OpenCodeButtonVariant.secondary:
      case OpenCodeButtonVariant.ghost:
        return p.textStrong;
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

  ({double height, EdgeInsets padding, double iconSize, double fontSize, double gap})
      _dims(OpenCodeButtonSize s) {
    switch (s) {
      case OpenCodeButtonSize.small:
        return (
          height: 24,
          padding: const EdgeInsets.symmetric(horizontal: 8),
          iconSize: 14,
          fontSize: 13,
          gap: 8,
        );
      case OpenCodeButtonSize.normal:
        return (
          height: 28,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          iconSize: 14,
          fontSize: 13,
          gap: 8,
        );
      case OpenCodeButtonSize.large:
        return (
          height: 32,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          iconSize: 16,
          fontSize: 14,
          gap: 8,
        );
    }
  }
}
