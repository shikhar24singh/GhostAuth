const assert = require('node:assert/strict');
const installBridge = require('./native-bridge-fixture.cjs');

module.exports = async function reviewNativeAuth(browser, url, output) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const fixture = await installBridge(context);
  const page = await context.newPage();
  await page.clock.install();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const btn = name => page.getByRole('button', { name, exact: true });
  const heading = name => page.getByRole('heading', { name, exact: true }).waitFor();
  const enter = async (pin, submit = 'Verify PIN') => { await page.getByLabel('Six-digit PIN').fill(pin); await btn(submit).click(); };
  const route = async (hash, name) => { await page.evaluate(hash => { location.hash = hash; }, hash); await heading(name); };
  try {
    await page.goto(url + '#success'); await heading('Your apps. Your access.');
    await btn('Set up GhostAuth').click(); await btn('Continue').click();
    await enter('654321', 'Continue'); await heading('One more time.');
    await enter('654320', 'Confirm PIN'); assert.match(await page.getByRole('alert').innerText(), /do not match/);
    assert.equal(fixture.pin, null);
    await enter('654321', 'Confirm PIN'); await heading('A familiar way in.');
    assert.equal(fixture.pin, '654321');
    await btn('Enable fingerprint').click(); await heading('Enable fingerprint.');
    assert.equal(await btn('Simulate enabled').count(), 0);
    await btn('Confirm PIN & enable').click(); await heading('Confirm it’s you.');
    await enter('123456'); assert.match(await page.getByRole('alert').innerText(), /did not match/);
    assert.equal(fixture.biometricEnabled, false);
    await enter('654321'); await heading('Review permissions.'); assert.equal(fixture.biometricEnabled, true);
    await btn('Continue to app selection').click();
    await page.getByRole('checkbox', { name: 'Mail', exact: true }).check();
    await btn('Save selected apps').click();
    await btn('Open GhostAuth').click(); await heading('App protection.');
    fixture.biometric = 'cancel';
    await btn('Open Mail protection details').click(); await btn('Verify & open app').click();
    await page.locator('.fingerprint-gate').waitFor(); await page.getByRole('alert').waitFor();
    await btn('Use PIN instead').click(); await heading('Confirm it’s you.');
    assert.equal((await page.locator('main').innerText()).includes('123456'), false);
    await enter('123456'); assert.match(await page.getByRole('alert').innerText(), /did not match/);
    assert.equal(fixture.expiresAt, 0);
    await enter('654321'); await heading('App protection.');
    assert.deepEqual(fixture.launched, ['com.example.mail']);
    await route('success', 'Confirm it’s you.');
    await page.reload(); await heading('Confirm it’s you.');
    assert.equal(fixture.pin, '654321'); assert.equal(fixture.expiresAt, 0);
    await enter('654321'); await heading('You’re verified.');
    await page.evaluate(() => window.__authListeners.sessionEnded({})); await heading('Confirm it’s you.');
    assert.equal(await page.getByLabel('Six-digit PIN').inputValue(), '');
    await btn('Use fingerprint instead').click(); await heading('A moment to verify.');
    fixture.biometric = 'cancel'; await btn('Verify with fingerprint').click();
    assert.match(await page.getByRole('alert').innerText(), /canceled/);
    assert.equal(await page.getByRole('heading', { name: 'You’re verified.', exact: true }).count(), 0);
    fixture.biometric = 'success'; await btn('Verify with fingerprint').click(); await heading('You’re verified.');
    await page.clock.fastForward(30_001); await heading('Confirm it’s you.');
    assert.equal(fixture.expiresAt, 0);
    await btn('Use fingerprint instead').click(); fixture.biometric = 'pending'; await btn('Verify with fingerprint').click();
    await page.waitForFunction(() => document.querySelector('main').getAttribute('aria-busy') === 'true');
    while (!fixture.completeBiometric) await new Promise(resolve => setTimeout(resolve, 10));
    await page.evaluate(() => window.__authListeners.sessionEnded({}));
    fixture.completeBiometric(); fixture.biometric = 'success';
    await page.waitForFunction(() => document.querySelector('main').getAttribute('aria-busy') === 'false');
    await btn('Verify with fingerprint').waitFor();
    assert.equal(await page.getByRole('heading', { name: 'You’re verified.', exact: true }).count(), 0);
    await route('settings', 'Make it yours.');
    await btn('PIN & fingerprint Manage identity verification').click(); await btn('Change PIN').click();
    await heading('Create your PIN.'); await enter('246810', 'Continue'); await heading('One more time.');
    await enter('246810', 'Confirm PIN');
    await heading('Confirm it’s you.'); await enter('111111');
    assert.match(await page.getByRole('alert').innerText(), /did not match/); assert.equal(fixture.pin, '654321');
    await enter('654321'); await heading('Make it yours.'); assert.equal(fixture.pin, '246810');
    await route('pinVerify', 'Confirm it’s you.'); await enter('654321');
    assert.match(await page.getByRole('alert').innerText(), /did not match/);
    await enter('246810'); await heading('You’re verified.');
    await route('settings', 'Make it yours.');
    await btn('PIN & fingerprint Manage identity verification').click(); await btn('Manage fingerprint').click();
    await btn('Manage fingerprint').click(); await btn('Turn off fingerprint').click(); await enter('246810');
    await heading('Make it yours.'); assert.equal(fixture.biometricEnabled, false);
    await page.reload(); await heading('Make it yours.');
    await btn('Reset saved preferences Restore app selection and data choices').click(); await btn('Reset preferences').click();
    assert.equal(fixture.pin, '246810');
    await route('home', 'Make it personal.'); await btn('Choose apps').click();
    await page.getByRole('checkbox', { name: 'Mail', exact: true }).check(); await btn('Save selection').click();
    await route('pinVerify', 'Confirm it’s you.');
    for (let i = 0; i < 5; i++) { await enter('000000'); await page.getByRole('alert').waitFor(); }
    assert.match(await page.getByRole('alert').innerText(), /Too many attempts/);
    await page.reload(); await heading('Confirm it’s you.'); await enter('246810');
    assert.match(await page.getByRole('alert').innerText(), /Too many attempts/);
    assert.equal(fixture.expiresAt, 0);
    const saved = await page.evaluate(() => ({ ...localStorage }));
    assert.equal(JSON.stringify(saved).includes('246810'), false);
    fixture.lockedUntil = 0; fixture.biometricAvailable = false; fixture.biometricEnabled = false;
    await page.reload(); await heading('Confirm it’s you.');
    assert.equal(await btn('Use fingerprint instead').count(), 0);
    await enter('246810'); await heading('You’re verified.');
    await page.screenshot({ path: require('node:path').join(output, 'native-auth-success.png') });
    fixture.unavailable = true; await page.reload(); await heading('Authentication unavailable.');
    assert.equal(await btn('Verify PIN').count(), 0);
    assert.deepEqual(errors, []);
    return ['Native bridge enrollment, PIN confirmation and real-method fingerprint controls',
      'Native PIN check rejects the demo PIN and retains credentials across reload',
      'Canceled and late biometric results cannot authorize access',
      'Native approval expires on background events, reload and the 30-second deadline',
      'PIN changes and biometric disable require the existing native PIN',
      'Preference reset and reload preserve native PIN lockout; unavailable bridge fails closed',
      'Devices without enrolled strong biometrics retain the PIN fallback'];
  } finally { await context.close(); }
};
