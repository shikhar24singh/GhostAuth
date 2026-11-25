import 'dart:async';

// Use the Material library bundled with Flutter 3.50.
// ignore: deprecated_member_use
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'controller.dart';
import 'platform.dart';
import 'ui.dart';

class AppViews extends StatelessWidget {
  const AppViews(this.c, this.app, {super.key});
  final GhostController c;
  final InstalledApp? app;

  void _refresh() => unawaited(c.refresh());

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    spacing: 8,
    children: switch (c.screen) {
      Screen.welcome => [
        Align(
          alignment: Alignment.centerLeft,
          child: Image.asset(
            'public/assets/ghostauth-logo.png',
            width: 185,
            height: 185,
            semanticLabel: 'GhostAuth fingerprint mark',
          ),
        ),
        if (c.loading) const LinearProgressIndicator(),
        if (c.startupError.isNotEmpty) AlertText(c.startupError),
        if (c.authError.isNotEmpty) AlertText(c.authError),
        ActionButton(
          c.auth?.pinSet == true ? 'Open GhostAuth' : 'Set up GhostAuth',
          c.ready && c.auth != null ? c.startOnboarding : null,
        ),
        if (!c.loading && (c.startupError.isNotEmpty || c.authError.isNotEmpty))
          ActionButton('Refresh Android status', _refresh, secondary: true),
      ],
      Screen.privacy => [
        const DetailRow(
          'Your apps, your choice',
          'GhostAuth protects the apps you select.',
        ),
        const DetailRow(
          'App content stays private',
          'GhostAuth does not read your messages, photos, or passwords.',
        ),
        DetailRow(
          'Understand every signal',
          'Review the choices for motion and history.',
          onTap: c.editPrivacy,
        ),
        ActionButton('Continue', () => c.startPinSetup(change: false)),
      ],
      Screen.pinSetup ||
      Screen.pinConfirm ||
      Screen.pinVerify => _pinControls(),
      Screen.biometricSetup => [
        _featureIcon(context, Icons.fingerprint),
        const Note(
          'Handled by Android',
          'Android keeps your fingerprint. Confirm your PIN to enable fingerprint verification in GhostAuth.',
        ),
        if (c.auth?.biometricAvailable != true)
          const Caption(
            'Enroll a strong biometric in Android Settings to enable it here.',
          ),
        ActionButton(
          'Enable fingerprint',
          c.auth?.biometricAvailable == true
              ? () => c.startBiometricChange(true)
              : null,
        ),
        ActionButton(
          'Continue to permissions',
          () => c.openPermissions(fromOnboarding: true),
          secondary: true,
        ),
      ],
      Screen.setupComplete => [
        const Note(
          'Selected apps saved',
          'Enable the Android accessibility service in Permissions. Motion research requires separate enrollment.',
        ),
        ActionButton('Open GhostAuth', c.finishOnboarding),
        ActionButton('Review data choices', c.editPrivacy, secondary: true),
      ],
      Screen.home => _home(),
      Screen.appDetail => _appDetails(app),
      Screen.risk => [
        const Note(
          'Local identity verification',
          'GhostAuth uses your PIN or fingerprint. Risk scoring and behavior learning are part of offline research.',
        ),
        ActionButton(
          'Verify identity',
          c.canCheck && app != null
              ? () => unawaited(c.beginVerification(app!.id, immediate: false))
              : null,
        ),
        ActionButton(
          'Back to app',
          () => c.go(Screen.appDetail),
          secondary: true,
        ),
      ],
      Screen.fingerprint => [
        _featureIcon(context, Icons.fingerprint),
        if (c.checking) const LinearProgressIndicator(),
        ActionButton(
          c.checking ? 'Waiting for Android…' : 'Verify with fingerprint',
          c.canCheck ? () => unawaited(c.verifyFingerprint()) : null,
        ),
        ActionButton(
          'Use PIN instead',
          c.checking ? null : c.usePinInstead,
          secondary: true,
        ),
        ActionButton(
          'Cancel',
          () => unawaited(c.cancelVerification()),
          secondary: true,
        ),
      ],
      Screen.success => [
        _featureIcon(context, Icons.check),
        const Note(
          'Local identity verified',
          'Open the selected app with this verification. Each new launch needs its own check.',
        ),
        ActionButton(
          'Open ${app?.name ?? 'app'}',
          () => unawaited(c.launchVerified()),
        ),
        ActionButton(
          'Cancel',
          () => unawaited(c.cancelVerification()),
          secondary: true,
        ),
      ],
      Screen.opening => [const LinearProgressIndicator()],
      _ => const [],
    },
  );

  Widget _featureIcon(BuildContext context, IconData icon) => Align(
    alignment: Alignment.centerLeft,
    child: Icon(icon, size: 62, color: Theme.of(context).colorScheme.primary),
  );

  List<Widget> _pinControls() {
    final setup = c.screen == Screen.pinSetup;
    final confirming = c.screen == Screen.pinConfirm;
    final verifying = c.screen == Screen.pinVerify;
    final access = c.pinPurpose == PinPurpose.access && verifying;
    final enabled = !c.checking && (!access || c.canCheck);
    return [
      PinKeypad(controller: c, enabled: enabled),
      if (setup)
        const Caption(
          'Choose a PIN you can remember. Android securely stores a salted verifier.',
        ),
      if (verifying && c.remainingLockout > 0)
        AlertText('Try your PIN again in ${c.remainingLockout} seconds.'),
      ActionButton(
        c.checking
            ? 'Verifying…'
            : setup
            ? 'Continue'
            : confirming
            ? 'Confirm PIN'
            : 'Verify PIN',
        enabled ? () => unawaited(c.submitPin()) : null,
      ),
      if (confirming)
        ActionButton(
          'Start again',
          c.checking
              ? null
              : () =>
                    c.startPinSetup(change: c.pinPurpose == PinPurpose.change),
          secondary: true,
        ),
      if (verifying)
        ActionButton(
          'Cancel',
          () => unawaited(c.cancelVerification()),
          secondary: true,
        ),
      if (access && c.auth?.biometricEnabled == true)
        ActionButton(
          'Use fingerprint instead',
          enabled ? () => unawaited(c.verifyFingerprint()) : null,
          secondary: true,
        ),
      if (access && (c.authError.isNotEmpty || c.deviceError.isNotEmpty)) ...[
        AlertText(c.authError.isNotEmpty ? c.authError : c.deviceError),
        ActionButton('Refresh authentication', _refresh, secondary: true),
      ],
    ];
  }

  List<Widget> _home() => [
    if (c.deviceError.isNotEmpty) ...[
      AlertText(c.deviceError),
      ActionButton('Refresh Android status', _refresh, secondary: true),
    ],
    DetailRow(
      'Protection service',
      c.device?.active == true
          ? 'Active · Android accessibility service'
          : 'Off or disconnected',
      leading: const Icon(Icons.lock_outline),
      onTap: c.openPermissions,
    ),
    const SectionLabel('Selected apps'),
    for (final item in c.apps.where((a) => c.selected.contains(a.id)))
      DetailRow(
        item.name,
        item.id,
        leading: AppIcon(item),
        onTap: () => c.openApp(item),
      ),
    if (c.selected.isEmpty && c.device != null)
      const Note(
        'No apps selected',
        'Select installed apps and enable GhostAuth protection in Permissions.',
      ),
    ActionButton('Choose apps', c.device == null ? null : c.editApps),
  ];

  List<Widget> _appDetails(InstalledApp? app) {
    if (app == null || !c.selected.contains(app.id))
      return [
        if (c.deviceError.isNotEmpty) AlertText(c.deviceError),
        const Note(
          'App unavailable',
          'Refresh your app selection to find available apps.',
        ),
        ActionButton('Back to apps', () => c.go(Screen.home)),
      ];
    return [
      DetailRow(
        'Protection',
        c.device?.active == true
            ? 'Active · Android accessibility service'
            : 'Enable the service in Permissions',
        onTap: c.openPermissions,
      ),
      DetailRow(
        'Current session',
        'Additional verification required',
        onTap: () => c.go(Screen.risk),
      ),
      DetailRow(
        'Recent activity',
        'Review verification attempts',
        onTap: () => c.go(Screen.activity),
      ),
      const Note(
        'How access works',
        'When protection is active, GhostAuth covers this app when it opens. Leaving the app or turning off the screen ends its approval.',
      ),
      ActionButton(
        'Verify & open app',
        c.canCheck ? () => unawaited(c.beginVerification(app.id)) : null,
      ),
      if (c.authError.isNotEmpty || c.historyError.isNotEmpty) ...[
        AlertText(c.authError.isNotEmpty ? c.authError : c.historyError),
        ActionButton('Retry Android status', _refresh, secondary: true),
      ],
      ActionButton('Back to apps', () => c.go(Screen.home), secondary: true),
    ];
  }
}

