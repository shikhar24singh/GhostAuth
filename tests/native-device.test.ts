import test from 'node:test';
import assert from 'node:assert/strict';
import { checkedDeviceStatus } from '../src/native/device-status.ts';
import { canVerify, filterApps, initialState, reducer } from '../src/mobile/state.ts';
import { ANDROID_PREFERENCES_KEY, PREFERENCES_KEY, clearSavedPreferences, loadInitialState, savePreferences } from '../src/mobile/preferences.ts';

const mail = { id: 'com.example.mail', name: 'Mail', description: 'com.example.mail' };
const photos = { id: 'com.example.photos', name: 'Photos', description: 'com.example.photos' };
const permissions = { usage: false, service: false, notifications: false };

test('native catalog normalizes labels, deduplicates packages, excludes GhostAuth and searches package names', () => {
  const status = checkedDeviceStatus({ apps: [photos, { ...mail, name: ' Mail ' }, mail,
    { id: 'com.ghostauth.app', name: 'GhostAuth' }], permissions });
  assert.deepEqual(status.apps, [mail, photos]);
  assert.deepEqual(filterApps('EXAMPLE.MAIL', status.apps), [mail]);
  assert.deepEqual(status.permissions, permissions);
  assert.deepEqual(checkedDeviceStatus({ apps: [], permissions }).apps, []);
  const icon = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aTXkAAAAASUVORK5CYII=';
  assert.equal(checkedDeviceStatus({ apps: [{ ...mail, icon }], permissions }).apps[0].icon, icon);
  for (const invalid of ['https://example.com/icon.png', 'data:image/svg+xml;base64,PHN2Zz4=',
    'data:image/png;base64,' + 'A'.repeat(65_536), 123]) {
    assert.deepEqual(checkedDeviceStatus({ apps: [{ ...mail, icon: invalid }], permissions }).apps, [mail]);
  }
});

test('malformed catalog or permission response fails instead of enabling simulated protection', () => {
  for (const value of [null, {}, { apps: [], permissions: {} },
    { apps: [], permissions: { ...permissions, service: true } },
    { apps: [], permissions: { ...permissions, usage: 'true' } },
    { apps: [{ id: 'mail', name: 'Mail' }], permissions },
    { apps: [{ id: 'com.example.mail', name: '' }], permissions }]) {
    assert.throws(() => checkedDeviceStatus(value));
  }
});

test('Android starts without demo apps, credentials, permission grants or sample events', () => {
  const state = initialState(true);
  assert.deepEqual(state.apps, []); assert.deepEqual(state.selected, []);
  assert.equal(state.pin, ''); assert.deepEqual(state.events, []);
  assert.deepEqual(state.permissions, permissions);
  assert.equal(canVerify(state, 'mail'), false);
});

test('protection requires consistent consent/connection status and a trusted selected-package request', () => {
  const protection = { configured: true, enabled: true, connected: true, packages: [mail.id], pending: { packageName: mail.id, id: 'request:1' } };
  const status = checkedDeviceStatus({ apps: [mail], permissions: { ...permissions, service: true }, protection });
  assert.equal(status.protection.pending?.packageName, mail.id);
  assert.equal(status.permissions.service, true);
  for (const invalid of [{ ...protection, enabled: false }, { ...protection, connected: false },
    { ...protection, packages: [photos.id] }, { ...protection, pending: { packageName: mail.id, id: 123 } }]) {
    assert.throws(() => checkedDeviceStatus({ apps: [mail], permissions: { ...permissions, service: true }, protection: invalid }));
  }
});

test('native protection selection is authoritative and service disconnection revokes displayed approval', () => {
  let state = reducer(initialState(true), { type: 'native-device', apps: [mail, photos], permissions: { ...permissions, service: true }, protectedPackages: [photos.id] });
  assert.deepEqual(state.selected, [photos.id]); assert.equal(state.permissions.service, true);
  state = reducer(state, { type: 'native-verified', app: photos.id, method: 'PIN', time: '10:00' });
  state = reducer(state, { type: 'native-device', apps: [mail, photos], permissions, protectedPackages: [photos.id] });
  assert.equal(state.verified, null);
  assert.equal(canVerify(state, photos.id), true, 'Local verification remains available while external protection is disconnected');
});

