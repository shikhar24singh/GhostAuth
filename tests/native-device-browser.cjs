const assert = require('node:assert/strict');
const installBridge = require('./native-bridge-fixture.cjs');

module.exports = async function reviewNativeDevice(browser, url, output) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const fixture = await installBridge(context, { pin: '654321' });
  await context.addInitScript(() => localStorage.setItem('ghostnet.preferences.v1', JSON.stringify({
    version: 1, selected: ['mail'], privacy: { behavior: false, movement: false, history: false },
  })));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const btn = name => page.getByRole('button', { name, exact: true });
  const heading = name => page.getByRole('heading', { name, exact: true }).waitFor();
  const route = async (hash, name) => { await page.evaluate(hash => { location.hash = hash; }, hash); await heading(name); };
  try {
    await page.goto(url + '#home'); await heading('Make it personal.');
    await btn('Choose apps').click(); await heading('Choose apps.');
    await page.getByRole('checkbox', { name: 'Mail', exact: true }).waitFor();
    assert.equal(await page.getByRole('checkbox').count(), 2);
    await page.waitForFunction(() => document.querySelector('.app-row img.app-icon')?.naturalWidth > 0);
    assert.equal(await page.locator('.app-row img.app-icon').count(), 1);
    assert.equal(await page.locator('.app-row').filter({ hasText: 'Photos' }).locator('svg.lucide-folder').count(), 1, 'Missing icons keep a fallback without hiding apps');
    assert.equal(await page.getByRole('checkbox', { name: 'Mail', exact: true }).isChecked(), false);
    await page.getByRole('searchbox').fill('EXAMPLE.MAIL');
    assert.equal(await page.getByRole('checkbox').count(), 1);
    await page.getByRole('checkbox', { name: 'Mail', exact: true }).check();
    await btn('Save selection').click(); await heading('App protection.');
    assert.match(await page.locator('main').innerText(), /Protection is off or disconnected/);
    await page.waitForFunction(() => document.querySelector('.app-row img.app-icon')?.naturalWidth > 0);
    assert.equal(await btn('Open Mail protection details').locator('img.app-icon').count(), 1);
    await page.screenshot({ path: require('node:path').join(output, 'native-app-icons-home.png') });
    const originalIcon = fixture.apps[0].icon;
    fixture.apps[0].icon = 'data:image/png;base64,AA==';
    await page.evaluate(() => window.__appListeners.appStateChange({ isActive: true }));
    await btn('Open Mail protection details').locator('svg.lucide-folder.app-icon').waitFor();
    fixture.apps[0].icon = originalIcon;
    await page.evaluate(() => window.__appListeners.appStateChange({ isActive: true }));
    await page.waitForFunction(() => document.querySelector('.app-row img.app-icon')?.naturalWidth > 0);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ghostauth.android.preferences.v1')));
    assert.deepEqual(saved.selected, ['com.example.mail']);
    assert.deepEqual(saved.privacy, { behavior: false, movement: false, history: false }, 'Upgrade keeps saved privacy consent');
    await page.reload(); await heading('App protection.'); await btn('Open Mail protection details').waitFor();
    await btn('Open Mail protection details').click(); await btn('Verify & open app').click();
    await page.getByLabel('Six-digit PIN').fill('654321'); await btn('Verify PIN').click(); await heading('App protection.');
    assert.equal(fixture.historyEnabled, false, 'Upgrade retains the previously disabled Security history choice');
    assert.deepEqual(fixture.historyEntries, []);
    await route('permissionHealth', 'Android permissions.');
    await page.screenshot({ path: require('node:path').join(output, 'native-device-permissions.png') });
    await btn('App usage access Not enabled · open Android settings').click(); await heading('App usage access');
    assert.equal(await btn('Simulate access enabled').count(), 0);
    await btn('Open Android settings').click();
    await page.waitForFunction(() => !document.querySelector('.action-button').disabled);
    assert.equal(fixture.lastSettings, 'usage');
    fixture.permissions.usage = true;
    await page.evaluate(() => { window.__appListeners.appStateChange({ isActive: false }); window.__appListeners.appStateChange({ isActive: true }); });
    await page.getByText('Enabled on this device', { exact: true }).waitFor();
    await btn('Back to GhostAuth').click(); await heading('Android permissions.');
    await btn('Notifications Not enabled · open Android settings').click();
    await btn('Open Android settings').click();
    await page.waitForFunction(() => !document.querySelector('.action-button').disabled);
    assert.equal(fixture.lastSettings, 'notifications');
    fixture.settingsUnavailable = true; await btn('Open Android settings').click();
    await page.getByRole('alert').waitFor(); assert.match(await page.getByRole('alert').innerText(), /could not be opened/);
    fixture.settingsUnavailable = false;
    await btn('Back to GhostAuth').click();
    await btn('Protection service Off · enable protection').click();
    assert.equal(await page.getByRole('alert').count(), 0, 'Errors from a previous Settings screen should not carry over');
    assert.equal(await btn('Open Android settings').count(), 0);
    assert.equal(await btn('Simulate access enabled').count(), 0);
    // A later refresh supersedes an earlier snapshot captured before access was revoked.
    fixture.snapshotPending = true; await btn('Refresh Android status').click();
    await page.waitForFunction(() => document.querySelector('[role="status"]') !== null);
    while (!fixture.completeSnapshot) await new Promise(resolve => setTimeout(resolve, 10));
    const completeOld = fixture.completeSnapshot;
    fixture.snapshotPending = false; fixture.permissions.usage = false;
    await page.evaluate(() => window.__appListeners.appStateChange({ isActive: true }));
    await page.getByRole('status').waitFor({ state: 'detached' }); completeOld();
    await btn('Back to GhostAuth').click();
    await btn('App usage access Not enabled · open Android settings').waitFor();
    fixture.deviceUnavailable = true; await btn('Refresh Android status').click();
    await page.getByRole('alert').waitFor(); assert.match(await page.getByRole('alert').innerText(), /Couldn’t read installed apps/);
    await route('manageApps', 'Choose apps.'); assert.equal(await page.getByRole('checkbox').count(), 0);
    assert.equal(await btn('Save selection').isDisabled(), true);
    fixture.deviceUnavailable = false; fixture.apps = [{ id: 'com.example.photos', name: 'Photos' }];
    await btn('Refresh Android status').click(); await page.getByRole('checkbox', { name: 'Photos', exact: true }).waitFor();
    await route('home', 'Make it personal.');
    assert.equal(await btn('Open Mail protection details').count(), 0);
    await page.screenshot({ path: require('node:path').join(output, 'native-device-empty.png') });
    fixture.apps.push({ id: 'com.example.averylongpackageidentifierforlayoutverification', name: 'AnExtremelyLongApplicationLabelForLayoutVerification' });
    await btn('Choose apps').click(); await route('permissionHealth', 'Android permissions.');
    await btn('Refresh Android status').click(); await page.getByRole('status').waitFor({ state: 'detached' });
    await route('manageApps', 'Choose apps.');
    for (const [width, height] of [[320, 568], [844, 390]]) {
      await page.setViewportSize({ width, height });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Native app names/packages should wrap');
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: require('node:path').join(output, 'native-device-catalog.png') });
    await route('settings', 'Make it yours.');
    await btn('Reset saved preferences Restore app selection and data choices').click(); await btn('Reset preferences').click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    await page.reload(); await heading('Make it yours.');
    const reset = await page.evaluate(() => JSON.parse(localStorage.getItem('ghostauth.android.preferences.v1')));
    assert.deepEqual(reset.selected, []);
    assert.deepEqual(reset.privacy, { behavior: true, movement: true, history: true }, 'Explicit reset persists without restoring legacy privacy');
    assert.equal(fixture.pin, '654321');
    assert.deepEqual(errors, []);
    return ['Android catalog uses package identifiers, explicit selection, package search and saved reload',
      'Native PNG icons render in selection and home lists; missing/broken icons fall back and refreshed icons recover',
      'Upgrade retains saved privacy consent; explicit reset persists without restoring legacy sample choices',
      'Usage and notification settings call the native bridge; returning refreshes actual status',
      'Protection requires explicit consent and an Android accessibility connection',
      'Stale native snapshots, settings errors, unavailable device bridge and uninstalled apps are handled'];
  } finally { await context.close(); }
};
