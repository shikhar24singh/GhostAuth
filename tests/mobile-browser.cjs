// Optional production UI smoke test. Set PLAYWRIGHT_MODULE to an installed playwright package.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../dist');
const output = path.resolve(__dirname, '../tmp/mobile-qa');
fs.mkdirSync(output, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); res.end(); return; }
  const target = file === root || file === root + path.sep ? path.join(root, 'index.html') : file;
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', mime[path.extname(target)] || 'application/octet-stream'); fs.createReadStream(target).pipe(res);
});
const checks = [], errors = [];
let browser;
async function run() {
  await new Promise(resolve => server.listen(4178, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.message));
  const url = 'http://127.0.0.1:4178/';
  if (process.argv.includes('--appearance-only')) {
    checks.push(...await require('./appearance-browser.cjs')(browser, url, output));
    console.log(JSON.stringify({ checks, errors }, null, 2)); return;
  }
  if (process.argv.includes('--history-only')) {
    checks.push(...await require('./native-history-browser.cjs')(browser, url, output));
    console.log(JSON.stringify({ checks, errors }, null, 2)); return;
  }
  if (process.argv.includes('--native-only')) {
    checks.push(...await require('./native-shell-browser.cjs')(browser, url, output));
    checks.push(...await require('./native-auth-browser.cjs')(browser, url, output));
    checks.push(...await require('./native-device-browser.cjs')(browser, url, output));
    checks.push(...await require('./native-launch-browser.cjs')(browser, url, output));
    checks.push(...await require('./native-protection-browser.cjs')(browser, url, output));
    checks.push(...await require('./native-fingerprint-browser.cjs')(browser, url, output));
    checks.push(...await require('./native-history-browser.cjs')(browser, url, output));
    checks.push(...await require('./appearance-browser.cjs')(browser, url, output));
    fs.writeFileSync(path.join(output, 'native-report.json'), JSON.stringify({ checks, errors }, null, 2));
    console.log(JSON.stringify({ checks, errors }, null, 2));
    return;
  }
  const btn = label => page.getByRole('button', { name: label, exact: true });
  const screen = async name => { await page.getByRole('heading', { name, exact: true }).waitFor(); };
  const shot = async name => { await page.evaluate(() => document.fonts.ready); return page.screenshot({ path: path.join(output, name + '.png'), fullPage: true }); };
  await page.goto(url); await screen('Your apps. Your access.'); await shot('welcome');
  assert.equal(await page.locator('.brand-art').evaluate(n => n.complete && n.naturalWidth > 0), true);
  await btn('Set up GhostAuth').click(); await btn('Continue').click(); await screen('Create your PIN.');
  await page.getByLabel('Six-digit PIN').fill('654321'); await btn('Continue').click();
  await screen('One more time.');
  await page.getByLabel('Six-digit PIN').fill('000000'); await btn('Confirm PIN').click();
  assert.match(await page.getByRole('alert').innerText(), /do not match/);
  await page.getByLabel('Six-digit PIN').fill('654321'); await btn('Confirm PIN').click();
  await btn('Enable fingerprint').click(); await btn('Simulate enabled').click();
  await btn('Continue to app selection').click(); await page.getByRole('checkbox', { name: 'Browser', exact: true }).check();
  await btn('Protect selected apps').click(); await btn('Open GhostAuth').click(); await screen('App protection.');
  assert.equal(await page.getByRole('button', { name: /Open .* protection details/ }).count(), 4);
  await shot('home-four-apps'); checks.push('Complete onboarding, mismatched PIN handling and fingerprint enrollment');
  await btn('Choose apps').click(); await page.getByRole('searchbox').fill('xyz');
  assert.equal(await page.getByRole('checkbox').count(), 0); await btn('Clear search').click();
  await page.getByRole('searchbox').fill('MAIL'); await page.getByRole('checkbox', { name: 'Mail', exact: true }).uncheck();
  await btn('Save selection').click(); assert.equal(await btn('Open Mail protection details').count(), 0);
  await btn('Choose apps').click(); await page.getByRole('checkbox', { name: 'Mail', exact: true }).check(); await btn('Save selection').click();
  checks.push('Live case-insensitive search, no-result recovery and saved selection');
  await btn('Open Mail protection details').click(); await btn('Preview identity check').click();
  await btn('Verify PIN').click(); assert.match(await page.getByRole('alert').innerText(), /all six/);
  await page.getByLabel('Six-digit PIN').fill('000000'); await btn('Verify PIN').click(); await screen('Let’s try that again.');
  for (const d of '654321') await btn('Digit ' + d).click();
  await btn('Delete digit').click(); assert.equal(await page.getByLabel('Six-digit PIN').inputValue(), '65432');
  await btn('Digit 1').click(); await btn('Try again').click(); await screen('You’re verified.');
  await btn('Continue to protected app').click(); await screen('Access granted.'); await btn('Return to GhostAuth').click();
  checks.push('PIN incomplete, wrong, keypad, backspace, correct and protected-app handoff');
  await page.getByRole('link', { name: 'Settings', exact: true }).click(); await btn('Privacy & data Choose what GhostAuth can use').click();
  await page.getByRole('checkbox', { name: 'Behavior signals' }).uncheck(); await page.getByRole('checkbox', { name: 'Security history' }).uncheck();
  await btn('Save preferences').click(); await btn('Privacy & data Choose what GhostAuth can use').click();
  assert.equal(await page.getByRole('checkbox', { name: 'Behavior signals' }).isChecked(), false);
  assert.equal(await page.getByRole('checkbox', { name: 'Security history' }).isChecked(), false);
  await btn('Reset learned profile').click(); await page.getByRole('dialog').waitFor(); await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0); await btn('Save preferences').click();
  checks.push('Saved privacy preferences and keyboard-dismissable confirmation');
  await page.getByRole('link', { name: 'Activity', exact: true }).click();
  await page.getByRole('button', { name: /Mail · access restricted/ }).click(); await btn('Preview restricted session').click();
  await screen('Let’s keep this closed.'); await page.evaluate(() => { location.hash = 'success'; }); await screen('Let’s keep this closed.');
  await page.evaluate(() => { location.hash = 'fingerprintCheck'; }); await screen('Let’s keep this closed.');
  checks.push('Restricted session blocks success and biometric route bypass');
  await btn('Return to safety').click(); await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await btn('Start a new demo session').click(); await page.getByRole('dialog').getByRole('button', { name: 'Continue', exact: true }).click();
  await screen('App protection.'); await page.goto(url + '#biometricVerify'); await screen('A moment to verify.');
  await btn('Verify with fingerprint').click(); await btn('No match · try again').click();
  assert.match(await page.getByRole('status').innerText(), /did not match/);
  await btn('Simulate a match').click(); await screen('You’re verified.');
  checks.push('Explicit session reset and fingerprint failure/success previews');
  await page.goto(url + '#settings'); await btn('Permissions Review protection access').click();
  await btn('Protection service Enabled · preview').click(); await btn('Simulate access revoked').click();
  await screen('One thing to fix.'); await page.goto(url + '#success'); await screen('One thing to fix.');
  await btn('Open Android settings').click(); await btn('Simulate access enabled').click(); await screen('Confirm it’s you.');
  checks.push('Revoked permission blocks access; restoration requires fresh verification');
  await page.goto(url + '#home'); await btn('Choose apps').click();
  for (const name of ['Mail', 'Photos', 'Files', 'Browser']) await page.getByRole('checkbox', { name, exact: true }).uncheck();
  await btn('Save selection').click(); await screen('Make it personal.'); await btn('Choose apps').click();
  await page.getByRole('checkbox', { name: 'Mail', exact: true }).check(); await btn('Save selection').click(); await screen('App protection.');
  checks.push('Empty selection and selecting an app again');
  await page.goto(url + '#success'); await page.reload(); await screen('Confirm it’s you.');
  checks.push('Unverified direct success route requires PIN');
  await page.evaluate(() => localStorage.removeItem('ghostnet.preferences.v1')); await page.reload();
  await page.goto(url + '#home'); await screen('App protection.'); await shot('home');
  assert.equal(await page.locator('.phone-shell').evaluate(n => Math.round(n.getBoundingClientRect().width)), 390);
  assert.equal(await page.locator('h1').evaluate(n => getComputedStyle(n).fontSize), '46px');
  checks.push('390px Figma frame, 46px heading and original logo loaded');
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    for (const route of ['welcome', 'home', 'manageApps', 'pinSetup', 'permissions', 'settings', 'privacySettings', 'fingerprintCheck', 'permissionPreview']) {
      await page.goto(url + '#' + route); await page.locator('h1').waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} overflows at ${width}`);
      assert.equal(await page.locator('button').evaluateAll(nodes => nodes.some(n => n.getBoundingClientRect().width === 0)), false);
    }
    await page.goto(url + '#home'); await shot('home-' + width);
  }
  checks.push('No horizontal overflow at 320, 390 and 1440 pixels');
  const preferences = await require('./preferences-browser.cjs')(browser, url, output, errors);
  checks.push(...preferences.checks);
  const android = await require('./android-review.cjs')(browser, url, output, errors);
  checks.push(`Android touch review: ${android.routeCount} routes at ${android.sizes.length} viewport sizes`);
  checks.push(...await require('./native-shell-browser.cjs')(browser, url, output));
  checks.push(...await require('./native-auth-browser.cjs')(browser, url, output));
  checks.push(...await require('./native-device-browser.cjs')(browser, url, output));
  checks.push(...await require('./native-launch-browser.cjs')(browser, url, output));
  checks.push(...await require('./native-protection-browser.cjs')(browser, url, output));
    checks.push(...await require('./native-fingerprint-browser.cjs')(browser, url, output));
    checks.push(...await require('./native-history-browser.cjs')(browser, url, output));
    checks.push(...await require('./appearance-browser.cjs')(browser, url, output));
  assert.deepEqual(errors, []); checks.push('No uncaught browser errors');
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ checks, errors }, null, 2));
  console.log(JSON.stringify({ checks, errors, screenshots: output }, null, 2));
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