test('native selection is bounded by the installed catalog, and uninstall or status failure clears approval', () => {
  let state = reducer(initialState(true), { type: 'native-device', apps: [mail, photos], permissions });
  state = reducer(state, { type: 'select', apps: [mail.id, mail.id, 'com.missing.app'] });
  assert.deepEqual(state.selected, [mail.id]);
  assert.equal(canVerify(state, mail.id), true);
  state = reducer(state, { type: 'native-verified', app: mail.id, method: 'PIN', time: '12:00' });
  assert.equal(state.verified, mail.id);
  const unavailable = reducer(state, { type: 'native-device-unavailable' });
  assert.equal(unavailable.verified, null); assert.equal(canVerify(unavailable, mail.id), false);
  assert.deepEqual(unavailable.selected, [mail.id]);
  const uninstalled = reducer(state, { type: 'native-device', apps: [photos], permissions });
  assert.deepEqual(uninstalled.selected, []); assert.equal(uninstalled.verified, null);
  const changed = reducer(state, { type: 'native-device', apps: [mail, photos], permissions: { ...permissions, usage: true } });
  assert.equal(changed.verified, null);
  assert.equal(reducer(state, { type: 'permission', permission: 'service', enabled: true }), state);
});

test('native package preferences survive reload, isolate browser choices, and reset without creating demo defaults', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const browser = initialState();
  savePreferences(browser, storage);
  assert.deepEqual(loadInitialState(storage, true).selected, []);
  savePreferences({ selected: [mail.id, mail.id, 'mail', '../invalid'], privacy: browser.privacy }, storage, true);
  assert.deepEqual(loadInitialState(storage, true).selected, [mail.id]);
  assert.deepEqual(loadInitialState(storage).selected, browser.selected);
  assert.deepEqual(Object.keys(JSON.parse(values.get(ANDROID_PREFERENCES_KEY)!)).sort(), ['privacy', 'selected', 'version']);
  clearSavedPreferences(storage, true);
  assert.deepEqual(loadInitialState(storage, true).selected, []); assert.equal(values.has(PREFERENCES_KEY), true);
  const reset = reducer({ ...initialState(true), selected: [mail.id], fingerprint: true, restricted: true }, { type: 'reset-preferences' });
  assert.deepEqual(reset.selected, []); assert.equal(reset.pin, '');
  assert.equal(reset.fingerprint, true); assert.equal(reset.restricted, true);
});

test('Android upgrades retain legacy privacy consent without migrating sample apps or credentials', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const privacy = { behavior: false, movement: false, history: false };
  savePreferences({ selected: ['mail'], privacy }, storage);
  const upgraded = loadInitialState(storage, true);
  assert.deepEqual(upgraded.privacy, privacy); assert.deepEqual(upgraded.selected, []);
  assert.equal(upgraded.pin, ''); assert.deepEqual(upgraded.events, []);
  assert.equal(values.has(ANDROID_PREFERENCES_KEY), false, 'Reading legacy choices does not silently write preferences');
  assert.equal(clearSavedPreferences(storage, true), true);
  assert.deepEqual(loadInitialState(storage, true).privacy, initialState(true).privacy);
  assert.deepEqual(loadInitialState(storage).privacy, privacy, 'Native reset keeps the legacy preview record intact');
  savePreferences({ selected: [mail.id], privacy }, storage, true);
  assert.deepEqual(loadInitialState(storage, true).selected, [mail.id]);
  assert.deepEqual(loadInitialState(storage, true).privacy, privacy);
  assert.equal(clearSavedPreferences({ ...storage, setItem: () => { throw new Error('Unavailable'); } }, true), false);
  assert.deepEqual(loadInitialState(storage, true).privacy, privacy);
});
