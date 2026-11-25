import 'dart:async';

// Use the Material library bundled with Flutter 3.50.
// ignore: deprecated_member_use
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app_views.dart';
import 'controller.dart';
import 'platform.dart';
import 'research_widgets.dart';
import 'settings_views.dart';
import 'ui.dart';

class GhostAuthApp extends StatefulWidget {
  const GhostAuthApp({required this.platform, super.key});
  final GhostPlatform platform;

  @override
  State<GhostAuthApp> createState() => _GhostAuthAppState();
}

class _GhostAuthAppState extends State<GhostAuthApp>
    with WidgetsBindingObserver {
  late final GhostController controller;

  @override
  void initState() {
    super.initState();
    controller = GhostController(widget.platform);
    WidgetsBinding.instance.addObserver(this);
    unawaited(controller.start());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      controller.resume();
    } else if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached) {
      controller.pause();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: controller,
    builder: (_, _) => MaterialApp(
      title: 'GhostAuth',
      debugShowCheckedModeBanner: false,
      theme: ghostTheme(controller.dark),
      home: _GhostScreen(controller),
    ),
  );
}

class _GhostScreen extends StatefulWidget {
  const _GhostScreen(this.controller);
  final GhostController controller;

  @override
  State<_GhostScreen> createState() => _GhostScreenState();
}

class _GhostScreenState extends State<_GhostScreen> {
  GhostController get c => widget.controller;
  bool _dialogDismissal = false;

