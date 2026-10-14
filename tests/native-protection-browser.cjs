const assert = require('node:assert/strict');
const installBridge = require('./native-bridge-fixture.cjs');

module.exports = async function reviewProtection(browser, url, output) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const fixture = await installBridge(context, { pin: '654321', biometricEnabled: true, selected: ['com.example.photos'] });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const btn = name => page.getByRole('button', { name, exact: true });
  const heading = name => page.getByRole('heading', { name, exact: true }).waitFor();
  const refresh = () => page.evaluate(() => window.__deviceListeners.protectionChanged({}));
  const verify = async () => { await page.getByLabel('Six-digit PIN').fill('654321'); await btn('Verify PIN').click(); await heading('App protection.'); };
  try {
    await page.goto(url + '#home'); await heading('App protection.');
    assert.equal(fixture.protection.enabled, false);
    await btn('Permissions').click(); await btn('Protection service Off · enable protection').click();
    await page.getByText('Enable app protection', { exact: true }).waitFor();
    assert.match(await page.locator('main').innerText(), /does not read screen text/);
    await btn('Enable protection').click(); await btn('Open Android Accessibility').waitFor();
    assert.equal(fixture.lastSettings, 'service');
    assert.deepEqual(fixture.protection.packages, ['com.example.photos']);
    assert.equal(fixture.protection.enabled, true); assert.equal(fixture.protection.connected, false);
    fixture.protection.connected = true; await refresh();
    await page.getByText('Active · Android accessibility service', { exact: true }).waitFor();
    await btn('Back to GhostAuth').click(); await btn('Back to GhostAuth').click(); await heading('App protection.');
    fixture.protection.pending = { packageName: 'com.example.photos', id: 'service:1' };
    fixture.biometric = 'pin'; await refresh(); await heading('Confirm it’s you.');
    await verify();
    assert.deepEqual(fixture.launched, ['com.example.photos']);
    fixture.protection.pending = { packageName: 'com.example.photos', id: 'service:2' };
    await refresh(); await heading('Confirm it’s you.');
    await btn('Cancel').click(); await heading('App protection.');
    assert.equal(fixture.canceledProtection, true); assert.equal(fixture.launched.length, 1);
    fixture.protection.pending = { packageName: 'com.example.photos', id: 'service:3' };
    await refresh(); await heading('Confirm it’s you.');
    fixture.protection.packages.push('com.example.mail');
    fixture.protection.pending = { packageName: 'com.example.mail', id: 'service:4' };
    await refresh(); await heading('Confirm it’s you.');
    assert.equal(await btn('Open Photos').count(), 0, 'A replacement request invalidates the previous success screen');
    await page.getByLabel('Six-digit PIN').fill('111111'); await btn('Verify PIN').click();
    await page.getByRole('alert').waitFor(); assert.equal(fixture.launched.length, 1);
    await btn('Cancel').click(); await heading('App protection.');
    fixture.protection.connected = false; await refresh();
    await page.getByText('Protection is off or disconnected', { exact: true }).waitFor();
    await btn('Choose apps').click(); await page.getByRole('checkbox', { name: 'Mail', exact: true }).uncheck();
    fixture.protectionUnavailable = true; await btn('Save selection').click();
    await page.getByRole('alert').waitFor(); assert.equal(fixture.protection.packages.length, 2);
    fixture.protectionUnavailable = false; await btn('Save selection').click(); await heading('App protection.');
    assert.deepEqual(fixture.protection.packages, ['com.example.photos']);
    await page.reload(); await heading('App protection.');
    await btn('Permissions').click(); await btn('Protection service Not connected · enable in Android Accessibility').click();
    await btn('Disable protection').click(); await btn('Enable protection').waitFor();
    assert.equal(fixture.protection.enabled, false); assert.equal(fixture.pin, '654321');
    await page.screenshot({ path: require('node:path').join(output, 'native-protection-permission.png') });
    await page.evaluate(() => { location.hash = 'settings'; }); await heading('Make it yours.');
    await btn('Reset saved preferences Restore app selection and data choices').click(); await btn('Reset preferences').click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    assert.deepEqual(fixture.protection.packages, []); assert.equal(fixture.biometricEnabled, true);
    await page.reload(); await heading('Make it yours.'); assert.equal(fixture.pin, '654321');
    assert.deepEqual(errors, []);
    return [
      'Protection requires explicit disclosure/consent and an Android accessibility connection',
      'Trusted blocked-app requests route to the exact package and open after native verification',
      'Cancel and wrong PIN never allow a protected app; replacement requests invalidate prior verification',
      'Service disconnection is visible; failed native saves do not change protection scope',
      'Native protection scope survives reload and reset/disable preserve PIN and biometric credentials',
    ];
  } finally { await context.close(); }
};
