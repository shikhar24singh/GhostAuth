import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'platform.dart';

enum Screen {
  welcome,
  privacy,
  pinSetup,
  pinConfirm,
  biometricSetup,
  permissions,
  permissionDetail,
  selectApps,
  setupComplete,
  home,
  appDetail,
  risk,
  pinVerify,
  fingerprint,
  success,
  opening,
  activity,
  event,
  settings,
  security,
  privacySettings,
  research,
  diagnostic,
  recovery,
  recoveryInfo,
}

enum PinPurpose { access, enroll, change, enableBiometric, disableBiometric }

enum Permission { service, usage, notifications }

class GhostController extends ChangeNotifier {
  GhostController(this.platform);

  final GhostPlatform platform;
  StreamSubscription<Data>? _subscription;
  Timer? _proofTimer;
  Timer? _lockoutTimer;
  final _refreshVersions = <String, int>{};
  int _verification = 0;
  int _navigation = 0;
  bool _closed = false;
  bool _foreground = true;
  bool _initialized = false;
  bool _requestStarting = false;
  bool? _initialHistory, _initialMovement;
  bool _onboarding = false;
  bool _external = false;
  bool _autoOpen = true;
  String? _handledRequest;
  String _newPin = '';
  Screen _permissionBack = Screen.settings;
  Screen _permissionsBack = Screen.settings;
  Screen _privacyBack = Screen.settings;

  Screen screen = Screen.welcome;
  PinPurpose pinPurpose = PinPurpose.access;
  Permission permission = Permission.service;
  AuthState? auth;
  DeviceState? device;
  HistoryState? history;
  Data? research;
  bool dark = false;
  bool behavior = true;
  bool loading = false;
  bool saving = false;
  bool checking = false;
  bool launching = false;
  int remainingLockout = 0;
  String pin = '';
  String error = '';
  String authError = '';
  String deviceError = '';
  String historyError = '';
  String researchError = '';
  String startupError = '';
  Set<String> draftApps = {};
  bool draftBehavior = true, draftMovement = true, draftHistory = true;
  String? target;
  int? eventId;

  bool get ready => _initialized;
  bool get external => _external;
  bool get onboarding => _onboarding;
  int get navigation => _navigation;
  bool get identityScreen =>
      (screen == Screen.pinVerify && pinPurpose == PinPurpose.access) ||
      screen == Screen.fingerprint ||
      screen == Screen.success ||
      screen == Screen.opening;
  bool get movement => research?['movementAllowed'] == true;
  bool get canCheck =>
      _foreground &&
      !checking &&
      !launching &&
      !_requestStarting &&
      auth?.pinSet == true &&
      history != null;
  List<InstalledApp> get apps => device?.apps ?? const [];
  Set<String> get selected => device?.selected ?? const {};
  InstalledApp? get currentApp {
    for (final app in apps) {
      if (app.id == target) return app;
    }
    return null;
  }

  HistoryEntry? get currentEvent {
    for (final entry in history?.entries ?? const <HistoryEntry>[]) {
      if (entry.id == eventId) return entry;
    }
    return null;
  }

  void _emit() {
    if (!_closed) notifyListeners();
  }

  Future<void> start() async {
    if (loading) return;
    _subscription ??= platform.events.listen(
      _nativeEvent,
      onError: (Object _) {},
    );
    loading = true;
    startupError = '';
    _emit();
    try {
      final previous = await platform.call('preferences.get');
      if (_closed) return;
      behavior = flag(previous, 'behavior');
      _initialHistory = flag(previous, 'history');
      _initialMovement = flag(previous, 'movement');
      await Future.wait([
        _readAuth(),
        _refreshDevice(),
        _refreshHistory(),
        _refreshResearch(),
        _refreshTheme(),
      ]);
      _initialized = true;
    } catch (failure) {
      startupError = platformMessage(
        failure,
        'Saved settings are unavailable. Try again.',
      );
    } finally {
      loading = false;
      _emit();
    }
    _handlePending();
  }

