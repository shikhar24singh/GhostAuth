// Use the Material library bundled with Flutter 3.50.
// ignore: deprecated_member_use
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ghostauth/app.dart';

import 'device_fixture.dart';

void main() {
  testWidgets('onboarding confirms a user-chosen PIN before biometric setup', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final fixture = DeviceFixture()..pin = null;
    addTearDown(fixture.changes.close);
    await tester.pumpWidget(GhostAuthApp(platform: fixture));
    await tester.pumpAndSettle();
    Future<void> press(String label) async {
      final button = find.text(label);
      await tester.ensureVisible(button);
      await tester.pumpAndSettle();
      await tester.tap(button);
      await tester.pumpAndSettle();
    }

    await press('Set up GhostAuth');
    await press('Continue');
    for (final digit in '604281'.split('')) {
      final key = find.byKey(ValueKey('pin-key-$digit'));
      await tester.ensureVisible(key);
      await tester.pumpAndSettle();
      await tester.tap(key);
      await tester.pump();
    }
    await press('Continue');
    expect(fixture.calls('auth.enrollPin'), isEmpty);
    for (final digit in '604281'.split('')) {
      final key = find.byKey(ValueKey('pin-key-$digit'));
      await tester.ensureVisible(key);
      await tester.pumpAndSettle();
      await tester.tap(key);
      await tester.pump();
    }
    await press('Confirm PIN');
    expect(fixture.calls('auth.enrollPin').single.$2!['pin'], '604281');
    expect(find.text('Enable fingerprint'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'diagnostic asks for explicit consent and closes its Android lease on exit',
    (tester) async {
      tester.view.physicalSize = const Size(360, 780);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final fixture = DeviceFixture()..research = true;
      addTearDown(fixture.changes.close);
      await tester.pumpWidget(GhostAuthApp(platform: fixture));
      await tester.pumpAndSettle();
      Future<void> press(String label) async {
        final target = find.text(label);
        await tester.ensureVisible(target);
        await tester.pumpAndSettle();
        await tester.tap(target);
        await tester.pumpAndSettle();
      }

      await press('Open GhostAuth');
      await press('Settings');
      await press('Motion research');
      await press('Open motion diagnostic');
      expect(fixture.calls('research.openDiagnostic'), hasLength(1));
      await press('Start five-second test');
      expect(fixture.calls('research.startDiagnostic'), isEmpty);
      await press('Agree and start test');
      expect(fixture.calls('research.startDiagnostic').single.$2, {
        'lease': 'fixture-lease',
        'consent': true,
      });
      await press('Back to motion research');
      expect(fixture.calls('research.closeDiagnostic').single.$2, {
        'lease': 'fixture-lease',
      });
      expect(fixture.calls('auth.verifyBiometric'), isEmpty);
      expect(tester.takeException(), isNull);
    },
  );
}
