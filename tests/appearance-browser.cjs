const assert = require('node:assert/strict');
const installBridge = require('./native-bridge-fixture.cjs');
module.exports = async function reviewAppearance(browser, url, output) {
  const errors = [], checks = [];
  for (const native of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const fixture = native ? await installBridge(context, { pin: '654321', biometricEnabled: true,
      selected: ['com.example.mail'], protection: { configured: true, enabled: false, connected: false, packages: ['com.example.mail'] } }) : null;
    let page = await context.newPage(); const watch = () => page.on('pageerror', error => errors.push(error.message)); watch();
    const btn = name => page.getByRole('button', { name, exact: true });
    const theme = () => page.locator('html').getAttribute('data-theme');
    const settings = () => page.getByRole('heading', { name: 'Make it yours.', exact: true }).waitFor();
    const toggle = () => page.getByRole('checkbox', { name: 'Dark mode', exact: true });
    const navigate = async hash => { await page.evaluate(hash => { location.hash = hash; }, hash); await page.locator('main').waitFor(); };
    try {
      await page.goto(url + '#settings'); await settings(); assert.equal(await theme(), 'light');
      await toggle().click(); await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
      assert.equal(await page.locator('.phone-shell').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(22, 24, 30)');
      assert.equal(await page.locator('h1').evaluate(node => getComputedStyle(node).color), 'rgb(240, 241, 245)');
      assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'), '#16181E');
      if (fixture) {
        assert.equal(fixture.darkMode, true); assert.equal(fixture.systemBarsStyle, 'DARK');
        assert.equal(fixture.pin, '654321'); assert.equal(fixture.biometricEnabled, true);
      }
      await page.screenshot({ path: require('node:path').join(output, native ? 'native-dark-settings.png' : 'dark-settings.png') });
      await page.reload(); await settings(); assert.equal(await theme(), 'dark'); assert.equal(await toggle().isChecked(), true);
      const oldPage = page; page = await context.newPage(); watch(); await oldPage.close();
      await page.goto(url + '#settings'); await settings(); assert.equal(await theme(), 'dark');
      for (const hash of ['home', 'manageApps', 'activity', 'pinVerify', 'privacySettings', 'permissions', 'welcome']) {
        await navigate(hash); await page.locator('h1').waitFor(); assert.equal(await theme(), 'dark');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
      await navigate('settings'); await settings();
      await btn('Reset saved preferences Restore app selection and data choices').click();
      await page.getByRole('dialog').waitFor();
      assert.equal(await page.getByRole('dialog').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(22, 24, 30)');
      await page.getByRole('dialog').getByRole('button', { name: 'Reset preferences', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'detached' }); assert.equal(await theme(), 'dark');
      await page.reload(); await settings(); assert.equal(await theme(), 'dark');
      if (fixture) {
        fixture.appearanceUnavailable = true; await toggle().click(); await page.getByRole('alert').waitFor();
        assert.equal(await theme(), 'dark'); assert.equal(fixture.darkMode, true);
        fixture.appearanceUnavailable = false;
      }
      await toggle().click(); await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
      await page.reload(); await settings(); assert.equal(await theme(), 'light');
      if (fixture) {
        assert.equal(fixture.systemBarsStyle, 'LIGHT'); assert.equal(fixture.pin, '654321');
        // Native preference wins over the browser cache on startup.
        fixture.darkMode = true;
        await page.evaluate(() => localStorage.setItem('ghostauth.android.appearance.v1', 'light'));
        await page.reload(); await settings(); await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
        assert.equal(await toggle().isChecked(), true);
        fixture.protection.packages = ['com.example.mail']; fixture.protection.enabled = true; fixture.protection.connected = true;
        fixture.protection.pending = { packageName: 'com.example.mail', id: 'dark:1' }; fixture.biometric = 'pending'; fixture.completeBiometric = null;
        await page.evaluate(() => window.__deviceListeners.protectionChanged({}));
        await page.locator('.fingerprint-gate').waitFor();
        while (!fixture.completeBiometric) await new Promise(resolve => setTimeout(resolve, 10));
        assert.equal(await theme(), 'dark'); assert.notEqual(await page.locator('.gate-logo').evaluate(node => getComputedStyle(node).filter), 'none');
        await page.screenshot({ path: require('node:path').join(output, 'native-dark-fingerprint.png') });
        fixture.completeBiometric(); await page.getByRole('heading', { name: 'App protection.', exact: true }).waitFor();
        assert.deepEqual(fixture.launched, ['com.example.mail']); assert.equal(await theme(), 'dark');
      }
      for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
        await page.setViewportSize(viewport); await navigate('settings'); await settings();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        const bounds = await toggle().boundingBox(); assert.ok(bounds && bounds.height >= 48 && bounds.width >= 48);
      }
      checks.push(native ? 'Native dark mode persists, overrides stale web cache, updates bar icons and handles failed saves safely'
        : 'Browser dark mode applies across screens/dialogs, survives reload/new tabs and returns to light');
      checks.push(native ? 'Dark fingerprint screen retains readable branding and directly opens the verified package'
        : 'Appearance choice survives preference reset and fits narrow portrait and landscape');
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, []);
  return checks;
};
