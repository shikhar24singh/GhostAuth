import 'dart:async';

// Use the Material library bundled with Flutter 3.50.
// ignore: deprecated_member_use
import 'package:flutter/material.dart';

import 'controller.dart';
import 'platform.dart';
import 'ui.dart';

const _stopLabels = {
  'too_short': 'No sampling window',
  'movement_disabled': 'Movement signals disabled',
  'pin_flow': 'PIN flow',
  'focus_lost': 'GhostAuth lost focus',
  'no_sensors': 'No motion sensors',
  'sensor_unavailable': 'Sensor registration unavailable',
  'window_limit': '10-second limit reached',
  'verification_finished': 'Verification finished',
  'backgrounded': 'GhostAuth left the foreground',
  'screen_locked': 'Screen turned off',
  'canceled': 'Verification canceled',
  'request_replaced': 'Another verification started',
};

const _qualityLabels = {
  'eligible': 'Usable motion',
  'not_verified': 'Verification did not complete successfully',
  'too_short': 'Too little motion data',
  'sensor_gap': 'Gaps in sensor delivery',
  'invalid_samples': 'Invalid or unreliable readings',
  'pin_flow': 'PIN flow excluded from motion capture',
  'focus_lost': 'GhostAuth lost focus before sampling',
  'verification_finished': 'Verification finished before sampling',
};

const _diagnosticReasons = {
  'completed': 'Five-second test finished',
  'stopped_by_user': 'You stopped the test',
  'focus_lost': 'GhostAuth lost focus',
  'backgrounded': 'GhostAuth left the foreground',
  'screen_off': 'Screen turned off',
  'settings_changed': 'Research settings changed',
  'verification_started': 'Verification started',
  'authentication_changed': 'Authentication state changed',
  'screen_left': 'Diagnostic screen closed',
  'sensor_unavailable': 'Sensor registration unavailable',
  'no_sensors': 'No motion sensors',
  'storage_unavailable': 'Research settings unavailable',
  'unavailable': 'Diagnostic unavailable',
};

int _count(Data data, String key) => (data[key] as int?) ?? 0;
Data _details(Object? value) => value is Data ? value : const {};
String _available(Object? value) => value == true ? 'available' : 'missing';
String _metric(Object? value, int places, String unit, {num divisor = 1}) =>
    value is num && value.isFinite
    ? '${(value / divisor).toStringAsFixed(places)} $unit'
    : 'unavailable';

String _sensorDelivery(Data sensor) {
  if (_count(sensor, 'windows') == 0)
    return 'No readings in retained fingerprint checks';
  final duration = _metric(
    sensor['medianDurationMillis'],
    2,
    's',
    divisor: 1000,
  );
  final rate = _metric(sensor['medianRateHz'], 1, 'Hz');
  final gap = _metric(sensor['maxGapMillis'], 0, 'ms');
  return '${sensor['windows']} sampled windows · ${sensor['usableWindows']} usable\n'
      'Median window $duration\n${sensor['medianRateHz'] == null ? 'Too few readings to measure rate or gaps' : 'Median rate $rate · Largest gap $gap'}';
}

class ResearchPanel extends StatelessWidget {
  const ResearchPanel(this.controller, {super.key});
  final GhostController controller;

  Future<void> _confirm(
    BuildContext context,
    String title,
    String body,
    String label,
    Future<void> Function() action,
  ) async {
    final page = controller.navigation;
    if (await confirm(context, title, body, label) &&
        context.mounted &&
        controller.navigation == page)
      await action();
  }

