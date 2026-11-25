import 'dart:async';
import 'dart:convert';

import 'package:flutter/services.dart';

typedef Data = Map<Object?, Object?>;

Data data(Object? value) {
  if (value is! Data) throw const FormatException('Invalid Android response');
  return value;
}

bool flag(Data value, String key) => value[key] as bool;
int integer(Data value, String key) => value[key] as int;
String string(Data value, String key) => value[key] as String;
bool validPackage(String id) =>
    id.length <= 255 &&
    RegExp(r'^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$').hasMatch(id);

abstract interface class GhostPlatform {
  Stream<Data> get events;
  Future<Data> call(String method, [Data? arguments]);
}

class AndroidPlatform implements GhostPlatform {
  const AndroidPlatform();

  static const _methods = MethodChannel('ghostauth/methods');
  static const _events = EventChannel('ghostauth/events');

  static final _eventStream = _events.receiveBroadcastStream().map(data);

  @override
  Stream<Data> get events => _eventStream;

  @override
  Future<Data> call(String method, [Data? arguments]) async {
    final answer = await _methods.invokeMethod<Object?>(method, arguments);
    return answer == null ? const {} : data(answer);
  }
}

final class AuthState {
  AuthState(Data value)
    : pinSet = flag(value, 'pinSet'),
      biometricAvailable = flag(value, 'biometricAvailable'),
      biometricEnabled = flag(value, 'biometricEnabled'),
      lockout = integer(value, 'lockedForSeconds'),
      sessionValid = flag(value, 'sessionValid'),
      remainingMillis = integer(value, 'sessionRemainingMillis') {
    if (lockout < 0 ||
        lockout > 3600 ||
        remainingMillis < 0 ||
        remainingMillis > 30000 ||
        sessionValid != (remainingMillis > 0) ||
        (biometricEnabled && (!pinSet || !biometricAvailable))) {
      throw const FormatException('Invalid Android authentication status');
    }
  }

  final bool pinSet;
  final bool biometricAvailable;
  final bool biometricEnabled;
  final int lockout;
  final bool sessionValid;
  final int remainingMillis;
}

final class InstalledApp {
  InstalledApp(Data value)
    : id = string(value, 'id'),
      name = string(value, 'name').trim(),
      icon = _decodeIcon(value['icon']) {
    if (!validPackage(id) || name.isEmpty) {
      throw const FormatException('Invalid app catalog entry');
    }
  }

  final String id;
  final String name;
  final Uint8List? icon;

  static Uint8List? _decodeIcon(Object? icon) {
    const header = 'data:image/png;base64,';
    if (icon is! String || !icon.startsWith(header) || icon.length > 65536) {
      return null;
    }
    try {
      return base64Decode(icon.substring(header.length));
    } on FormatException {
      return null;
    }
  }

  bool matches(String query) =>
      '$name $id'.toLowerCase().contains(query.trim().toLowerCase());
}

final class ProtectionRequest {
  ProtectionRequest(Data value)
    : id = string(value, 'id'),
      target = string(value, 'packageName') {
    if (id.isEmpty || id.length > 100 || !validPackage(target)) {
      throw const FormatException('Invalid protection request');
    }
  }
  final String id;
  final String target;
}

final class DeviceState {
  DeviceState(Data value) {
    final catalog = <String, InstalledApp>{};
    for (final entry in value['apps'] as List) {
      final app = InstalledApp(data(entry));
      if (app.id != 'com.ghostauth.app') catalog.putIfAbsent(app.id, () => app);
    }
    apps = catalog.values.toList()
      ..sort((a, b) {
        final byName = a.name.toLowerCase().compareTo(b.name.toLowerCase());
        return byName == 0 ? a.id.compareTo(b.id) : byName;
      });
    final permissions = data(value['permissions']);
    usage = flag(permissions, 'usage');
    notifications = flag(permissions, 'notifications');
    final protection = data(value['protection']);
    consent = flag(protection, 'enabled');
    connected = flag(protection, 'connected');
    if (flag(permissions, 'service') != active) {
      throw const FormatException('Invalid protection state');
    }
    selected = Set<String>.from(protection['packages'] as List);
    if (selected.any((id) => !validPackage(id) || id == 'com.ghostauth.app')) {
      throw const FormatException('Invalid protected packages');
    }
    selected = Set.unmodifiable(selected.where(catalog.containsKey));
    error = protection['error'] as String?;
    if (protection['pending'] != null) {
      final request = ProtectionRequest(data(protection['pending']));
      if (!active || !selected.contains(request.target)) {
        throw const FormatException('Unavailable protection request');
      }
      pending = request;
    }
  }

  late final List<InstalledApp> apps;
  late Set<String> selected;
  late final bool consent, connected, usage, notifications;
  late final String? error;
  ProtectionRequest? pending;

  bool get active => consent && connected;
}

final class HistoryEntry {
  HistoryEntry(Data value)
    : id = integer(value, 'id'),
      package = string(value, 'packageName'),
      label = string(value, 'label').trim(),
      method = string(value, 'method'),
      outcome = string(value, 'outcome'),
      time = DateTime.fromMillisecondsSinceEpoch(integer(value, 'occurredAt')) {
    if (id <= 0 ||
        !validPackage(package) ||
        label.isEmpty ||
        label.length > 160 ||
        (method != 'PIN' && method != 'fingerprint') ||
        !outcomes.containsKey(outcome) ||
        time.millisecondsSinceEpoch <= 0) {
      throw const FormatException('Invalid verification history');
    }
  }

  static const outcomes = {
    'verified': 'Verified',
    'failed': 'Failed',
    'canceled': 'Canceled',
    'locked-out': 'Locked out',
    'unavailable': 'Unavailable',
  };
  static const reasons = {
    'verified': 'Android identity verification completed.',
    'failed': 'Identity check did not match.',
    'canceled': 'Fingerprint verification was canceled.',
    'locked-out': 'Verification was denied during lockout.',
    'unavailable': 'Fingerprint verification was unavailable.',
  };

  final int id;
  final String package, label, method, outcome;
  final DateTime time;
}

final class HistoryState {
  HistoryState(Data value)
    : enabled = flag(value, 'enabled'),
      error = value['error'] as String?,
      entries = (value['entries'] as List)
          .map((row) => HistoryEntry(data(row)))
          .toList() {
    if (entries.length > 100) throw const FormatException('Too much history');
    for (var i = 1; i < entries.length; i++) {
      if (entries[i - 1].id <= entries[i].id) {
        throw const FormatException('Invalid history order');
      }
    }
  }

  final bool enabled;
  final String? error;
  final List<HistoryEntry> entries;
}

String platformMessage(Object failure, String fallback) {
  if (failure is! PlatformException) return fallback;
  return switch (failure.code) {
    'BIOMETRIC_LOCKOUT' =>
      'Too many fingerprint attempts. Use your PIN or try again later.',
    'BIOMETRIC_CANCELED' =>
      'Fingerprint verification was canceled. Try again or use your PIN.',
    'BIOMETRIC_UNAVAILABLE' => 'Fingerprint is unavailable. Use your PIN or enable it again in Settings.',
    'SESSION_ENDED' => 'Your verification ended. Please verify again.',
    _ => failure.message ?? fallback,
  };
}
