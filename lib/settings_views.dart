import 'dart:async';

// Use the Material library bundled with Flutter 3.50.
// ignore: deprecated_member_use
import 'package:flutter/material.dart';

import 'controller.dart';
import 'platform.dart';
import 'ui.dart';

String permissionLabel(Permission key) => switch (key) {
  Permission.service => 'Protection service',
  Permission.usage => 'App usage access',
  Permission.notifications => 'Notifications',
};

class SettingsViews extends StatelessWidget {
  const SettingsViews(this.c, {super.key});
  final GhostController c;

  void _refresh() => unawaited(c.refresh());

  Future<void> _confirm(
    BuildContext context,
    String title,
    String body,
    String label,
    Future<void> Function() action,
  ) async {
    final startingPage = c.navigation;
    if (await confirm(context, title, body, label) &&
        context.mounted &&
        c.navigation == startingPage)
      await action();
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    spacing: 8,
    children: switch (c.screen) {
      Screen.permissions => _permissions(),
      Screen.permissionDetail => _permissionDetails(),
      Screen.activity => _activity(context),
      Screen.event => _event(context),
      Screen.settings => _settings(context),
      Screen.security => _security(),
      Screen.privacySettings => _privacy(context),
      Screen.recovery => [
        DetailRow(
          c.auth?.biometricEnabled == true
              ? 'Fingerprint available'
              : 'Fingerprint settings',
          'Use an enabled fingerprint to open a selected app. Changes require your current PIN.',
          onTap: () => c.go(Screen.security),
        ),
        DetailRow(
          'I forgot my PIN',
          'Review the options available on this device.',
          onTap: () => c.go(Screen.recoveryInfo),
        ),
      ],
      Screen.recoveryInfo => [
        const Note(
          'No PIN reset bypass',
          'An enabled fingerprint can still verify app access. Changing security settings requires your current PIN. Clearing app data removes GhostAuth credentials, settings, and saved history.',
        ),
        ActionButton(
          'Back to recovery',
          () => c.go(Screen.recovery),
          secondary: true,
        ),
      ],
      _ => const [],
    },
  );

  List<Widget> _deviceAlerts() => [
    if (c.deviceError.isNotEmpty) AlertText(c.deviceError),
  ];

  String _permissionStatus(Permission key) {
    final device = c.device;
    if (device == null) return 'Android status unavailable';
    return switch (key) {
      Permission.service =>
        device.error ??
            (device.active
                ? 'Active · Android accessibility service'
                : device.consent
                ? 'Enable in Android Accessibility'
                : 'Off · enable protection'),
      Permission.usage =>
        device.usage
            ? 'Enabled on this device'
            : 'Optional · open Android settings',
      Permission.notifications =>
        device.notifications
            ? 'Enabled on this device'
            : 'Optional · open Android settings',
    };
  }

  List<Widget> _permissions() => [
    ..._deviceAlerts(),
    for (final permission in [
      Permission.usage,
      Permission.service,
      Permission.notifications,
    ])
      DetailRow(
        permissionLabel(permission),
        _permissionStatus(permission),
        onTap: () => c.explainPermission(permission),
      ),
    const Note(
      'Android Accessibility',
      'App protection uses Android Accessibility. Usage access and notifications are optional for local identity checks.',
    ),
    if (c.onboarding)
      ActionButton(
        'Continue to app selection',
        c.device != null ? c.editApps : null,
      ),
    ActionButton('Refresh Android status', _refresh, secondary: true),
  ];

  List<Widget> _permissionDetails() {
    final service = c.permission == Permission.service;
    return [
      ..._deviceAlerts(),
      DetailRow('Current status', _permissionStatus(c.permission)),
      if (service) ...[
        const Note(
          'Enable app protection',
          'GhostAuth reads the package name of the active Android window to identify selected apps. It covers a selected app until you verify. It does not read screen contents, input, or activity inside other apps.',
        ),
        if (c.device?.active != true)
          ActionButton(
            'Agree and enable protection',
            c.saving || c.device == null
                ? null
                : () => unawaited(c.enableProtection()),
          ),
        if (c.device?.consent == true)
          ActionButton(
            'Turn off protection',
            c.saving ? null : () => unawaited(c.disableProtection()),
            secondary: true,
          ),
      ] else
        Note(
          permissionLabel(c.permission),
          c.permission == Permission.usage
              ? 'GhostAuth checks this permission. It does not read usage history.'
              : 'Android controls this setting. This build does not send protection alerts.',
        ),
      ActionButton(
        'Open Android settings',
        c.saving || (service && c.device?.consent != true)
            ? null
            : () => unawaited(c.openAndroidSettings()),
        secondary: service,
      ),
      ActionButton(
        'Back to permissions',
        () => unawaited(c.back()),
        secondary: true,
      ),
    ];
  }

  List<Widget> _settings(BuildContext context) => [
    ChoiceRow(
      'Dark mode',
      c.dark ? 'On · saved on this device' : 'Off · light appearance',
      c.dark,
      c.saving ? null : (value) => unawaited(c.changeTheme(value)),
    ),
    DetailRow(
      'PIN & fingerprint',
      'Manage identity verification',
      onTap: () => c.go(Screen.security),
    ),
    DetailRow(
      'Privacy & data',
      'Review motion and history choices',
      onTap: c.editPrivacy,
    ),
    DetailRow(
      'Motion research',
      'Optional collection pilot',
      onTap: () => c.go(Screen.research),
    ),
    DetailRow(
      'Permissions',
      'Review protection access',
      onTap: c.openPermissions,
    ),
    DetailRow(
      'Recovery',
      'Review options for lost access',
      onTap: () => c.go(Screen.recovery),
    ),
    DetailRow(
      'Reset saved preferences',
      'Restore app selection and data choices',
      onTap: c.saving
          ? null
          : () => unawaited(
              _confirm(
                context,
                'Reset saved preferences?',
                'Restore the default app selection and privacy choices and pause motion research. Your PIN, fingerprint, and saved history are kept.',
                'Reset preferences',
                c.resetPreferences,
              ),
            ),
    ),
    const Caption('GhostAuth for Android\nResearch prototype · version 0.8.0'),
  ];