  @override
  Widget build(BuildContext context) {
    final status = controller.research;
    final enabled = status?['enabled'] == true;
    final diagnostics = _details(status?['diagnostics']);
    final acceleration = _details(diagnostics['acceleration']);
    final rotation = _details(diagnostics['rotation']);
    final checks = _count(diagnostics, 'fingerprintSessions');
    final usableChecks = _count(diagnostics, 'usableFingerprintSessions');
    final both = _count(diagnostics, 'bothSensorsUsable');
    final statusMessage = status?['pausedForError'] == true
        ? 'Stopped · storage needs attention'
        : !enabled
        ? 'Off'
        : status?['movementAllowed'] != true
        ? 'Motion paused · Movement signals disabled'
        : status?['collecting'] == true
        ? 'Sampling motion'
        : 'Enabled · waiting for verification';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 9,
      children: [
        const Note(
          'Collection pilot',
          'Optional foreground motion research during GhostAuth verification. Fingerprint and PIN remain required for their respective checks. The research model runs offline.',
        ),
        if (controller.researchError.isNotEmpty)
          AlertText(controller.researchError),
        if (status?['error'] case final String message) AlertText(message),
        if (status != null) ...[
          DetailRow('Collection status', statusMessage),
          DetailRow(
            'Retained sessions',
            '${status['total']} total · ${status['eligible']} usable · ${status['rejected']} insufficient or unverified',
          ),
          DetailRow(
            'Motion sensors',
            'Accelerometer ${_available(status['accelerometer'])} · Gyroscope ${_available(status['gyroscope'])}',
          ),
          const SectionLabel('Retained fingerprint coverage'),
          DetailRow(
            'Usable fingerprint checks',
            '${checks == 0 ? 'No retained fingerprint checks yet' : '$usableChecks of $checks (${(100 * usableChecks / checks).toStringAsFixed(1)}%)'}\n'
                '${_count(diagnostics, 'pinSessions')} PIN checks excluded from this percentage',
          ),
          if (usableChecks > 0)
            DetailRow(
              'Usable sensor combinations',
              'Both sensors $both · accelerometer only ${_count(acceleration, 'usableWindows') - both} · gyroscope only ${_count(rotation, 'usableWindows') - both}',
            ),
          DetailRow('Accelerometer delivery', _sensorDelivery(acceleration)),
          DetailRow('Gyroscope delivery', _sensorDelivery(rotation)),
          if (checks > 0) const SectionLabel('Why fingerprint capture stopped'),
          for (final row in _details(diagnostics['stops']).entries)
            DetailRow(
              _stopLabels[row.key] ?? 'Unspecified stop',
              '${row.value} checks',
            ),
          if (_count(status, 'total') > 0)
            const SectionLabel('Session quality outcomes'),
          for (final row in _details(status['reasons']).entries)
            DetailRow(
              _qualityLabels[row.key] ??
                  _stopLabels[row.key] ??
                  'Unspecified outcome',
              '${row.value} sessions',
            ),
        ],
        const Caption(
          'GhostAuth discards raw motion and saves encrypted summaries on this device. The pilot collects no PIN input, typing, fingerprint images, or activity inside other apps.',
        ),
        const Caption(
          'GhostAuth retains up to 500 sessions or 10 MiB for seven days and prunes them on the next read or write. Fingerprint checks can finish before enough data arrives.',
        ),
        const Caption(
          'Coverage includes all retained fingerprint checks while enrolled. Sensor medians include windows with readings even when verification did not supply an eligible sample.',
        ),
        if (enabled && status?['movementAllowed'] != true)
          const Caption(
            'Verification diagnostics still record outcomes while Movement signals are off. Pause research collection to stop those too.',
          ),
        ActionButton(
          enabled ? 'Pause research collection' : 'Review and enable research',
          controller.saving || status == null
              ? null
              : enabled
              ? () => unawaited(controller.configureResearch(false))
              : () => unawaited(
                  _confirm(
                    context,
                    'Enable motion research?',
                    'Allow short foreground accelerometer and gyroscope windows during fingerprint verification. PIN checks record outcome diagnostics only. Summaries stay encrypted on this device and can be cleared at any time. Collection requires saved Movement signals consent.',
                    'Agree and enable',
                    () => controller.configureResearch(true),
                  ),
                ),
        ),
        ActionButton(
          'Open motion diagnostic',
          () => controller.go(Screen.diagnostic),
          secondary: true,
        ),
        ActionButton(
          'Review data choices',
          controller.editPrivacy,
          secondary: true,
        ),
        ActionButton(
          'Refresh research',
          controller.saving
              ? null
              : () => unawaited(controller.refreshResearch()),
          secondary: true,
        ),
        ActionButton(
          'Clear research data',
          controller.saving
              ? null
              : () => unawaited(
                  _confirm(
                    context,
                    'Clear research data?',
                    'Delete saved research summaries and discard any pending research capture. Your PIN, fingerprint, app selection, security history and research consent are kept.',
                    'Clear research data',
                    controller.clearResearch,
                  ),
                ),
          secondary: true,
        ),
      ],
    );
  }
}