class AppSelection extends StatefulWidget {
  const AppSelection(this.controller, {super.key});
  final GhostController controller;

  @override
  State<AppSelection> createState() => _AppSelectionState();
}

class _AppSelectionState extends State<AppSelection> {
  final _search = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.controller;
    final visible = c.apps.where((app) => app.matches(_query)).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 8,
      children: [
        if (c.deviceError.isNotEmpty) ...[
          AlertText(c.deviceError),
          ActionButton(
            'Refresh Android status',
            () => unawaited(c.refreshDevice()),
            secondary: true,
          ),
        ],
        TextField(
          controller: _search,
          onChanged: (value) => setState(() => _query = value),
          autocorrect: false,
          decoration: InputDecoration(
            labelText: 'Search installed apps',
            prefixIcon: const Icon(Icons.search),
            border: const OutlineInputBorder(),
            suffixIcon: _query.isEmpty
                ? null
                : IconButton(
                    tooltip: 'Clear search',
                    icon: const Icon(Icons.close),
                    onPressed: () => setState(() {
                      _search.clear();
                      _query = '';
                    }),
                  ),
          ),
        ),
        SectionLabel('Selected apps', value: '${c.draftApps.length}'),
        ActionButton(
          c.onboarding ? 'Save selected apps' : 'Save selection',
          c.saving || c.device == null ? null : () => unawaited(c.saveApps()),
        ),
        for (final app in visible)
          ChoiceRow(
            app.name,
            app.id,
            c.draftApps.contains(app.id),
            c.saving ? null : (value) => c.toggleApp(app.id, value),
            leading: AppIcon(app),
          ),
        if (visible.isEmpty && c.device != null)
          Caption(
            _query.trim().isEmpty
                ? 'No launchable apps were found in this Android profile.'
                : 'No apps match “${_query.trim()}”.',
          ),
      ],
    );
  }
}

