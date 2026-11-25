import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostauth/controller.dart';
import 'package:ghostauth/platform.dart';

import 'device_fixture.dart';

Future<void> drain() => Future<void>.delayed(Duration.zero);

void enterPin(GhostController c, String pin) {
  for (final digit in pin.split('')) {
    c.addPin(digit);
  }
}

void main() {
  test('configured install uses native authentication and waits for the selected app to arrive', () async {
    final fixture = DeviceFixture()..arrival = Completer<Data>();
    final c = GhostController(fixture);
    addTearDown(() async {
      c.dispose();
      await fixture.changes.close();
    });
    await c.start();
    c.startOnboarding();
    expect(c.screen, Screen.home);
    await c.beginVerification(first);
    enterPin(c, '123456');
    await c.submitPin();
    expect(c.error, contains('did not match'));
    expect(fixture.calls('auth.launchApp'), isEmpty);
    enterPin(c, '246810');
    final verification = c.submitPin();
    await drain();
    expect(c.screen, Screen.opening);
    expect(fixture.calls('auth.launchApp').single.$2!['packageName'], first);
    expect(fixture.launched, isFalse);
    fixture.arrival!.complete({});
    await verification;
    expect(c.screen, Screen.home);
    expect(fixture.launched, isTrue);
  });

  test('biometric fallback keeps the pending package and an unconfirmed launch requires a retry', () async {
    final fixture = DeviceFixture()
      ..fingerprint = true
      ..pending = {'id': 'request-one', 'packageName': first}
      ..arrival = Completer<Data>();
    final c = GhostController(fixture);
    addTearDown(() async {
      c.dispose();
      await fixture.changes.close();
    });
    await c.start();
    await drain();
    expect(c.external, isTrue);
    expect(c.screen, Screen.pinVerify);
    expect(
      fixture.calls('auth.verifyBiometric').single.$2!['packageName'],
      first,
    );
    enterPin(c, '246810');
    final verification = c.submitPin();
    await drain();
    fixture.arrival!.completeError(
      PlatformException(
        code: 'APP_NOT_OPENED',
        message: 'App open unconfirmed.',
      ),
    );
    await verification;
    expect(c.screen, Screen.pinVerify);
    expect(c.error, 'App open unconfirmed.');
    expect(fixture.launched, isFalse);
    expect(fixture.calls('auth.launchApp').single.$2!['packageName'], first);
  });

  test(
    'a canceled fingerprint result cannot authorize a replacement target',
    () async {
      final fixture = DeviceFixture()
        ..fingerprint = true
        ..biometricResult = Completer<Data>();
      final c = GhostController(fixture);
      addTearDown(() async {
        c.dispose();
        await fixture.changes.close();
      });
      await c.start();
      final check = c.beginVerification(first);
      await drain();
      expect(
        fixture.calls('auth.verifyBiometric').single.$2!['packageName'],
        first,
      );
      await c.cancelVerification();
      fixture.fingerprint = false;
      await c.refresh();
      await c.beginVerification(second);
      fixture.biometricResult!.complete({
        ...fixture.auth(verified: true),
        'biometricEnabled': true,
      });
      await check;
      expect(c.target, second);
      expect(c.screen, Screen.pinVerify);
      expect(fixture.calls('auth.launchApp'), isEmpty);
    },
  );

  test('privacy changes stay drafts and reset pauses research without clearing data or credentials', () async {
    final fixture = DeviceFixture()..research = true;
    final c = GhostController(fixture);
    addTearDown(() async {
      c.dispose();
      await fixture.changes.close();
    });
    await c.start();
    c.startOnboarding();
    c.editPrivacy();
    c.setPrivacy('history', false);
    c.setPrivacy('movement', false);
    c.setPrivacy('behavior', false);
    expect(fixture.history && fixture.behavior && fixture.movement, isTrue);
    await c.savePrivacy();
    expect(fixture.history || fixture.behavior || fixture.movement, isFalse);
    await c.resetPreferences();
    expect(fixture.research, isFalse);
    expect(fixture.history && fixture.behavior && fixture.movement, isTrue);
    expect(fixture.packages, isEmpty);
    expect(fixture.pin, '246810');
    expect(fixture.calls('history.clearHistory'), isEmpty);
    expect(fixture.calls('research.clearData'), isEmpty);
  });
}
