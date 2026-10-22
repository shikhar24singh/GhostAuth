const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async function reviewAndroid(browser, url, output, errors) {
  const context = await browser.newContext({ isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    userAgent: `Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browser.version()} Mobile Safari/537.36` });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const routes = [...fs.readFileSync(path.join(__dirname, '../src/mobile/screens.ts'), 'utf8')
    .matchAll(/^  (\w+): \[/gm)].map(match => match[1]);
  const sizes = [[320, 568], [360, 640], [390, 844], [412, 915], [844, 390]];
  const frames = [];
  const button = name => page.getByRole('button', { name, exact: true });
  const heading = name => page.getByRole('heading', { name, exact: true }).waitFor();
  const shot = async name => {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(output, `android-${name}.png`) });
  };
  const checkTargets = async (label, locator = page.locator('button, .bottom-nav a, .app-row, .search-field, .pin-entry')) => {
    const small = await locator.evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect();
      return { name: node.getAttribute('aria-label') || node.textContent.trim(), width: rect.width, height: rect.height };
    }).filter(target => target.width < 48 || target.height < 48));
    assert.deepEqual(small, [], `Small touch targets: ${label}`);
  };
  const checkNavigation = async () => {
    const rect = await page.getByRole('navigation').boundingBox();
    const height = page.viewportSize().height;
    assert.ok(rect && rect.y >= 0 && rect.y + rect.height <= height + 1, 'Navigation must remain visible while scrolling');
  };
  try {
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      for (const route of routes) {
        await page.goto(url + '#' + route); await page.reload();
        await page.locator('h1').waitFor(); await page.evaluate(() => document.fonts.ready);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} overflows at ${width}x${height}`);
        assert.equal(await page.locator('.phone-shell').evaluate(node => Math.round(node.getBoundingClientRect().width)), width, 'Phone layout must use available width');
        await checkTargets(`${route} at ${width}x${height}`);
        frames.push({ route, width, height });
        if (route === 'home' && width === 844) {
          const appRow = await button('Open Mail protection details').boundingBox();
          const navigation = await page.getByRole('navigation').boundingBox();
          assert.ok(appRow && navigation && appRow.y + appRow.height <= navigation.y, 'Landscape shows an app row without scrolling');
        }
        if (width === 360 && ['welcome', 'home', 'pinSetup', 'privacySettings', 'recovery'].includes(route)) await shot(`${route}-${width}x${height}`);
        if (route === 'home' && [412, 844].includes(width)) await shot(`home-${width}x${height}`);
      }
      await page.goto(url + '#settings');
      await button('PIN & fingerprint Manage identity verification').tap();
      await page.getByRole('dialog').waitFor(); await checkTargets(`dialog at ${width}x${height}`, page.getByRole('dialog').locator('button'));
      const rect = await page.getByRole('dialog').boundingBox();
      assert.ok(rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= height, 'Dialog must fit phone viewport');
      if (width === 360) await shot('dialog-360x640');
      await button('Close dialog').tap();
    }

    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto(url + '#home'); await page.reload();
    await button('Choose apps').scrollIntoViewIfNeeded();
    const action = await button('Choose apps').boundingBox();
    const homeNav = await page.getByRole('navigation').boundingBox();
    assert.ok(action && homeNav && action.y + action.height <= homeNav.y, 'Main action must not sit behind navigation');
    await button('Choose apps').tap(); await page.getByRole('searchbox').tap();
    await page.setViewportSize({ width: 360, height: 360 });
    await page.getByRole('searchbox').fill('no app matches'); await checkTargets('No-results search');
    await button('Clear search').tap(); assert.equal(await page.getByRole('checkbox').count(), 4);
    await button('Save selection').tap(); await heading('App protection.');
    await page.setViewportSize({ width: 360, height: 640 });

    await page.goto(url + '#recovery');
    await button('Set up fingerprint Enable the preview or use your PIN.').tap();
    await button('Use PIN instead').tap(); await heading('Confirm it’s you.');
    await page.getByLabel('Six-digit PIN').tap();
    for (const digit of '123456') await button('Digit ' + digit).tap();
    await button('Verify PIN').tap(); await heading('You’re verified.');
    await page.goBack(); await heading('Confirm it’s you.');
    assert.equal(await page.getByLabel('Six-digit PIN').inputValue(), '', 'Back navigation clears PIN entry');

    await page.goto(url + '#settings'); await button('Permissions Review protection access').tap();
    await button('Protection service Enabled · preview').tap(); await button('Simulate access revoked').tap();
    await button('Back to GhostAuth').tap(); await heading('App protection.'); await checkTargets('Home permission fix');
    await button('Fix').tap(); await heading('One thing to fix.');
    await button('Open Android settings').tap(); await button('Simulate access enabled').tap();
    await button('Back to GhostAuth').tap(); await button('Open Mail protection details').tap();
    await button('Preview identity check').tap();
    for (let attempt = 0; attempt < 8; attempt++) {
      await page.getByLabel('Six-digit PIN').fill('000000');
      await button(attempt === 0 ? 'Verify PIN' : 'Try again').tap(); await heading('Let’s try that again.');
    }
    await page.goto(url + '#activity'); await checkNavigation();
    await page.locator('main').evaluate(node => node.scrollTo(0, node.scrollHeight)); await checkNavigation();
    const lastRow = await page.locator('.list-row').last().boundingBox();
    const nav = await page.getByRole('navigation').boundingBox();
    assert.ok(lastRow && nav && lastRow.y + lastRow.height <= nav.y, 'Last activity row must be readable above navigation');
    await shot('activity-scrolled');
    await page.getByRole('link', { name: 'Settings', exact: true }).tap(); await heading('Make it yours.');
    assert.equal(await page.locator('main').evaluate(node => node.scrollTop), 0, 'Navigation starts at the top of the next screen');
    await button('Start a new demo session').tap(); await button('Cancel').tap();

    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(url + '#home');
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--safe-top', '28px');
      document.documentElement.style.setProperty('--safe-bottom', '24px');
    });
    assert.equal(await page.locator('.status-bar').evaluate(node => Math.round(node.getBoundingClientRect().top)), 28);
    assert.equal(await page.getByRole('navigation').evaluate(node => Math.round(node.getBoundingClientRect().height)), 91);
    const link = await page.getByRole('link', { name: 'Settings', exact: true }).boundingBox();
    assert.ok(link && link.y + link.height <= 844 - 24, 'Navigation respects bottom system inset');
    await shot('safe-insets');
    await page.evaluate(() => {
      document.documentElement.style.removeProperty('--safe-top');
      document.documentElement.style.removeProperty('--safe-bottom');
    });
    const report = { routeCount: routes.length, layoutChecks: frames.length, sizes,
      checks: ['All defined routes fit phone viewports', 'Touch controls are at least 48 CSS pixels',
        'Phone layouts fill portrait and landscape widths; landscape shows an app before scrolling', 'Dialogs fit and close with touch',
        'Search remains usable in a reduced viewport', 'Fingerprint preview has a working PIN alternative',
        'PIN keypad works with touch and browser Back clears input', 'Permission Fix control works with touch',
        'Long activity keeps navigation visible without hiding the last row', 'Simulated display insets preserve navigation space'],
      limitations: ['Chromium mobile emulation, not a physical Android device', 'Native keyboard and display-cutout behavior require phone review'] };
    fs.writeFileSync(path.join(output, 'android-review.json'), JSON.stringify(report, null, 2));
    return report;
  } finally { await context.close(); }
};