  Future<void> refresh() async {
    if (!_initialized) {
      await start();
      return;
    }
    await Future.wait([
      _readAuth(),
      _refreshDevice(),
      _refreshHistory(),
      _refreshResearch(),
      _refreshTheme(),
    ]);
    _handlePending();
  }

  Future<void> _read(
    String group,
    String method,
    Data? arguments,
    void Function(Data) apply,
    void Function(Object) onError,
  ) async {
    final version = (_refreshVersions[group] ?? 0) + 1;
    _refreshVersions[group] = version;
    try {
      final value = await platform.call(method, arguments);
      if (!_closed && _refreshVersions[group] == version) apply(value);
    } catch (failure) {
      if (!_closed && _refreshVersions[group] == version) onError(failure);
    }
    _emit();
  }

  Future<void> _readAuth() async {
    if (checking || launching || !_foreground || _requestStarting) return;
    await _read('auth', 'auth.getStatus', null, _applyAuth, (failure) {
      auth = null;
      authError = platformMessage(
        failure,
        'Android authentication is unavailable. Refresh to retry.',
      );
    });
  }

  Future<void> _refreshDevice() => _read(
    'device',
    'device.getSnapshot',
    null,
    (value) {
      device = DeviceState(value);
      deviceError = '';
    },
    (failure) {
      device = null;
      deviceError = platformMessage(
        failure,
        'Could not read installed apps and permissions.',
      );
    },
  );

  Future<void> _refreshHistory() => _read(
    'history',
    'history.getSnapshot',
    _initialHistory == null ? null : {'initialEnabled': _initialHistory},
    (value) {
      history = HistoryState(value);
      historyError = '';
      _initialHistory = null;
    },
    (failure) {
      historyError = platformMessage(
        failure,
        'Could not read security history.',
      );
    },
  );

  Future<void> _refreshResearch() => _read(
    'research',
    'research.getSnapshot',
    _initialMovement == null ? null : {'initialMovement': _initialMovement},
    (value) {
      research = value;
      researchError = '';
      _initialMovement = null;
    },
    (failure) {
      researchError = platformMessage(
        failure,
        'Could not read motion research.',
      );
    },
  );

  Future<void> _refreshTheme() => _read(
    'appearance',
    'appearance.getTheme',
    null,
    (value) => dark = flag(value, 'dark'),
    (_) {},
  );

  void _invalidateRead(String group) {
    _refreshVersions[group] = (_refreshVersions[group] ?? 0) + 1;
  }