  @override
  Widget build(BuildContext context) {
    final app = c.currentApp;
    final compact = c.external && c.identityScreen;
    final primary = [
      Screen.home,
      Screen.activity,
      Screen.settings,
    ].contains(c.screen);
    final root = primary || c.screen == Screen.welcome;
    final palette = Theme.of(context).colorScheme;
    final (kicker, heading, description) = _title(app);
    if (compact && Navigator.canPop(context) && !_dialogDismissal) {
      _dialogDismissal = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _dialogDismissal = false;
        if (mounted &&
            c.external &&
            c.identityScreen &&
            Navigator.canPop(context)) {
          Navigator.pop(context);
        }
      });
    }

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: (c.dark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark)
          .copyWith(
            statusBarColor: Colors.transparent,
            systemNavigationBarColor: Colors.transparent,
            systemNavigationBarContrastEnforced: false,
          ),
      child: PopScope<Object?>(
        canPop: false,
        onPopInvokedWithResult: (popped, _) {
          if (!popped) unawaited(_back(exitIfRoot: true));
        },
        child: Scaffold(
          body: SafeArea(
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 480),
                child: Column(
                  children: [
                    if (!compact) _header(root),
                    Expanded(
                      child: ListView(
                        key: ValueKey(c.navigation),
                        padding: EdgeInsets.fromLTRB(
                          24,
                          compact ? 34 : 22,
                          24,
                          22,
                        ),
                        keyboardDismissBehavior:
                            ScrollViewKeyboardDismissBehavior.onDrag,
                        children: [
                          if (compact && app != null)
                            Align(
                              alignment: Alignment.centerLeft,
                              child: AppIcon(app),
                            ),
                          if (kicker.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 6),
                              child: Eyebrow(kicker),
                            ),
                          Heading(heading),
                          if (description.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 9),
                              child: Text(
                                description,
                                style: const TextStyle(
                                  fontSize: 15,
                                  height: 1.45,
                                ),
                              ),
                            ),
                          const SizedBox(height: 17),
                          if (c.error.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: AlertText(c.error),
                            ),
                          _body(app),
                        ],
                      ),
                    ),
                    if (primary && c.auth?.pinSet == true) _tabs(palette),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _header(bool root) => Container(
    constraints: const BoxConstraints(minHeight: 65),
    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 10),
    decoration: BoxDecoration(
      border: Border(bottom: BorderSide(color: ink(context))),
    ),
    child: Row(
      children: [
        Expanded(
          child: Text.rich(
            TextSpan(
              text: 'Ghost',
              children: [
                TextSpan(
                  text: 'Auth',
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.primary,
                  ),
                ),
              ],
            ),
            style: const TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 27,
              letterSpacing: -1.2,
            ),
          ),
        ),
        if (!root)
          IconButton(
            tooltip: 'Back',
            onPressed: c.saving || c.launching
                ? null
                : () => unawaited(_back()),
            icon: const Icon(Icons.arrow_back),
          )
        else
          const Flexible(child: Eyebrow('On-device security')),
      ],
    ),
  );

  Widget _tabs(ColorScheme palette) => DecoratedBox(
    decoration: BoxDecoration(
      border: Border(top: BorderSide(color: palette.outlineVariant)),
    ),
    child: Row(
      children: [
        _tab(Screen.home, 'Apps', Icons.grid_view_outlined, palette),
        _tab(
          Screen.activity,
          'Activity',
          Icons.monitor_heart_outlined,
          palette,
        ),
        _tab(Screen.settings, 'Settings', Icons.settings_outlined, palette),
      ],
    ),
  );

  Widget _tab(Screen page, String label, IconData icon, ColorScheme palette) {
    final chosen = c.screen == page;
    return Expanded(
      child: Semantics(
        selected: chosen,
        child: InkWell(
          onTap: chosen || c.saving ? null : () => c.go(page),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 3),
            child: Column(
              children: [
                Icon(
                  icon,
                  size: 21,
                  color: chosen ? palette.primary : palette.onSurface,
                ),
                const SizedBox(height: 3),
                Text(
                  label,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 12,
                    color: chosen ? palette.primary : palette.onSurface,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _back({bool exitIfRoot = false}) async {
    final handled = await c.back();
    if (mounted && exitIfRoot && !handled) await SystemNavigator.pop();
  }

  (String, String, String) _title(InstalledApp? app) {
    final name = app?.name ?? 'Selected app';
    return switch (c.screen) {
      Screen.welcome => (
        'Private by design',
        'Your apps.\nYour access.',
        'Choose which apps to protect with your PIN or fingerprint.',
      ),
      Screen.privacy => ('Setup / 01', 'Privacy\ncomes first.', ''),
      Screen.pinSetup => (
        'Android security',
        'Create\nyour PIN.',
        'Choose six digits for identity verification and security settings.',
      ),
      Screen.pinConfirm => (
        'Android security',
        'One more\ntime.',
        'Re-enter your PIN to confirm it.',
      ),
      Screen.biometricSetup => (
        'Setup / 03',
        'A familiar\nway in.',
        'Use Android fingerprint verification to open protected apps.',
      ),
      Screen.permissions => ('Android permissions', 'Review\npermissions.', ''),
      Screen.permissionDetail => (
        'Android permissions',
        permissionLabel(c.permission),
        '',
      ),
      Screen.selectApps => (
        'App selection',
        'Choose apps.',
        'Launchable apps in this Android profile. You can change your selection at any time.',
      ),
      Screen.setupComplete => (
        'Setup complete',
        'You’re ready.',
        'Your PIN is saved securely on this device.',
      ),
      Screen.home =>
        c.selected.isEmpty
            ? (
                'Your device / Your rules',
                'Make it\npersonal.',
                'Choose which installed apps to protect.',
              )
            : (
                'Your device / Your rules',
                'App\nprotection.',
                'Verify with your PIN or fingerprint to open a selected app.',
              ),
      Screen.appDetail => ('Protected application', name, app?.id ?? ''),
      Screen.risk => (
        'Session context',
        'Why this\ncheck?',
        'Verify your identity before opening $name.',
      ),
      Screen.pinVerify => (
        'Identity check',
        c.external ? name : 'Confirm\nit’s you.',
        switch (c.pinPurpose) {
          PinPurpose.change => 'Enter your current PIN to save the new one.',
          PinPurpose.enableBiometric =>
            'Enter your PIN, then confirm with Android biometrics.',
          PinPurpose.disableBiometric =>
            'Enter your PIN to turn off fingerprint verification.',
          _ =>
            c.external
                ? 'Enter your saved PIN to open this app.'
                : 'Enter your saved six-digit PIN.',
        },
      ),
      Screen.fingerprint => (
        'Identity check',
        c.external ? name : 'A moment\nto verify.',
        'Use a fingerprint registered on this device.',
      ),
      Screen.success => (
        'Identity confirmed',
        'You’re\nverified.',
        'Your verification lasts up to 30 seconds while GhostAuth stays in the foreground.',
      ),
      Screen.opening => (
        'Identity confirmed',
        'Opening\n$name',
        'Waiting for Android to open the selected app.',
      ),
      Screen.activity => ('Access history', 'Your recent\nactivity.', ''),
      Screen.event => (
        'Security event',
        c.currentEvent?.label ?? 'Access check',
        '',
      ),
      Screen.settings => ('Your preferences', 'Make it\nyours.', ''),
      Screen.security => ('Android security', 'PIN &\nfingerprint.', ''),
      Screen.privacySettings => (
        'Privacy & data',
        'Your data.\nYour choice.',
        '',
      ),
      Screen.research => (
        'Optional research',
        'Motion\nresearch.',
        'Measure whether normal verification provides usable motion signals.',
      ),
      Screen.diagnostic => (
        'Optional diagnostic',
        'Motion\ndiagnostic.',
        'Check sensor delivery in a separate five-second test.',
      ),
      Screen.recovery => ('Device access', 'Find your\nway back.', ''),
      Screen.recoveryInfo => ('Device access', 'Lost your PIN?', ''),
    };
  }

  Widget _body(InstalledApp? app) => switch (c.screen) {
    Screen.selectApps => AppSelection(c),
    Screen.settings ||
    Screen.security ||
    Screen.privacySettings ||
    Screen.permissions ||
    Screen.permissionDetail ||
    Screen.activity ||
    Screen.event ||
    Screen.recovery ||
    Screen.recoveryInfo => SettingsViews(c),
    Screen.research => ResearchPanel(c),
    Screen.diagnostic => MotionDiagnosticPanel(
      platform: c.platform,
      onBack: () => c.go(Screen.research),
    ),
    _ => AppViews(c, app),
  };
}
