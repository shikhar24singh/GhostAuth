// Use the Material library bundled with Flutter 3.50.
// ignore: deprecated_member_use
import 'package:flutter/material.dart';

import 'platform.dart';

Color ink(BuildContext context) => Theme.of(context).colorScheme.onSurface;

ThemeData ghostTheme(bool dark) {
  final paper = dark ? const Color(0xff16181e) : const Color(0xfff5f4f0);
  final foreground = dark ? const Color(0xffeeede9) : const Color(0xff191919);
  final accent = dark ? const Color(0xff9aaeff) : const Color(0xff2448d8);
  final border = dark ? const Color(0xff393d48) : const Color(0xffd8d6cf);
  return ThemeData(
    useMaterial3: true,
    fontFamily: 'Arimo',
    brightness: dark ? Brightness.dark : Brightness.light,
    colorScheme: ColorScheme.fromSeed(
      seedColor: accent,
      brightness: dark ? Brightness.dark : Brightness.light,
      primary: accent,
      onPrimary: dark ? const Color(0xff101632) : paper,
      surface: paper,
      onSurface: foreground,
      outlineVariant: border,
    ),
    scaffoldBackgroundColor: paper,
    dividerColor: border,
    splashFactory: InkRipple.splashFactory,
  );
}

class Eyebrow extends StatelessWidget {
  const Eyebrow(this.label, {super.key});
  final String label;

  @override
  Widget build(BuildContext context) => Text(
    label.toUpperCase(),
    style: const TextStyle(
      fontFamily: 'Cousine',
      fontSize: 11,
      letterSpacing: .8,
      height: 1.45,
    ),
  );
}

class Caption extends StatelessWidget {
  const Caption(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) => Text(
    text,
    style: TextStyle(
      fontSize: 13,
      height: 1.45,
      color: ink(context).withValues(alpha: .8),
    ),
  );
}

class Heading extends StatelessWidget {
  const Heading(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) => Semantics(
    header: true,
    child: Text(
      text,
      style: const TextStyle(fontSize: 45, letterSpacing: -1.8, height: 1.07),
    ),
  );
}

class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {this.value, super.key});
  final String text;
  final String? value;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.only(top: 10, bottom: 8),
    decoration: BoxDecoration(
      border: Border(bottom: BorderSide(width: 2, color: ink(context))),
    ),
    child: Row(
      children: [
        Expanded(child: Eyebrow(text)),
        if (value != null) Eyebrow(value!),
      ],
    ),
  );
}

class Note extends StatelessWidget {
  const Note(this.title, this.detail, {super.key});
  final String title, detail;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.only(top: 10, bottom: 5),
    decoration: BoxDecoration(
      border: Border(top: BorderSide(width: 2, color: ink(context))),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [Eyebrow(title), const SizedBox(height: 6), Caption(detail)],
    ),
  );
}

class AlertText extends StatelessWidget {
  const AlertText(this.message, {super.key});
  final String message;

  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    child: DecoratedBox(
      decoration: BoxDecoration(
        border: Border(left: BorderSide(width: 2, color: ink(context))),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(10, 5, 4, 5),
        child: Caption(message),
      ),
    ),
  );
}

class ActionButton extends StatelessWidget {
  const ActionButton(
    this.label,
    this.onPressed, {
    this.secondary = false,
    super.key,
  });
  final String label;
  final VoidCallback? onPressed;
  final bool secondary;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final child = Row(
      children: [
        Expanded(child: Text(label)),
        const SizedBox(width: 8),
        const Icon(Icons.arrow_forward, size: 19),
      ],
    );
    const shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.all(Radius.circular(3)),
    );
    const padding = EdgeInsets.symmetric(horizontal: 14, vertical: 13);
    if (secondary) {
      return OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          foregroundColor: colors.onSurface,
          side: BorderSide(
            color: onPressed == null ? colors.outlineVariant : colors.onSurface,
          ),
          shape: shape,
          padding: padding,
          minimumSize: const Size.fromHeight(50),
        ),
        child: child,
      );
    }
    return FilledButton(
      onPressed: onPressed,
      style: FilledButton.styleFrom(
        shape: shape,
        padding: padding,
        minimumSize: const Size.fromHeight(50),
      ),
      child: child,
    );
  }
}

class DetailRow extends StatelessWidget {
  const DetailRow(
    this.title,
    this.detail, {
    this.onTap,
    this.leading,
    this.trailing,
    super.key,
  });
  final String title, detail;
  final VoidCallback? onTap;
  final Widget? leading, trailing;

  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    child: Container(
      constraints: const BoxConstraints(minHeight: 73),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: Theme.of(context).dividerColor),
        ),
      ),
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          if (leading != null) ...[leading!, const SizedBox(width: 12)],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontSize: 16, height: 1.3)),
                const SizedBox(height: 3),
                Caption(detail),
              ],
            ),
          ),
          if (trailing != null) ...[
            const SizedBox(width: 8),
            trailing!,
          ] else if (onTap != null) ...[
            const SizedBox(width: 8),
            const Icon(Icons.chevron_right, size: 20),
          ],
        ],
      ),
    ),
  );
}

class ChoiceRow extends StatelessWidget {
  const ChoiceRow(
    this.title,
    this.detail,
    this.value,
    this.onChanged, {
    this.leading,
    super.key,
  });
  final String title, detail;
  final bool value;
  final ValueChanged<bool>? onChanged;
  final Widget? leading;

  @override
  Widget build(BuildContext context) => Semantics(
    checked: value,
    enabled: onChanged != null,
    child: DetailRow(
      title,
      detail,
      onTap: onChanged == null ? null : () => onChanged!(!value),
      leading: leading,
      trailing: ExcludeSemantics(
        child: IgnorePointer(
          child: Checkbox(
            value: value,
            onChanged: onChanged == null
                ? null
                : (selected) {
                    if (selected != null) onChanged!(selected);
                  },
            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
            shape: const RoundedRectangleBorder(
              borderRadius: BorderRadius.all(Radius.circular(1)),
            ),
          ),
        ),
      ),
    ),
  );
}

class AppIcon extends StatelessWidget {
  const AppIcon(this.app, {super.key});
  final InstalledApp app;

  @override
  Widget build(BuildContext context) => app.icon == null
      ? const Icon(Icons.folder_outlined, size: 30)
      : Image.memory(
          app.icon!,
          width: 34,
          height: 34,
          excludeFromSemantics: true,
          errorBuilder: (_, _, _) =>
              const Icon(Icons.folder_outlined, size: 30),
        );
}

Future<bool> confirm(
  BuildContext context,
  String title,
  String body,
  String action,
) async =>
    await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: SingleChildScrollView(child: Text(body)),
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(3)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(action),
          ),
        ],
      ),
    ) ??
    false;
