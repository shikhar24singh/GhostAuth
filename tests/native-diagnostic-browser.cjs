const assert = require('node:assert/strict');
const path = require('node:path');
const installBridge = require('./native-bridge-fixture.cjs');

module.exports = async function reviewDiagnostic(browser, url, output) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const fixture = await installBridge(context, { pin: '654321', biometricEnabled: true, selected: ['com.example.mail'] });
  const page = await context.newPage(), errors = [], checks = [];
  page.on('pageerror', error => errors.push(error.message));
  const btn = name => page.getByRole('button', { name, exact: true });
  const heading = name => page.getByRole('heading', { name, exact: true }).waitFor();
  const changed = () => page.evaluate(() => window.__researchListeners.diagnosticChanged({}));
  const waitFor = async condition => { const until = Date.now() + 5000; while (!condition()) {
    if (Date.now() > until) throw Error('Diagnostic bridge operation did not finish');
    await new Promise(resolve => setTimeout(resolve, 10));
  } };
  const open = async () => { await btn('Open motion diagnostic').click(); await heading('Motion diagnostic.');
    await page.getByText('Preparing the diagnostic…', { exact: true }).waitFor({ state: 'detached' }); };
  const start = async () => { await btn('Start five-second test').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Agree and start test', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' }); await btn('Stop test').waitFor(); };
  try {
    await page.goto(url + '#research'); await heading('Motion research.'); await open();
    assert.equal(await btn('Start five-second test').isDisabled(), true);
    await page.getByText('Enable motion research on the previous screen before running this separate test.', { exact: true }).waitFor();
    await btn('Back to motion research').click(); await heading('Motion research.');
    await btn('Enable research collection').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Agree and enable', exact: true }).click();
    await btn('Pause research collection').waitFor(); await open();
    await btn('Start five-second test').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(fixture.diagnosticCounter, 0);
    await start(); assert.equal(fixture.diagnosticCounter, 1);
    assert.equal(fixture.calls.filter(call => ['verifyBiometric', 'verifyPin'].includes(call.method)).length, 0);
    assert.equal(fixture.researchEntries.length, 0); assert.equal(fixture.historyEntries.length, 0);
    checks.push('Standalone diagnostic requires research/movement gates and explicit per-run consent without starting authentication');

    fixture.diagnosticRun.remainingMillis = 3000; await changed();
    await page.getByText('Collecting · 3 seconds remaining', { exact: true }).waitFor();
    const acceleration = { samples: 101, durationMillis: 4990, rateHz: 20.04, maxGapMillis: 51, quality: 'eligible', units: 'm/s²' };
    const rotation = { samples: 105, durationMillis: 4985, rateHz: 20.86, maxGapMillis: 49, quality: 'eligible', units: 'rad/s' };
    fixture.finishDiagnostic('completed', { acceleration, rotation }); await changed();
    await page.getByText('Five-second test finished', { exact: true }).waitFor();
    await page.getByText('101 samples · 4.990 s', { exact: false }).waitFor();
    assert.equal(await btn('Copy results').isEnabled(), true);
    await btn('Copy results').click(); await page.getByText('Results copied to your clipboard.', { exact: true }).waitFor();
    assert.ok(fixture.copiedDiagnostic.includes('No identity verification or training sample.'));
    assert.equal(fixture.copiedDiagnostic.includes('654321'), false);
    assert.equal(fixture.researchEntries.length, 0); assert.equal(fixture.historyEntries.length, 0);
    for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await btn('Copy results').scrollIntoViewIfNeeded(); assert.equal(await btn('Copy results').isVisible(), true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByText('Accelerometer test', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'native-motion-diagnostic.png') });
    checks.push('Five-second completion shows sensor delivery and supports explicit result copying without enrollment/history contamination');

    await start(); fixture.finishDiagnostic('focus_lost'); await changed();
    await page.getByText('GhostAuth lost focus', { exact: true }).waitFor();
    await page.evaluate(() => window.__appListeners.appStateChange({ isActive: true }));
    assert.equal(fixture.diagnosticState, 'stopped');
    await start(); await btn('Stop test').click(); await page.getByText('You stopped the test', { exact: true }).waitFor();
    await start(); await btn('Back to motion research').click(); await heading('Motion research.');
    await waitFor(() => fixture.diagnosticState === 'stopped' && fixture.diagnosticLease === null);
    assert.equal(fixture.diagnosticRun.reason, 'screen_left');
    await open(); await page.getByText('Diagnostic screen closed', { exact: true }).waitFor();
    checks.push('Focus loss, explicit Stop and screen navigation end a run without automatic restart');

    fixture.movementAllowed = false; await changed();
    await page.getByText('Enable Movement signals in Privacy & data and save before starting.', { exact: true }).waitFor();
    assert.equal(await btn('Start five-second test').isDisabled(), true);
    fixture.movementAllowed = true; await changed();
    await page.getByText('Enable Movement signals in Privacy & data and save before starting.', { exact: true }).waitFor({ state: 'detached' });
    await start(); fixture.finishDiagnostic('settings_changed'); fixture.researchEnabled = false; await changed();
    await page.getByText('Research settings changed', { exact: true }).waitFor();
    assert.equal(await btn('Start five-second test').isDisabled(), true);
    fixture.researchEnabled = true; await changed();
    await page.getByText('Enable motion research on the previous screen before running this separate test.', { exact: true }).waitFor({ state: 'detached' });
    fixture.diagnosticSnapshotPending = true; fixture.completeDiagnosticSnapshot = null;
    await btn('Refresh diagnostic').click(); await waitFor(() => fixture.completeDiagnosticSnapshot);
    await btn('Clear diagnostic result').click();
    await page.getByText('Ready for an explicit test', { exact: true }).waitFor();
    fixture.diagnosticSnapshotPending = false; fixture.completeDiagnosticSnapshot();
    assert.equal(await btn('Copy results').isDisabled(), true);
    assert.equal(fixture.pin, '654321'); assert.equal(fixture.biometricEnabled, true);
    checks.push('Movement/research pause gates hold; clearing discards stale snapshots while preserving credentials');

    fixture.malformedDiagnostic = true; await btn('Refresh diagnostic').click(); await page.getByRole('alert').waitFor();
    assert.equal(await btn('Start five-second test').isDisabled(), true);
    fixture.malformedDiagnostic = false; await btn('Refresh diagnostic').click();
    await btn('Start five-second test').waitFor({ state: 'visible' });
    assert.equal(fixture.diagnosticCounter, 5);
    await btn('Back to motion research').click(); await heading('Motion research.');
    assert.equal(fixture.researchEntries.length, 0);
    assert.deepEqual(errors, []);
    checks.push('Malformed diagnostic data fails closed without starting collection or changing verification coverage');
    return checks;
  } finally { await context.close(); }
};
