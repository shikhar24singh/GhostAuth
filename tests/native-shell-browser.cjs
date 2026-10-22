const assert = require('node:assert/strict');

module.exports = async function reviewNativeShell(browser, url, output) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await require('./native-bridge-fixture.cjs')(context, { pin: '654321', selected: ['com.example.mail'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const heading = name => page.getByRole('heading', { name, exact: true }).waitFor();
  try {
    await page.goto(url); await heading('Your apps. Your access.');
    await page.waitForFunction(() => typeof window.__androidBack === 'function');
    assert.equal(await page.locator('.status-bar').isVisible(), false, 'Native app uses the real system status bar');
    assert.equal(await page.locator('.app-header').evaluate(node => Math.round(node.getBoundingClientRect().top)), 28);
    await page.getByRole('button', { name: 'Open GhostAuth', exact: true }).tap(); await heading('App protection.');
    await page.evaluate(() => window.__androidBack({ canGoBack: true })); await heading('Your apps. Your access.');
    await page.goto(url + '#settings'); await heading('Make it yours.');
    await page.getByRole('button', { name: 'Reset saved preferences Restore app selection and data choices', exact: true }).tap();
    await page.getByRole('dialog').waitFor();
    await page.evaluate(() => window.__androidBack({ canGoBack: false }));
    await page.getByRole('dialog').waitFor({ state: 'detached' }); await heading('Make it yours.');
    assert.equal(await page.evaluate(() => window.__nativeExits), 0, 'Back dismisses the dialog before exiting');
    await page.evaluate(() => window.__androidBack({ canGoBack: false }));
    assert.equal(await page.evaluate(() => window.__nativeExits), 1);
    for (const [width, height] of [[320, 568], [844, 390]]) {
      await page.setViewportSize({ width, height });
      await page.goto(url + '#home'); await heading('App protection.');
      const shell = await page.locator('.phone-shell').boundingBox();
      const nav = await page.getByRole('navigation').boundingBox();
      assert.equal(Math.round(shell.width), width);
      assert.ok(nav && nav.y + nav.height <= height + 1);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: require('node:path').join(output, 'native-shell.png') });
    assert.deepEqual(errors, []);
    return ['Android shell hides the sample status row and honors native display insets',
      'Native Back bridge dismisses dialogs, navigates routes and exits at the root',
      'Native shell fills portrait and landscape viewports without obscuring navigation'];
  } finally { await context.close(); }
};