class PinKeypad extends StatefulWidget {
  const PinKeypad({required this.controller, required this.enabled, super.key});
  final GhostController controller;
  final bool enabled;

  @override
  State<PinKeypad> createState() => _PinKeypadState();
}

class _PinKeypadState extends State<PinKeypad> {
  final _focus = FocusNode(debugLabel: 'GhostAuth PIN keypad');
  static final _digit = RegExp(r'^[0-9]$');

  @override
  void dispose() {
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.controller;
    final colors = Theme.of(context).colorScheme;
    return KeyboardListener(
      focusNode: _focus,
      autofocus: true,
      onKeyEvent: (event) {
        if (event is! KeyDownEvent || !widget.enabled) return;
        if (event.logicalKey == LogicalKeyboardKey.backspace) {
          c.deletePin();
        } else if (event.logicalKey == LogicalKeyboardKey.enter) {
          unawaited(c.submitPin());
        } else if (_digit.hasMatch(event.character ?? '')) {
          c.addPin(event.character!);
        }
      },
      child: Column(
        children: [
          Semantics(
            label: 'Six-digit PIN, ${c.pin.length} digits entered',
            liveRegion: true,
            child: ExcludeSemantics(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  for (var i = 0; i < 6; i++)
                    Flexible(
                      child: Container(
                        width: 44,
                        height: 49,
                        margin: const EdgeInsets.symmetric(horizontal: 3),
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          border: Border.all(
                            color: c.pin.length == i
                                ? colors.primary
                                : colors.outlineVariant,
                          ),
                        ),
                        child: i < c.pin.length
                            ? const Text('•', style: TextStyle(fontSize: 28))
                            : null,
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
          for (final line in const ['123', '456', '789', ' 0<'])
            Row(
              children: [
                for (final digit in line.split(''))
                  Expanded(
                    child: digit == ' '
                        ? const SizedBox(height: 48)
                        : TextButton(
                            key: ValueKey('pin-key-$digit'),
                            onPressed: !widget.enabled
                                ? null
                                : () {
                                    _focus.requestFocus();
                                    if (digit == '<') {
                                      c.deletePin();
                                    } else {
                                      c.addPin(digit);
                                    }
                                  },
                            style: TextButton.styleFrom(
                              foregroundColor: colors.onSurface,
                              minimumSize: const Size(44, 49),
                              padding: EdgeInsets.zero,
                            ),
                            child: digit == '<'
                                ? const Icon(
                                    Icons.backspace_outlined,
                                    semanticLabel: 'Delete digit',
                                    size: 25,
                                  )
                                : Text(
                                    digit,
                                    style: const TextStyle(fontSize: 28),
                                  ),
                          ),
                  ),
              ],
            ),
        ],
      ),
    );
  }
}
