import 'dart:async';

import 'package:flutter/services.dart';
import 'package:ghostauth/platform.dart';

const first = 'com.example.mail';
const second = 'com.example.photos';

class DeviceFixture implements GhostPlatform {
  final changes = StreamController<Data>.broadcast();
  final operations = <(String, Data?)>[];
  String? pin = '246810';
  bool fingerprint = false,
      dark = false,
      behavior = true,
      history = true,
      movement = true;
  bool research = false, launched = false;
  Set<String> packages = {first, second};
  Data? pending;
  Completer<Data>? biometricResult;
  Completer<Data>? arrival;
  Data diagnostic = {
    'windowMillis': 5000,
    'state': 'idle',
    'canStart': true,
    'accelerometer': true,
    'gyroscope': true,
  };

  @override
  Stream<Data> get events => changes.stream;

  Data auth({bool verified = false, bool? changed}) => {
    'pinSet': pin != null,
    'biometricAvailable': true,
    'biometricEnabled': fingerprint,
    'lockedForSeconds': 0,
    'sessionValid': verified,
    'sessionRemainingMillis': verified ? 30000 : 0,
    'verified': verified,
    if (changed != null) 'changed': changed,
  };

  Data get historyStatus => {'enabled': history, 'entries': <Data>[]};
  Data get researchStatus => {
    'enabled': research,
    'movementAllowed': movement,
    'total': 0,
  };
  List<(String, Data?)> calls(String name) =>
      operations.where((request) => request.$1 == name).toList();

  @override
  Future<Data> call(String method, [Data? arguments]) async {
    operations.add((method, arguments));
    switch (method) {
      case 'preferences.get':
        return {'behavior': behavior, 'history': history, 'movement': movement};
      case 'preferences.setBehavior':
        behavior = arguments!['behavior'] as bool;
        return {'behavior': behavior};
      case 'auth.getStatus':
        return auth();
      case 'auth.enrollPin':
        pin = arguments!['pin'] as String;
        return auth();
      case 'auth.verifyPin':
        return auth(verified: arguments!['pin'] == pin);
      case 'auth.verifyBiometric':
        if (biometricResult != null) return biometricResult!.future;
        throw PlatformException(code: 'BIOMETRIC_USE_PIN');
      case 'auth.launchApp':
        if (arrival != null) await arrival!.future;
        launched = true;
        return {};
      case 'auth.lock':
        return {};
      case 'device.getSnapshot':
        return {
          'apps': [
            {'id': first, 'name': 'Example Mail'},
            {'id': second, 'name': 'Example Photos'},
          ],
          'permissions': {
            'usage': false,
            'notifications': false,
            'service': true,
          },
          'protection': {
            'enabled': true,
            'connected': true,
            'packages': packages.toList(),
            'pending': pending,
          },
        };
      case 'device.configureProtection':
        packages = Set<String>.from(arguments!['packages'] as List);
        return {};
      case 'device.cancelProtection':
        pending = null;
        return {};
      case 'appearance.getTheme':
        return {'dark': dark};
      case 'appearance.setTheme':
        dark = arguments!['dark'] as bool;
        return {'dark': dark};
      case 'history.getSnapshot':
      case 'history.clearHistory':
        return historyStatus;
      case 'history.configureRecording':
        history = arguments!['enabled'] as bool;
        return historyStatus;
      case 'research.getSnapshot':
      case 'research.clearData':
        return researchStatus;
      case 'research.configure':
        movement = arguments!['movementAllowed'] as bool? ?? movement;
        research = arguments['enabled'] as bool? ?? research;
        return researchStatus;
      case 'research.openDiagnostic':
        return {'lease': 'fixture-lease', 'status': diagnostic};
      case 'research.getDiagnostic':
      case 'research.startDiagnostic':
        return diagnostic;
      case 'research.closeDiagnostic':
        return {};
      default:
        throw StateError('Unmapped platform operation $method');
    }
  }
}