  void _applyAuth(Data value) {
    auth = AuthState(value);
    authError = '';
    remainingLockout = auth!.lockout;
    _lockoutTimer?.cancel();
    if (remainingLockout > 0) {
      final end = DateTime.now().add(Duration(seconds: remainingLockout));
      _lockoutTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
        final millis = end.difference(DateTime.now()).inMilliseconds;
        remainingLockout = millis <= 0 ? 0 : (millis + 999) ~/ 1000;
        if (remainingLockout == 0) timer.cancel();
        _emit();
      });
    }
  }

  void _nativeEvent(Data event) {
    if (_closed) return;
    switch (event['type']) {
      case 'protectionChanged':
        if (ready && _foreground)
          unawaited(_refreshDevice().then((_) => _handlePending()));
      case 'sessionEnded':
        if (event['active'] == false) pause();
      case 'biometricFailed':
        if (checking && screen == Screen.fingerprint) {
          error = 'Fingerprint did not match. Try again or use your PIN.';
          _emit();
        }
      case 'historyChanged':
        if (ready && _foreground)
          unawaited(_refreshHistory().then((_) => _handlePending()));
      case 'researchChanged':
        if (ready && _foreground) unawaited(_refreshResearch());
    }
  }

  void pause() {
    if (!_foreground) return;
    _foreground = false;
    _newPin = '';
    pin = '';
    _proofTimer?.cancel();
    if (!launching) {
      _verification++;
      checking = false;
      _requestStarting = false;
      if (identityScreen) {
        go(Screen.pinVerify);
        error = 'Your verification ended. Please verify again.';
      } else if (screen == Screen.pinConfirm || screen == Screen.pinVerify) {
        go(pinPurpose == PinPurpose.enroll ? Screen.pinSetup : Screen.security);
      }
    }
    _emit();
  }

  void resume() {
    _foreground = true;
    if (ready) unawaited(refresh());
  }

  void _handlePending() {
    if (_closed || !_foreground || !_initialized || launching || saving) return;
    final pending = device?.pending;
    if (pending == null) {
      _handledRequest = null;
      return;
    }
    if (pending.id == _handledRequest ||
        auth?.pinSet != true ||
        history == null)
      return;
    _handledRequest = pending.id;
    unawaited(beginVerification(pending.target, external: true));
  }

  void go(Screen next) {
    if (_closed) return;
    screen = next;
    _navigation++;
    pin = '';
    error = '';
    _emit();
  }

  void startOnboarding() {
    if (!ready || auth == null) return;
    _onboarding = auth?.pinSet == false;
    go(_onboarding ? Screen.privacy : Screen.home);
  }

  void startPinSetup({required bool change}) {
    pinPurpose = change ? PinPurpose.change : PinPurpose.enroll;
    _newPin = '';
    go(Screen.pinSetup);
  }

  void startBiometricChange(bool enable) {
    pinPurpose = enable
        ? PinPurpose.enableBiometric
        : PinPurpose.disableBiometric;
    go(Screen.pinVerify);
  }

  void addPin(String digit) {
    if (checking ||
        launching ||
        pin.length >= 6 ||
        !RegExp(r'^[0-9]$').hasMatch(digit))
      return;
    pin += digit;
    error = '';
    _emit();
  }

  void deletePin() {
    if (checking || launching || pin.isEmpty) return;
    pin = pin.substring(0, pin.length - 1);
    error = '';
    _emit();
  }

  Future<void> submitPin() async {
    if (!_foreground || checking || launching || _requestStarting) return;
    if (pin.length != 6) {
      error = 'Enter all six digits to continue.';
      _emit();
      return;
    }
    if (screen == Screen.pinSetup) {
      _newPin = pin;
      go(Screen.pinConfirm);
      return;
    }
    if (screen == Screen.pinConfirm) {
      if (pin != _newPin) {
        pin = '';
        error = 'The PINs do not match. Try again.';
        _emit();
        return;
      }
      if (pinPurpose == PinPurpose.change) {
        go(Screen.pinVerify);
        return;
      }
      await _authAction('enrollPin', {'pin': pin}, (result) async {
        _newPin = '';
        if (!auth!.pinSet) throw const FormatException('PIN setup incomplete');
        go(Screen.biometricSetup);
      });
      return;
    }
    if (screen != Screen.pinVerify) return;
    switch (pinPurpose) {
      case PinPurpose.enroll:
        return;
      case PinPurpose.change:
        await _changeSecurity('changePin', {
          'currentPin': pin,
          'newPin': _newPin,
        });
      case PinPurpose.enableBiometric:
        await _changeSecurity('enableBiometric', {'pin': pin});
      case PinPurpose.disableBiometric:
        await _changeSecurity('disableBiometric', {'pin': pin});
      case PinPurpose.access:
        final pkg = target;
        if (!canCheck || pkg == null || !selected.contains(pkg)) return;
        await _authAction('verifyPin', {'pin': pin, 'packageName': pkg}, (
          result,
        ) async {
          if (result['verified'] == true && auth!.sessionValid) {
            await _verified(pkg);
          } else {
            _pinFailure();
          }
        });
    }
  }

  void _pinFailure() {
    error = remainingLockout > 0
        ? 'Too many attempts. Try again in $remainingLockout seconds.'
        : 'That PIN did not match. Try again.';
    _emit();
  }

  Future<void> _changeSecurity(String method, Data arguments) =>
      _authAction(method, arguments, (result) async {
        if (result['changed'] == true) {
          _newPin = '';
          go(_onboarding ? Screen.permissions : Screen.security);
        } else {
          _pinFailure();
        }
      });

  Future<void> _authAction(
    String method,
    Data arguments,
    Future<void> Function(Data) completed,
  ) async {
    final verification = _verification;
    final where = _navigation;
    _invalidateRead('auth');
    checking = true;
    pin = '';
    error = '';
    _emit();
    try {
      final result = await platform.call('auth.$method', arguments);
      if (_closed ||
          verification != _verification ||
          where != _navigation ||
          !_foreground)
        return;
      _applyAuth(result);
      await completed(result);
    } catch (failure) {
      if (_closed ||
          verification != _verification ||
          where != _navigation ||
          !_foreground)
        return;
      if (failure is PlatformException && failure.code == 'BIOMETRIC_USE_PIN') {
        go(Screen.pinVerify);
      } else {
        error = platformMessage(
          failure,
          'Authentication unavailable. Try again.',
        );
      }
    } finally {
      if (verification == _verification) {
        checking = false;
        _emit();
      }
    }
  }

  void openApp(InstalledApp app) {
    target = app.id;
    go(Screen.appDetail);
  }

  Future<void> beginVerification(
    String pkg, {
    bool external = false,
    bool immediate = true,
  }) async {
    if (_closed ||
        !_foreground ||
        launching ||
        auth?.pinSet != true ||
        history == null ||
        !selected.contains(pkg))
      return;
    final request = ++_verification;
    pinPurpose = PinPurpose.access;
    target = pkg;
    _external = external;
    _autoOpen = immediate;
    _newPin = '';
    _proofTimer?.cancel();
    _requestStarting = true;
    checking = false;
    go(
      auth!.biometricEnabled && immediate
          ? Screen.fingerprint
          : Screen.pinVerify,
    );
    try {
      await platform.call('auth.lock');
    } catch (failure) {
      if (request == _verification) {
        _requestStarting = false;
        error = platformMessage(failure, 'Could not start a new verification.');
        _emit();
      }
      return;
    }
    if (_closed || request != _verification || !_foreground || !identityScreen)
      return;
    _requestStarting = false;
    _emit();
    if (screen == Screen.fingerprint) await verifyFingerprint();
  }

  Future<void> verifyFingerprint() async {
    final pkg = target;
    if (!canCheck ||
        pkg == null ||
        !selected.contains(pkg) ||
        auth?.biometricEnabled != true)
      return;
    if (screen != Screen.fingerprint) go(Screen.fingerprint);
    await _authAction('verifyBiometric', {'packageName': pkg}, (result) async {
      if (result['verified'] == true && auth!.sessionValid) {
        await _verified(pkg);
      } else {
        error = 'Fingerprint verification did not complete.';
      }
    });
  }

  void usePinInstead() => go(Screen.pinVerify);

  Future<void> _verified(String pkg) async {
    if (target != pkg || !selected.contains(pkg)) {
      await cancelVerification();
      return;
    }
    if (_autoOpen) {
      await launchVerified();
      return;
    }
    go(Screen.success);
    final issued = _verification;
    _proofTimer?.cancel();
    _proofTimer = Timer(Duration(milliseconds: auth!.remainingMillis), () {
      if (issued == _verification && screen == Screen.success) {
        go(Screen.pinVerify);
        error = 'Your verification expired. Please verify again.';
        _emit();
      }
    });
  }

  Future<void> launchVerified() async {
    final pkg = target;
    if (_closed ||
        launching ||
        !_foreground ||
        pkg == null ||
        !selected.contains(pkg) ||
        auth?.sessionValid != true)
      return;
    _proofTimer?.cancel();
    launching = true;
    go(Screen.opening);
    try {
      await platform.call('auth.launchApp', {'packageName': pkg});
      if (_closed) return;
      _external = false;
      target = null;
      go(Screen.home);
    } catch (failure) {
      if (_closed) return;
      go(Screen.pinVerify);
      error = platformMessage(
        failure,
        'Could not confirm the app opened. Verify again to retry.',
      );
    } finally {
      await _lockNative();
      launching = false;
      _emit();
      if (_foreground && !_closed) unawaited(refresh());
    }
  }

  Future<void> _lockNative() async {
    try {
      await platform.call('auth.lock');
    } catch (_) {}
  }

  Future<void> cancelVerification() async {
    if (launching) return;
    final needsReturn = _external;
    final next = pinPurpose == PinPurpose.access
        ? (needsReturn ? Screen.home : Screen.appDetail)
        : (_onboarding ? Screen.biometricSetup : Screen.security);
    _verification++;
    _requestStarting = false;
    checking = false;
    _proofTimer?.cancel();
    _external = false;
    _newPin = '';
    go(next);
    await _lockNative();
    if (needsReturn) {
      try {
        await platform.call('device.cancelProtection');
      } catch (failure) {
        error = platformMessage(
          failure,
          'Could not close the protected app. Return to your home screen.',
        );
      }
    }
    _emit();
  }

  void editApps() {
    draftApps = Set.of(selected);
    go(Screen.selectApps);
  }

  void toggleApp(String id, bool selected) {
    if (selected) {
      draftApps.add(id);
    } else {
      draftApps.remove(id);
    }
    error = '';
    _emit();
  }

  Future<void> saveApps() => _save(() async {
    if (device == null || auth?.pinSet != true) return;
    final packages = apps
        .where((app) => draftApps.contains(app.id))
        .map((app) => app.id)
        .toList();
    if (_onboarding && packages.isEmpty) {
      error = 'Choose at least one app to turn on protection.';
      return;
    }
    await platform.call('device.configureProtection', {'packages': packages});
    await _refreshDevice();
    go(_onboarding ? Screen.setupComplete : Screen.home);
  });

  void finishOnboarding() {
    _onboarding = false;
    go(Screen.home);
  }

  void openPermissions({bool fromOnboarding = false}) {
    if (fromOnboarding) _onboarding = true;
    if (screen != Screen.permissions) _permissionsBack = screen;
    go(Screen.permissions);
  }

  void explainPermission(Permission value) {
    _permissionBack = screen;
    permission = value;
    go(Screen.permissionDetail);
  }

  Future<void> openAndroidSettings() => _save(() async {
    await platform.call('device.openSettings', {'permission': permission.name});
  });

  Future<void> enableProtection() => _save(() async {
    if (device == null || auth?.pinSet != true) return;
    await platform.call('device.configureProtection', {
      'packages': selected.toList(),
      'enabled': true,
    });
    await _refreshDevice();
    if (device?.connected != true) {
      await platform.call('device.openSettings', {'permission': 'service'});
    }
  });

  Future<void> disableProtection() => _save(() async {
    await platform.call('device.configureProtection', {'enabled': false});
    await _refreshDevice();
  });

  Future<void> changeTheme(bool enabled) => _save(() async {
    _invalidateRead('appearance');
    final result = await platform.call('appearance.setTheme', {
      'dark': enabled,
    });
    dark = flag(result, 'dark');
  });

  void editPrivacy() {
    _privacyBack = screen;
    draftBehavior = behavior;
    draftMovement = movement;
    draftHistory = history?.enabled ?? true;
    go(Screen.privacySettings);
  }

  void setPrivacy(String key, bool value) {
    switch (key) {
      case 'behavior':
        draftBehavior = value;
      case 'movement':
        draftMovement = value;
      case 'history':
        draftHistory = value;
    }
    _emit();
  }

  Future<void> savePrivacy() => _save(() async {
    if (history == null || research == null) return;
    await _setHistory('history.configureRecording', {'enabled': draftHistory});
    await _setResearch('research.configure', {
      'movementAllowed': draftMovement,
    });
    final details = await platform.call('preferences.setBehavior', {
      'behavior': draftBehavior,
    });
    behavior = flag(details, 'behavior');
    go(_privacyBack);
  });

  Future<void> resetPreferences() => _save(() async {
    await platform.call('device.configureProtection', {'packages': <String>[]});
    await _setHistory('history.configureRecording', {'enabled': true});
    await _setResearch('research.configure', {
      'enabled': false,
      'movementAllowed': true,
    });
    final details = await platform.call('preferences.setBehavior', {
      'behavior': true,
    });
    behavior = flag(details, 'behavior');
    await _refreshDevice();
  });

  Future<void> _setHistory(String method, [Data? arguments]) async {
    _invalidateRead('history');
    history = HistoryState(await platform.call(method, arguments));
    historyError = '';
  }

  Future<void> _setResearch(String method, [Data? arguments]) async {
    _invalidateRead('research');
    research = await platform.call(method, arguments);
    researchError = '';
  }

  Future<void> clearHistory() =>
      _save(() => _setHistory('history.clearHistory'));
  Future<void> refreshHistory() => _refreshHistory();
  Future<void> refreshDevice() => _refreshDevice();
  Future<void> refreshResearch() => _refreshResearch();
  Future<void> configureResearch(bool enabled) =>
      _save(() => _setResearch('research.configure', {'enabled': enabled}));

  Future<void> clearResearch({bool fromPrivacy = false}) => _save(() async {
    await _setResearch('research.clearData');
    if (fromPrivacy) go(Screen.research);
  });

  void showEvent(HistoryEntry entry) {
    eventId = entry.id;
    go(Screen.event);
  }

  Future<void> _save(Future<void> Function() work) async {
    if (_closed || saving || checking || launching) return;
    saving = true;
    error = '';
    _emit();
    try {
      await work();
    } catch (failure) {
      error = platformMessage(failure, 'Could not save the change. Try again.');
    } finally {
      saving = false;
      _emit();
      _handlePending();
    }
  }

  Future<bool> back() async {
    if (launching || saving) return true;
    if (identityScreen || screen == Screen.pinVerify) {
      await cancelVerification();
      return true;
    }
    final next = switch (screen) {
      Screen.welcome || Screen.home => null,
      Screen.privacy => Screen.welcome,
      Screen.pinSetup =>
        pinPurpose == PinPurpose.change ? Screen.security : Screen.privacy,
      Screen.pinConfirm => Screen.pinSetup,
      Screen.biometricSetup => Screen.permissions,
      Screen.permissions =>
        _onboarding ? Screen.biometricSetup : _permissionsBack,
      Screen.permissionDetail => _permissionBack,
      Screen.selectApps => _onboarding ? Screen.permissions : Screen.home,
      Screen.setupComplete => Screen.home,
      Screen.risk => Screen.appDetail,
      Screen.event => Screen.activity,
      Screen.privacySettings => _privacyBack,
      Screen.diagnostic => Screen.research,
      Screen.recoveryInfo => Screen.recovery,
      Screen.appDetail || Screen.activity || Screen.settings => Screen.home,
      _ => Screen.settings,
    };
    if (next == null) return false;
    if (screen == Screen.setupComplete) _onboarding = false;
    _newPin = '';
    go(next);
    return true;
  }

  @override
  void dispose() {
    _closed = true;
    _proofTimer?.cancel();
    _lockoutTimer?.cancel();
    unawaited(_subscription?.cancel());
    super.dispose();
  }
}
