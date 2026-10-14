const assert = require('node:assert/strict');
const installBridge = require('./native-bridge-fixture.cjs');
module.exports = async function reviewFingerprint(browser, url, output) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const fixture = await installBridge(context, { pin: '654321', biometricEnabled: true, biometric: 'pending',
    protection: { configured: true, enabled: true, connected: true, packages: ['com.example.photos', 'com.example.mail'],
      pending: { packageName: 'com.example.photos', id: 'cold:1' } } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const btn = name => page.getByRole('button', { name, exact: true });
  const home = () => page.getByRole('heading', { name: 'App protection.', exact: true }).waitFor();
  const refresh = () => page.evaluate(() => window.__deviceListeners.protectionChanged({}));
  const idle = () => page.waitForFunction(() => document.querySelector('main').getAttribute('aria-busy') === 'false');
  const waitForScan = async () => { await page.locator('.fingerprint-gate').waitFor();
    const deadline = Date.now() + 5000; while (!fixture.completeBiometric) {
      if (Date.now() > deadline) throw Error('Automatic scanner did not start'); await new Promise(resolve => setTimeout(resolve, 10));
    }
  };
  const request = async (id, mode = 'pending', target = 'com.example.photos') => {
    fixture.biometric = mode; fixture.completeBiometric = null;
    fixture.protection.pending = { packageName: target, id }; await refresh();
  };
  const verifyPin = async pin => { await page.getByLabel('Six-digit PIN').fill(pin); await btn('Verify PIN').click(); };
  try {
    await page.goto(url + '#home'); await waitForScan();
    assert.equal(fixture.calls.filter(call => call.method === 'verifyBiometric').length, 1);
    assert.equal(await page.locator('.app-header, nav, footer, .note').count(), 0);
    assert.equal(await page.getByLabel('Six-digit PIN').count(), 0);
    assert.equal(await page.getByAltText('GhostAuth').evaluate(n => n.complete && n.naturalWidth > 0), true);
    await refresh(); assert.equal(fixture.calls.filter(call => call.method === 'verifyBiometric').length, 1);
    await page.screenshot({ path: require('node:path').join(output, 'native-fingerprint-primary.png') });
    fixture.completeBiometric(); await home(); assert.deepEqual(fixture.launched, ['com.example.photos']);
    const scansBeforePin = fixture.calls.filter(call => call.method === 'verifyBiometric').length;
    await request('cold:2', 'pin'); await page.getByLabel('Six-digit PIN').waitFor(); await idle();
    assert.equal(await page.getByRole('alert').count(), 0);
    assert.equal(fixture.calls.filter(call => call.method === 'verifyBiometric').length, scansBeforePin + 1, 'Choosing PIN must not restart the automatic prompt');
    await verifyPin('111111'); await page.getByRole('alert').waitFor(); assert.equal(fixture.launched.length, 1);
    await verifyPin('654321'); await home(); assert.equal(fixture.launched.length, 2);
    await request('cold:3'); await waitForScan();
    const late = fixture.completeBiometric; fixture.lateBiometric = true;
    await btn('Use PIN instead').click(); await page.getByLabel('Six-digit PIN').waitFor();
    late(); fixture.lateBiometric = false; await idle(); assert.equal(fixture.launched.length, 2);
    await verifyPin('654321'); await home(); assert.equal(fixture.launched.length, 3);
    await request('cold:4', 'cancel'); await page.getByRole('alert').waitFor(); await idle();
    assert.match(await page.getByRole('alert').innerText(), /canceled/);
    fixture.biometric = 'pending'; fixture.completeBiometric = null;
    await btn('Try fingerprint again').click(); await waitForScan();
    fixture.completeBiometric(); await home(); assert.equal(fixture.launched.length, 4);
    await request('cold:5', 'lockout'); await page.getByRole('alert').waitFor(); await idle();
    assert.match(await page.getByRole('alert').innerText(), /Too many fingerprint attempts/);
    assert.equal(fixture.launched.length, 4); await btn('Use PIN instead').click();
    await page.getByLabel('Six-digit PIN').waitFor();
    fixture.biometric = 'pending'; fixture.completeBiometric = null;
    await btn('Use fingerprint instead').click(); await waitForScan();
    await btn('Use PIN instead').click(); await idle(); await btn('Cancel').click(); await home();
    await request('cold:6'); await waitForScan(); const oldScan = fixture.completeBiometric;
    fixture.lateBiometric = true;
    await request('cold:7', 'pending', 'com.example.mail'); oldScan(); fixture.lateBiometric = false;
    await waitForScan(); fixture.completeBiometric(); await home();
    assert.deepEqual(fixture.launched, ['com.example.photos', 'com.example.photos', 'com.example.photos', 'com.example.photos', 'com.example.mail']);
    fixture.biometricEnabled = false; await page.reload(); await home();
    await request('cold:8'); await page.getByLabel('Six-digit PIN').waitFor();
    assert.equal(await page.locator('.fingerprint-gate').count(), 0);
    await verifyPin('654321'); await home(); assert.equal(fixture.launched.length, 6);
    assert.deepEqual(errors, []);
    return [
      'Cold protected-app opening automatically starts one fingerprint prompt with only the GhostAuth mark, reader and PIN fallback',
      'Android PIN fallback and wrong PIN remain locked; correct PIN opens directly',
      'Choosing PIN cancels fingerprint and ignores late biometric proof',
      'Fingerprint cancellation, retry and biometric lockout show errors without opening the app',
      'Replacement requests reject old biometric proof; unenrolled or invalidated fingerprint starts with PIN',
    ];
  } finally { await context.close(); }
};
