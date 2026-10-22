const assert = require('node:assert/strict');
const installBridge = require('./native-bridge-fixture.cjs');
module.exports = async function reviewResearch(browser, url, output) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const fixture = await installBridge(context, { pin: '654321', biometricEnabled: true, selected: ['com.example.mail'] });
  const page = await context.newPage(), errors = [], checks = [];
  page.on('pageerror', error => errors.push(error.message));
  const btn = name => page.getByRole('button', { name, exact: true });
  const heading = title => page.getByRole('heading', { name: title, exact: true }).waitFor();
  const route = async (hash, title) => { await page.evaluate(hash => { location.hash = hash; }, hash); await heading(title); };
  const research = async () => {
    await route('research', 'Motion research.'); await btn('Refresh research data').click();
    await page.getByText('Refreshing research data…', { exact: true }).waitFor({ state: 'detached' });
  };
  const clear = async () => {
    await btn('Clear research data').click(); await page.getByRole('dialog').getByRole('button', { name: 'Delete research data', exact: true }).click();
  };
  try {
    await page.goto(url + '#settings'); await heading('Make it yours.');
    await btn('Motion research Optional collection pilot').click(); await heading('Motion research.');
    await page.getByText('0 total · 0 usable · 0 insufficient or unverified', { exact: true }).waitFor();
    assert.equal(fixture.researchEnabled, false);
    await btn('Enable research collection').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(fixture.researchEnabled, false);
    await btn('Enable research collection').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Agree and enable', exact: true }).click();
    await btn('Pause research collection').waitFor(); assert.equal(fixture.researchEnabled, true);
    await page.reload(); await btn('Pause research collection').waitFor();
    checks.push('Research off by default, explicit cancellable consent, native enrollment persists on reload');

    await route('pinVerify', 'Confirm it’s you.'); await page.getByLabel('Six-digit PIN').fill('654321'); await btn('Verify PIN').click();
    await heading('You’re verified.'); await research();
    await page.getByText('1 total · 0 usable · 1 insufficient or unverified', { exact: true }).waitFor();
    await page.getByText('PIN flow excluded from motion capture', { exact: true }).waitFor();
    await route('home', 'App protection.'); await btn('Open Mail protection details').click(); await btn('Verify & open app').click();
    await heading('App protection.'); await research(); assert.equal(fixture.researchEntries.length, 2);
    assert.deepEqual(fixture.launched, ['com.example.mail']);
    await page.getByText('Too little motion data', { exact: true }).waitFor();
    checks.push('PIN excluded, fast fingerprint reports insufficient data, direct app launch remains intact');

    await btn('Pause research collection').click(); await btn('Enable research collection').waitFor();
    const retained = fixture.researchEntries.length;
    await route('pinVerify', 'Confirm it’s you.'); await page.getByLabel('Six-digit PIN').fill('654321'); await btn('Verify PIN').click();
    await heading('You’re verified.'); assert.equal(fixture.researchEntries.length, retained);
    await research(); await btn('Enable research collection').click(); await page.getByRole('dialog').getByRole('button', { name: 'Agree and enable', exact: true }).click();
    await btn('Pause research collection').waitFor(); await btn('Review privacy choices').click();
    await page.getByRole('checkbox', { name: 'Movement signals', exact: true }).uncheck(); await btn('Save preferences').click();
    await heading('Motion research.'); await page.getByText('Motion paused · Movement signals disabled', { exact: true }).waitFor();
    await page.reload(); await page.getByText('Motion paused · Movement signals disabled', { exact: true }).waitFor();
    assert.equal(fixture.movementAllowed, false);
    checks.push('Pause retains summaries; saved movement consent remains authoritative on reload');

    await clear(); await page.getByRole('dialog').waitFor({ state: 'detached' });
    assert.equal(fixture.researchEntries.length, 0); assert.equal(fixture.pin, '654321'); assert.equal(fixture.biometricEnabled, true);
    assert.equal(fixture.historyEntries.length, 3); assert.equal(fixture.researchEnabled, true);
    fixture.researchEntries = [{ reason: 'too_short' }]; await research();
    fixture.researchSnapshotPending = true; await btn('Refresh research data').click();
    while (!fixture.completeResearchSnapshot) await new Promise(resolve => setTimeout(resolve, 10));
    await clear(); await page.getByRole('dialog').waitFor({ state: 'detached' });
    fixture.researchSnapshotPending = false; fixture.completeResearchSnapshot();
    await page.getByText('0 total · 0 usable · 0 insufficient or unverified', { exact: true }).waitFor();
    checks.push('Clear preserves credentials, history and consent; stale snapshots cannot restore deleted rows');

    fixture.researchUnavailable = true; await btn('Refresh research data').click(); await page.getByRole('alert').first().waitFor();
    await route('pinVerify', 'Confirm it’s you.'); await page.getByLabel('Six-digit PIN').fill('654321'); await btn('Verify PIN').click(); await heading('You’re verified.');
    fixture.researchUnavailable = false; await research();
    fixture.malformedResearch = true; await btn('Refresh research data').click(); await page.getByRole('alert').first().waitFor();
    fixture.malformedResearch = false; await btn('Refresh research data').click(); await btn('Pause research collection').waitFor();
    checks.push('Unavailable/malformed research bridge reports error and cannot prevent native PIN verification');

    await route('settings', 'Make it yours.'); await btn('Reset saved preferences Restore app selection and data choices').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Reset preferences', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    assert.equal(fixture.researchEnabled, false); assert.equal(fixture.movementAllowed, true);
    assert.equal(fixture.pin, '654321'); assert.equal(fixture.biometricEnabled, true);
    await research(); await page.locator('main').evaluate(node => node.scrollTo(0, 0)); await page.screenshot({ path: require('node:path').join(output, 'native-research.png') });
    checks.push('Preference reset pauses research, restores movement defaults and preserves native credentials');
    assert.deepEqual(errors, []); return checks;
  } finally { await context.close(); }
};
