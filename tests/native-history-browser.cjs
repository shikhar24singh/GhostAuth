const assert = require('node:assert/strict');
const installBridge = require('./native-bridge-fixture.cjs');
module.exports = async function reviewHistory(browser, url, output) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const fixture = await installBridge(context, { pin: '654321', biometricEnabled: true,
    selected: ['com.example.mail', 'com.example.other'],
    protection: { configured: true, enabled: false, connected: false, packages: ['com.example.mail', 'com.example.other'] },
    apps: [{ id: 'com.example.mail', name: 'Mail' }, { id: 'com.example.other', name: 'Mail' }] });
  let page = await context.newPage(); const errors = [];
  const watch = () => page.on('pageerror', error => errors.push(error.message)); watch();
  const btn = name => page.getByRole('button', { name, exact: true });
  const heading = name => page.getByRole('heading', { name, exact: true }).waitFor();
  const route = async (hash, title) => { await page.evaluate(hash => { location.hash = hash; }, hash); await heading(title); };
  const pin = async value => { await page.getByLabel('Six-digit PIN').fill(value); await btn('Verify PIN').click(); };
  const history = async () => { await route('activity', 'Your recent activity.'); await btn('Refresh history').click();
    await page.getByText('Refreshing security history…', { exact: true }).waitFor({ state: 'detached' }); };
  const rows = () => page.locator('button.list-row');
  const privacy = async enabled => {
    await route('settings', 'Make it yours.'); await btn('Privacy & data Choose what GhostAuth can use').click();
    await page.getByRole('checkbox', { name: 'Security history', exact: true }).setChecked(enabled);
    await btn('Save preferences').click(); await heading('Make it yours.');
  };
  const dialogClear = async () => { await btn('Clear history').click(); await page.getByRole('dialog').waitFor();
    await page.getByRole('dialog').getByRole('button', { name: 'Clear history', exact: true }).click(); };
  try {
    await page.goto(url + '#pinVerify'); await heading('Confirm it’s you.');
    await pin('111111'); await page.getByRole('alert').waitFor(); await pin('654321'); await heading('You’re verified.');
    await history(); assert.equal(await rows().count(), 2);
    await page.getByRole('button', { name: /Mail · verification failed/ }).click();
    await page.getByText('Identity check did not match.', { exact: true }).waitFor();
    assert.match(await page.locator('main').innerText(), /com.example.mail/);
    await page.reload(); await heading('Your recent activity.'); assert.equal(await rows().count(), 2);
    // A new WebView/page restores native evidence, never native launch authorization.
    const previous = page; page = await context.newPage(); watch(); await previous.close();
    await page.goto(url + '#success'); await heading('Confirm it’s you.');
    assert.equal(await btn('Open Mail').count(), 0); await history(); assert.equal(await rows().count(), 2);
    assert.equal(await page.evaluate(() => JSON.stringify({ ...localStorage }).includes('654321')), false);
    assert.equal(JSON.stringify(fixture.historyEntries).includes('111111'), false);
    // Capture another package with the same label, then remove it from the catalog.
    await route('home', 'App protection.'); await page.locator('button.app-row').filter({ hasText: 'com.example.other' }).click();
    await btn('Verify & open app').click(); await heading('App protection.');
    assert.equal(fixture.historyEntries[0].packageName, 'com.example.other');
    fixture.apps.pop(); await page.evaluate(() => window.__appListeners.appStateChange({ isActive: true }));
    await history(); await page.getByRole('button', { name: /Mail · verified with fingerprint/ }).click();
    assert.match(await page.locator('main').innerText(), /com.example.other/); await btn('Back to activity').click();
    // A nonmatching scan and a later match are distinct native outcomes.
    fixture.biometric = 'pending'; fixture.completeBiometric = null;
    await route('home', 'App protection.'); await btn('Open Mail protection details').click(); await btn('Verify & open app').click();
    await page.locator('.fingerprint-gate').waitFor();
    while (!fixture.completeBiometric) await new Promise(resolve => setTimeout(resolve, 10));
    await page.evaluate(async () => {
      await window.__mockNativeCall('GhostHistory', 'simulateFingerprintFailure', {});
      window.__authListeners.biometricFailed({}); window.__historyListeners.historyChanged({});
    });
    fixture.completeBiometric(); await heading('App protection.'); await history();
    assert.equal(fixture.historyEntries.filter(entry => entry.method === 'fingerprint' && entry.outcome === 'failed').length, 1);
    fixture.biometric = 'cancel'; await route('home', 'App protection.'); await btn('Open Mail protection details').click();
    await btn('Verify & open app').click(); await page.getByRole('alert').waitFor();
    fixture.biometric = 'lockout'; await btn('Try fingerprint again').click(); await page.getByRole('alert').waitFor();
    await history(); assert.match(await page.locator('main').innerText(), /verification canceled/);
    assert.match(await page.locator('main').innerText(), /verification locked out/);
    await page.locator('main').evaluate(node => node.scrollTo(0, 0));
    await page.screenshot({ path: require('node:path').join(output, 'native-history-activity.png') });
    const count = fixture.historyEntries.length;
    await privacy(false); await route('pinVerify', 'Confirm it’s you.'); await pin('654321'); await heading('You’re verified.');
    assert.equal(fixture.historyEntries.length, count); await page.reload(); await heading('Confirm it’s you.');
    await history(); assert.equal(await rows().count(), count); assert.match(await page.locator('main').innerText(), /recording is paused/);
    // Native consent remains authoritative even if the old frontend copy disagrees.
    await page.evaluate(() => { const key = 'ghostauth.android.preferences.v1'; const saved = JSON.parse(localStorage.getItem(key)); saved.privacy.history = true; localStorage.setItem(key, JSON.stringify(saved)); });
    await page.reload(); await heading('Your recent activity.'); assert.match(await page.locator('main').innerText(), /recording is paused/);
    await privacy(true); await route('pinVerify', 'Confirm it’s you.'); await pin('000000'); await page.getByRole('alert').waitFor();
    assert.equal(fixture.historyEntries.length, count + 1); await history();
    await btn('Clear history').click(); await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(fixture.historyEntries.length, count + 1);
    fixture.historyUnavailable = true; await dialogClear();
    await page.getByRole('dialog').getByRole('alert').waitFor(); assert.equal(fixture.historyEntries.length, count + 1);
    fixture.historyUnavailable = false;
    await page.getByRole('dialog').getByRole('button', { name: 'Clear history', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' }); assert.equal(await rows().count(), 0);
    assert.equal(fixture.pin, '654321'); assert.equal(fixture.biometricEnabled, true); assert.equal(fixture.historyEnabled, true);
    assert.deepEqual(fixture.protection.packages, ['com.example.mail']);
    await page.reload(); await heading('Your recent activity.'); assert.equal(await rows().count(), 0);
    // A snapshot taken before clear cannot repopulate the cleared screen.
    await route('pinVerify', 'Confirm it’s you.'); await pin('654321'); await heading('You’re verified.'); await history();
    fixture.historySnapshotPending = true; await btn('Refresh history').click();
    while (!fixture.completeHistorySnapshot) await new Promise(resolve => setTimeout(resolve, 10));
    await dialogClear(); await page.getByRole('dialog').waitFor({ state: 'detached' });
    fixture.historySnapshotPending = false; fixture.completeHistorySnapshot();
    assert.equal(await rows().count(), 0); assert.equal(fixture.historyEntries.length, 0);
    // Privacy-off upgrades are covered separately below; a broken history bridge must not block identity checks.
    fixture.malformedHistory = true; await btn('Refresh history').click(); await page.getByRole('alert').waitFor();
    await route('pinVerify', 'Confirm it’s you.'); await pin('654321'); await heading('You’re verified.');
    assert.equal(fixture.pin, '654321'); await history();
    await dialogClear(); await page.getByRole('dialog').waitFor({ state: 'detached' });
    assert.equal(fixture.historyEnabled, false); assert.equal(await rows().count(), 0);
    await page.screenshot({ path: require('node:path').join(output, 'native-history-empty.png') });
    await privacy(true); await route('pinVerify', 'Confirm it’s you.'); await pin('654321'); await heading('You’re verified.');
    const retained = fixture.historyEntries.length; await route('settings', 'Make it yours.');
    await btn('Reset saved preferences Restore app selection and data choices').click(); await btn('Reset preferences').click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    assert.equal(fixture.historyEntries.length, retained); assert.equal(fixture.historyEnabled, true);
    assert.deepEqual(fixture.protection.packages, []); assert.equal(fixture.pin, '654321'); assert.equal(fixture.biometricEnabled, true);
    assert.deepEqual(errors, []);
    return [
      'PIN success/failure and fingerprint nonmatch/success/cancel/lockout are distinct dated native history entries',
      'History survives reload and a new WebView without restoring launch approval or leaking PIN values',
      'Stored app labels and exact packages survive uninstall and distinguish apps sharing a label',
      'Native privacy consent pauses new recording, retains old entries and overrides stale frontend copies',
      'Clear cancel/failure/retry and reload preserve credentials, selection and recording choices',
      'Clear discards stale frontend snapshots; malformed history does not block authentication and can be reset',
      'Preference reset retains saved history and credentials while restoring recording consent and empty app scope',
    ];
  } finally { await context.close(); }
};
