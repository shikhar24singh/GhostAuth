const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async function reviewPreferences(browser, url, output, errors) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let page = await context.newPage();
  const watch = () => page.on('pageerror', error => errors.push(error.message));
  watch();
  const button = name => page.getByRole('button', { name, exact: true });
  const heading = name => page.getByRole('heading', { name, exact: true }).waitFor();
  const key = 'ghostnet.preferences.v1';
  const stored = () => page.evaluate(key => localStorage.getItem(key), key);
  const resetButton = () => button('Reset saved preferences Restore app selection and data choices');
  const checks = [];
  try {
    await page.goto(url + '#home'); await button('Choose apps').click();
    await page.getByRole('checkbox', { name: 'Mail', exact: true }).uncheck(); await page.reload();
    assert.equal(await page.getByRole('checkbox', { name: 'Mail', exact: true }).isChecked(), true);
    await page.getByRole('checkbox', { name: 'Photos', exact: true }).uncheck();
    await page.getByRole('checkbox', { name: 'Files', exact: true }).uncheck(); await button('Save selection').click();
    await page.reload(); await heading('App protection.');
    assert.equal(await page.getByRole('button', { name: /Open .* protection details/ }).count(), 1);
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await button('Privacy & data Choose what GhostAuth can use').click();
    for (const name of ['Behavior signals', 'Movement signals', 'Security history']) await page.getByRole('checkbox', { name, exact: true }).uncheck();
    await button('Save preferences').click(); await heading('Make it yours.');
    const previous = page; page = await context.newPage(); watch(); await previous.close();
    await page.goto(url + '#home'); await heading('App protection.');
    assert.equal(await button('Open Mail protection details').count(), 1);
    assert.equal(await page.getByRole('button', { name: /Open .* protection details/ }).count(), 1);
    await page.goto(url + '#privacySettings');
    for (const name of ['Behavior signals', 'Movement signals', 'Security history']) assert.equal(await page.getByRole('checkbox', { name, exact: true }).isChecked(), false);
    const payload = JSON.parse(await stored());
    assert.deepEqual(Object.keys(payload).sort(), ['privacy', 'selected', 'version']);
    checks.push('Only explicitly saved app and privacy choices survive reload and a reopened tab');

    await page.goto(url + '#home'); await button('Open Mail protection details').click();
    await button('Preview identity check').click(); await page.getByLabel('Six-digit PIN').fill('123456');
    await button('Verify PIN').click(); await heading('You’re verified.'); await page.reload(); await heading('Confirm it’s you.');
    checks.push('Restored preferences never restore a verified session');

    await page.goto(url + '#settings'); await resetButton().click(); await page.getByRole('dialog').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(output, 'preferences-reset-dialog.png') });
    await button('Cancel').click(); assert.deepEqual(JSON.parse(await stored()), payload);
    await page.evaluate(() => {
      window.testRemoveItem = Storage.prototype.removeItem;
      Storage.prototype.removeItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
    });
    await resetButton().click(); await button('Reset preferences').click();
    assert.match(await page.getByRole('dialog').getByRole('alert').innerText(), /Couldn’t reset/);
    assert.deepEqual(JSON.parse(await stored()), payload);
    await button('Cancel').click();
    await page.evaluate(() => { Storage.prototype.removeItem = window.testRemoveItem; });
    checks.push('Cancel and failed reset retain saved choices and offer a usable confirmation');

    await page.goto(url + '#activity'); await page.getByRole('button', { name: /Mail · access restricted/ }).click();
    await button('Preview restricted session').click(); await button('Return to safety').click();
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await resetButton().click(); await button('Reset preferences').click(); assert.equal(await stored(), null);
    await page.goto(url + '#success'); await heading('Let’s keep this closed.');
    await page.goto(url + '#home'); await page.reload();
    assert.equal(await page.getByRole('button', { name: /Open .* protection details/ }).count(), 3);
    await page.goto(url + '#privacySettings');
    for (const name of ['Behavior signals', 'Movement signals', 'Security history']) assert.equal(await page.getByRole('checkbox', { name, exact: true }).isChecked(), true);
    checks.push('Confirmed reset restores defaults across reload without bypassing an active restriction');

    await page.goto(url + '#home'); await button('Choose apps').click();
    for (const name of ['Mail', 'Photos', 'Files']) await page.getByRole('checkbox', { name, exact: true }).uncheck();
    await button('Save selection').click(); await page.reload(); await heading('Make it personal.');
    assert.deepEqual(JSON.parse(await stored()).selected, []);
    checks.push('An intentionally empty app selection persists');
    await page.evaluate(key => localStorage.setItem(key, '{malformed'), key);
    await page.goto(url + '#home'); await page.reload(); await heading('App protection.');
    assert.equal(await page.getByRole('button', { name: /Open .* protection details/ }).count(), 3);
    assert.equal(await stored(), '{malformed');
    checks.push('Malformed saved data falls back without crashing or silently overwriting it');
  } finally { await context.close(); }

  const unavailable = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    await unavailable.addInitScript(() => {
      const storage = window.localStorage;
      let blocked = !sessionStorage.getItem('test.storage-enabled');
      Object.defineProperty(window, 'localStorage', { configurable: true, get() {
        if (blocked) throw new DOMException('Blocked', 'SecurityError');
        return storage;
      } });
      window.enableTestStorage = () => { blocked = false; sessionStorage.setItem('test.storage-enabled', 'yes'); };
    });
    page = await unavailable.newPage(); watch(); await page.goto(url + '#home');
    await button('Choose apps').click(); await page.getByRole('checkbox', { name: 'Photos', exact: true }).uncheck();
    await button('Save selection').click(); await heading('App protection.');
    assert.match(await page.getByRole('alert').innerText(), /session only/);
    assert.equal(await page.getByRole('button', { name: /Open .* protection details/ }).count(), 2);
    await page.evaluate(() => window.enableTestStorage()); await button('Try saving again').click();
    assert.equal(await page.getByRole('alert').count(), 0); await page.reload();
    assert.equal(await page.getByRole('button', { name: /Open .* protection details/ }).count(), 2);
    checks.push('Unavailable storage leaves the frontend usable; retry saves once storage is available');
  } finally { await unavailable.close(); }
  const report = { checks, errors: [] };
  fs.writeFileSync(path.join(output, 'preferences-review.json'), JSON.stringify(report, null, 2));
  return report;
};