  List<Widget> _security() => [
    if (c.authError.isNotEmpty) ...[
      AlertText(c.authError),
      ActionButton('Refresh authentication', _refresh, secondary: true),
    ],
    DetailRow(
      'GhostAuth PIN',
      c.auth?.pinSet == true
          ? 'Six-digit PIN saved on this device'
          : 'Unavailable',
    ),
    DetailRow(
      'Fingerprint',
      c.auth?.biometricEnabled == true
          ? 'Enabled'
          : c.auth?.biometricAvailable == true
          ? 'Available · enable with your PIN'
          : 'Enroll a strong biometric in Android Settings',
    ),
    ActionButton(
      'Change PIN',
      c.auth?.pinSet == true ? () => c.startPinSetup(change: true) : null,
    ),
    ActionButton(
      c.auth?.biometricEnabled == true
          ? 'Turn off fingerprint'
          : 'Enable fingerprint',
      c.auth?.biometricAvailable == true
          ? () => c.startBiometricChange(c.auth?.biometricEnabled != true)
          : null,
      secondary: true,
    ),
  ];

  List<Widget> _privacy(BuildContext context) => [
    ChoiceRow(
      'Behavior signals',
      'Touch research preference · no active touch collection',
      c.draftBehavior,
      c.saving ? null : (value) => c.setPrivacy('behavior', value),
    ),
    ChoiceRow(
      'Movement signals',
      'Allow motion after separate research enrollment',
      c.draftMovement,
      c.saving ? null : (value) => c.setPrivacy('movement', value),
    ),
    ChoiceRow(
      'Security history',
      'Save verification attempts on this device',
      c.draftHistory,
      c.saving ? null : (value) => c.setPrivacy('history', value),
    ),
    const Note(
      'Never collected',
      'Messages, photos, passwords, and fingerprint images stay outside the behavior profile.',
    ),
    if (c.historyError.isNotEmpty) AlertText(c.historyError),
    if (c.researchError.isNotEmpty) AlertText(c.researchError),
    if (c.history == null || c.research == null)
      ActionButton('Refresh data choices', _refresh, secondary: true),
    ActionButton(
      'Save preferences',
      c.saving || c.history == null || c.research == null
          ? null
          : () => unawaited(c.savePrivacy()),
    ),
    ActionButton(
      'Reset learned profile',
      c.saving
          ? null
          : () => unawaited(
              _confirm(
                context,
                'Clear research data?',
                'Delete the local research summaries and pending capture. Your credentials, selected apps, and security history are kept.',
                'Clear research data',
                () => c.clearResearch(fromPrivacy: true),
              ),
            ),
      secondary: true,
    ),
  ];

  String _date(BuildContext context, DateTime time) {
    final format = MaterialLocalizations.of(context);
    return '${format.formatMediumDate(time)} · ${format.formatTimeOfDay(TimeOfDay.fromDateTime(time))}';
  }

  List<Widget> _activity(BuildContext context) {
    final entries = c.history?.entries ?? const <HistoryEntry>[];
    final message = c.historyError.isNotEmpty
        ? c.historyError
        : c.history?.error;
    return [
      SectionLabel('Latest 100 checks', value: '${entries.length}'),
      if (message != null) AlertText(message),
      for (final event in entries)
        DetailRow(
          '${event.label} · ${HistoryEntry.outcomes[event.outcome]}',
          '${_date(context, event.time)} · ${event.method}',
          onTap: () => c.showEvent(event),
        ),
      if (entries.isEmpty && c.history != null)
        Note(
          'No saved security history',
          c.history!.enabled ? 'Verification attempts will appear here.' : 'New recording is paused. Enable Security history in Privacy & data to record future checks.',
        ),
      const Caption(
        'GhostAuth saves the latest 100 checks on this device. Entries contain the app, time, method and outcome.',
      ),
      if (c.history?.enabled == false)
        const Caption('New event recording is paused.'),
      ActionButton(
        'Refresh history',
        c.saving ? null : () => unawaited(c.refreshHistory()),
        secondary: true,
      ),
      ActionButton(
        'Clear history',
        c.saving || (entries.isEmpty && message == null)
            ? null
            : () => unawaited(
                _confirm(
                  context,
                  'Clear security history?',
                  'Delete the verification history saved on this device?',
                  'Clear history',
                  c.clearHistory,
                ),
              ),
        secondary: true,
      ),
    ];
  }

  List<Widget> _event(BuildContext context) {
    final event = c.currentEvent;
    return [
      if (event != null) ...[
        DetailRow(
          'Decision',
          '${HistoryEntry.outcomes[event.outcome]} · ${event.method}',
        ),
        DetailRow('Trigger', HistoryEntry.reasons[event.outcome]!),
        DetailRow('Time', _date(context, event.time)),
        DetailRow('Package', event.package),
        const DetailRow(
          'Session risk',
          'This build records the outcome of the identity check.',
        ),
      ] else
        const Caption('This event is no longer available.'),
      ActionButton(
        'Back to activity',
        () => c.go(Screen.activity),
        secondary: true,
      ),
    ];
  }
}