class MotionDiagnosticPanel extends StatefulWidget {
  const MotionDiagnosticPanel({
    required this.platform,
    required this.onBack,
    super.key,
  });
  final GhostPlatform platform;
  final VoidCallback onBack;

  @override
  State<MotionDiagnosticPanel> createState() => _MotionDiagnosticPanelState();
}

class _MotionDiagnosticPanelState extends State<MotionDiagnosticPanel>
    with WidgetsBindingObserver {
  StreamSubscription<Data>? _events;
  Timer? _poll;
  String? _lease;
  Data? _status;
  String _error = '', _notice = '';
  bool _busy = false, _reading = false;
  int _generation = 0;
  bool get _running => _status?['state'] == 'running';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _events = widget.platform.events.listen((event) {
      if (event['type'] == 'diagnosticChanged') unawaited(_read());
    }, onError: (Object _) {});
    unawaited(_open());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(_read());
  }

  Future<void> _open() async {
    try {
      final result = await widget.platform.call('research.openDiagnostic');
      final lease = string(result, 'lease');
      if (lease.isEmpty || lease.length > 128)
        throw const FormatException('Invalid diagnostic lease');
      if (!mounted) {
        await _close(lease);
        return;
      }
      _lease = lease;
      _apply(data(result['status']));
    } catch (failure) {
      if (mounted)
        setState(
          () => _error = platformMessage(
            failure,
            'The motion diagnostic is unavailable.',
          ),
        );
    }
  }

  void _apply(Data value) {
    if (!const [
          'idle',
          'running',
          'complete',
          'stopped',
        ].contains(value['state']) ||
        value['windowMillis'] != 5000 ||
        (value['state'] != 'idle' && value['run'] is! Data)) {
      throw const FormatException('Invalid motion diagnostic');
    }
    setState(() {
      _status = value;
      _error = '';
    });
    if (_running && _poll == null) {
      _poll = Timer.periodic(
        const Duration(seconds: 1),
        (_) => unawaited(_read()),
      );
    } else if (!_running) {
      _poll?.cancel();
      _poll = null;
    }
  }

  Future<void> _read() async {
    final lease = _lease;
    if (!mounted || lease == null || _busy || _reading) return;
    final version = ++_generation;
    _reading = true;
    try {
      final value = await widget.platform.call('research.getDiagnostic', {
        'lease': lease,
      });
      if (mounted && version == _generation) _apply(value);
    } catch (failure) {
      if (mounted && version == _generation) {
        setState(
          () => _error = platformMessage(
            failure,
            'Could not read the diagnostic. Reopen this screen to retry.',
          ),
        );
      }
    } finally {
      _reading = false;
    }
  }

  Future<void> _change(String action, [Data extra = const {}]) async {
    final lease = _lease;
    if (!mounted || lease == null || _busy) return;
    _generation++;
    setState(() {
      _busy = true;
      _error = '';
      _notice = '';
    });
    try {
      final value = await widget.platform.call('research.${action}Diagnostic', {
        'lease': lease,
        ...extra,
      });
      if (!mounted) return;
      if (action == 'copy') {
        if (value['copied'] != true)
          throw const FormatException('Could not copy');
        setState(() => _notice = 'Results copied to your clipboard.');
      } else {
        _apply(value);
      }
    } catch (failure) {
      if (mounted)
        setState(
          () => _error = platformMessage(
            failure,
            'Could not update the diagnostic. Try again.',
          ),
        );
    } finally {
      if (mounted) {
        setState(() => _busy = false);
        unawaited(_read());
      }
    }
  }

  Future<void> _start() async {
    final allowed = await confirm(
      context,
      'Run a motion diagnostic?',
      'Allow a five-second accelerometer and gyroscope delivery test while the app is visible and focused? Delivery statistics stay temporarily in memory. There is no fingerprint step, profile training, or change to app protection.',
      'Agree and start test',
    );
    if (allowed && mounted) await _change('start', {'consent': true});
  }

  Future<void> _close(String lease) async {
    try {
      await widget.platform.call('research.closeDiagnostic', {'lease': lease});
    } catch (_) {}
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_events?.cancel());
    _poll?.cancel();
    final lease = _lease;
    if (lease != null) unawaited(_close(lease));
    super.dispose();
  }

  String _sensor(Data value) {
    final elapsed = _metric(value['durationMillis'], 3, 's', divisor: 1000);
    final rate = _metric(value['rateHz'], 2, 'Hz');
    final gap = _metric(value['maxGapMillis'], 0, 'ms');
    return '${value['samples'] ?? 0} samples · $elapsed\n'
        '${value['rateHz'] == null ? 'Rate and gap unavailable' : '$rate · largest gap $gap'}\n'
        '${value['quality'] == 'eligible' ? 'Sufficient delivery' : _qualityLabels[value['quality']] ?? 'Delivery quality unavailable'}';
  }

  @override
  Widget build(BuildContext context) {
    final run = _details(_status?['run']);
    final id = run['id'];
    final seconds = ((_count(run, 'remainingMillis') + 999) ~/ 1000).clamp(
      0,
      5,
    );
    final blocked = switch (_status?['blockedReason']) {
      'research_disabled' => 'Enable motion research on the previous screen before running this test.',
      'movement_disabled' =>
        'Enable Movement signals in Privacy & data and save before starting.',
      'not_foreground' => 'Keep GhostAuth visible and focused to start a test.',
      'storage_unavailable' =>
        'Research settings are unavailable. Review motion research.',
      'verification_active' =>
        'Finish or cancel verification before starting this separate test.',
      _ => '',
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 9,
      children: [
        const Note(
          'Sensor delivery test',
          'This five-second test measures sensor delivery while GhostAuth is visible. It runs independently of identity verification and app access.',
        ),
        if (_error.isNotEmpty) AlertText(_error),
        if (_notice.isNotEmpty) AlertText(_notice),
        if (_status == null && _error.isEmpty)
          const Caption('Preparing the diagnostic…'),
        if (_status != null) ...[
          DetailRow(
            'Diagnostic status',
            _running
                ? 'Collecting · $seconds seconds remaining'
                : _diagnosticReasons[run['reason']] ??
                      'Ready for an explicit test',
          ),
          DetailRow(
            'Motion sensors',
            'Accelerometer ${_available(_status?['accelerometer'])} · Gyroscope ${_available(_status?['gyroscope'])}',
          ),
          if (blocked.isNotEmpty) Caption(blocked),
          if (run.isNotEmpty) ...[
            const SectionLabel('Diagnostic delivery only'),
            DetailRow(
              'Accelerometer test',
              _sensor(_details(run['acceleration'])),
            ),
            DetailRow('Gyroscope test', _sensor(_details(run['rotation']))),
          ],
        ],
        const Caption(
          'Hold the phone comfortably. GhostAuth requests 20 Hz. Leaving, losing focus, locking the screen, or changing research settings stops the run. Start the next run yourself.',
        ),
        const Caption(
          'Only the latest result stays in memory. Copy results puts its delivery summary on the clipboard.',
        ),
        if (_running)
          ActionButton(
            'Stop test',
            _busy ? null : () => unawaited(_change('stop')),
          )
        else
          ActionButton(
            'Start five-second test',
            _busy || _status?['canStart'] != true
                ? null
                : () => unawaited(_start()),
          ),
        ActionButton(
          'Copy results',
          _busy || _running || id is! int
              ? null
              : () => unawaited(_change('copy', {'runId': id})),
          secondary: true,
        ),
        ActionButton(
          'Clear diagnostic result',
          _busy || _running || id is! int
              ? null
              : () => unawaited(_change('clear')),
          secondary: true,
        ),
        ActionButton(
          'Refresh diagnostic',
          _busy ? null : () => unawaited(_lease == null ? _open() : _read()),
          secondary: true,
        ),
        ActionButton('Back to motion research', widget.onBack, secondary: true),
      ],
    );
  }
}
