const assert = require('node:assert/strict');
const installBridge = require('./native-bridge-fixture.cjs');
module.exports = async function reviewNativeLaunch(browser, url, output) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const fixture = await installBridge(context, { pin: '654321', biometricEnabled: true, biometric: 'pending',
    selected: ['com.example.mail', 'com.example.other'],
    apps: [{ id: 'com.example.mail', name: 'Mail' }, { id: 'com.example.other', name: 'Mail' }] });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const btn = name => page.getByRole('button', { name, exact: true });
  const home = () => page.getByRole('heading', { name: 'App protection.', exact: true }).waitFor();
  const waitFor = async condition => { const deadline = Date.now() + 5000; while (!condition()) {
    if (Date.now() > deadline) throw Error('Bridge operation did not start'); await new Promise(resolve => setTimeout(resolve, 10));
  } };
  const details = async id => {
    await page.evaluate(() => { location.hash = 'home'; }); await home();
    await page.locator('button.app-row').filter({ hasText: id }).click();
    fixture.completeBiometric = null;
    await btn('Verify & open app').click(); await page.locator('.fingerprint-gate').waitFor();
    await waitFor(() => fixture.completeBiometric);
  };
  const pinLaunch = async () => {
    await btn('Use PIN instead').click(); await page.getByLabel('Six-digit PIN').waitFor();
    fixture.launchPending = true; fixture.completeLaunch = null;
    await page.getByLabel('Six-digit PIN').fill('654321'); await btn('Verify PIN').click();
    await waitFor(() => fixture.completeLaunch);
  };
  const finish = () => { fixture.launchPending = false; fixture.completeLaunch(); };
  const error = async pattern => {
    await page.getByRole('alert').waitFor(); assert.match(await page.getByRole('alert').innerText(), pattern);
    await page.waitForFunction(() => document.querySelector('main').getAttribute('aria-busy') === 'false');
  };
  try {
    await page.goto(url + '#home'); await details('com.example.other'); await pinLaunch();
    assert.equal(fixture.verifiedPackage, 'com.example.other');
    await btn('Opening…').evaluate(button => { button.click(); button.click(); });
    assert.equal(fixture.calls.filter(call => call.method === 'launchApp').length, 1);
    finish(); await home();
    assert.deepEqual(fixture.launched, ['com.example.other']); assert.equal(fixture.expiresAt, 0);
    await page.evaluate(() => { location.hash = 'success'; }); await page.getByLabel('Six-digit PIN').waitFor();
    assert.equal(await btn('Open Mail').count(), 0);
    await details('com.example.other'); await pinLaunch(); fixture.expiresAt = 0; finish(); await error(/verify again/);
    await details('com.example.other'); await pinLaunch(); fixture.verifiedPackage = 'com.example.mail'; finish(); await error(/verify again/);
    assert.equal(fixture.launched.length, 1);
    await details('com.example.other'); await pinLaunch(); fixture.apps[1].disabled = true; finish(); await error(/removed or disabled/);
    fixture.apps[1].disabled = false;
    await details('com.example.other'); await pinLaunch(); fixture.apps = fixture.apps.slice(0, 1); finish(); await error(/removed or disabled/);
    assert.equal(fixture.expiresAt, 0); assert.equal(fixture.launched.length, 1);
    await details('com.example.mail');
    await page.evaluate(() => window.__authListeners.biometricFailed({}));
    await page.getByRole('alert').waitFor(); assert.match(await page.getByRole('alert').innerText(), /did not match/);
    assert.equal(fixture.launched.length, 1);
    await page.screenshot({ path: require('node:path').join(output, 'native-fingerprint-error.png') });
    fixture.completeBiometric(); await home();
    assert.deepEqual(fixture.launched, ['com.example.other', 'com.example.mail']);
    await page.reload(); await home();
    await details('com.example.mail'); await pinLaunch();
    fixture.expiresAt = 0; fixture.verifiedPackage = null;
    await page.evaluate(() => window.__authListeners.sessionEnded({ active: false }));
    finish(); await error(/verify again/); assert.equal(fixture.launched.length, 2);
    fixture.apps[0].name = 'LongAppName'.repeat(16);
    await page.evaluate(() => window.__appListeners.appStateChange({ isActive: true }));
    await details('com.example.mail');
    for (const viewport of [{ width: 320, height: 720 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const bounds = await btn('Use PIN instead').boundingBox();
      assert.ok(bounds.x + bounds.width > viewport.width - 40 && bounds.y + bounds.height > viewport.height - 65);
      assert.ok(bounds.height >= 48);
    }
    assert.deepEqual(errors, []);
    return [
      'PIN fallback and automatic fingerprint approval launch the exact package, including duplicate labels',
      'Automatic launch submits once and consumes approval without a success or Open step',
      'Native expiry, mismatched package and background invalidation reject stale launches',
      'Disabled or uninstalled targets clear verification and refresh the catalog',
      'Nonmatching fingerprint displays an error without granting access; a later match opens directly',
      'Minimal fingerprint screen and bottom-right PIN fallback fit portrait and landscape',
    ];
  } finally { await context.close(); }
};
