import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, reducer, canOpen, filterApps, validPin } from '../src/mobile/state.ts';

test('native mode never accepts demo PIN or simulated fingerprint actions', () => {
  const native = { ...initialState(), nativeAuth: true, pin: '', events: [] };
  assert.equal(reducer(native, { type: 'set-pin', pin: '123456' }).pin, '');
  assert.equal(reducer(native, { type: 'fingerprint', enabled: true }).fingerprint, false);
  assert.equal(reducer(native, { type: 'verify', app: 'mail', pin: '123456', time: '10:00' }).verified, null);
  assert.equal(reducer({ ...native, fingerprint: true }, { type: 'verify-fingerprint', app: 'mail', time: '10:00' }).verified, null);
});

test('native verification honors restrictions, app selection and revoked permissions', () => {
  const native = { ...initialState(), nativeAuth: true, pin: '', events: [] };
  const proof = { type: 'native-verified', app: 'mail', time: '10:00', method: 'PIN' } as const;
  const verified = reducer(native, proof);
  assert.equal(canOpen(verified, 'mail'), true);
  assert.equal(canOpen(verified, 'photos'), false);
  assert.equal(verified.events[0].method, 'PIN');
  assert.equal(reducer(reducer(verified, { type: 'restrict' }), proof).verified, null);
  assert.equal(reducer(reducer(verified, { type: 'select', apps: ['photos'] }), proof).verified, null);
  assert.equal(reducer(reducer(verified, { type: 'permission', permission: 'service', enabled: false }), proof).verified, null);
  assert.equal(reducer(initialState(), proof).verified, null);
});

test('native lock clears approval and preference resets never create credentials', () => {
  let state = { ...initialState(), nativeAuth: true, pin: '' };
  state = reducer(state, { type: 'native-status', fingerprint: true });
  state = reducer(state, { type: 'native-verified', app: 'mail', time: '10:00', method: 'fingerprint' });
  assert.equal(state.fingerprint, true);
  assert.equal(state.verified, 'mail');
  state = reducer(state, { type: 'lock' });
  assert.equal(state.verified, null);
  state = reducer(state, { type: 'reset-preferences' });
  assert.equal(state.pin, '');
  assert.equal(state.nativeAuth, true);
  assert.equal(state.verified, null);
});

test('PIN verification rejects incomplete and incorrect input and records failure', () => {
  const initial = initialState();
  for (const pin of ['123', '000000', 'abcdef']) {
    const result = reducer(initial, { type: 'verify', app: 'mail', pin, time: '10:00' });
    assert.equal(canOpen(result, 'mail'), false);
    assert.equal(result.events[0].decision, 'failed');
  }
  const passed = reducer(initial, { type: 'verify', app: 'mail', pin: '123456', time: '10:00' });
  assert.equal(canOpen(passed, 'mail'), true);
  assert.equal(canOpen(passed, 'photos'), false);
  assert.equal(initial.verified, null);
});

test('changing PIN invalidates a verified session and uses only the new PIN', () => {
  let state = reducer(initialState(), { type: 'verify', app: 'mail', pin: '123456', time: '10:00' });
  state = reducer(state, { type: 'set-pin', pin: '654321' });
  assert.equal(canOpen(state, 'mail'), false);
  assert.equal(reducer(state, { type: 'verify', app: 'mail', pin: '123456', time: '10:01' }).verified, null);
  assert.equal(reducer(state, { type: 'verify', app: 'mail', pin: '654321', time: '10:01' }).verified, 'mail');
  assert.equal(reducer(state, { type: 'set-pin', pin: '12' }).pin, '654321');
});

test('restrictions cannot be bypassed by PIN, biometrics or preference changes', () => {
  let state = reducer(initialState(), { type: 'fingerprint', enabled: true });
  state = reducer(state, { type: 'restrict' });
  state = reducer(state, { type: 'verify', app: 'mail', pin: '123456', time: '10:00' });
  assert.equal(canOpen(state, 'mail'), false);
  state = reducer(state, { type: 'verify-fingerprint', app: 'mail', time: '10:00' });
  state = reducer(state, { type: 'set-pin', pin: '654321' });
  assert.equal(state.restricted, true);
  assert.equal(state.verified, null);
  assert.equal(reducer(state, { type: 'new-session' }).restricted, false);
});

test('deselecting an app or revoking required access invalidates its verification', () => {
  const verified = reducer(initialState(), { type: 'verify', app: 'mail', pin: '123456', time: '10:00' });
  const removed = reducer(verified, { type: 'select', apps: ['photos', 'photos'] });
  assert.deepEqual(removed.selected, ['photos']);
  assert.equal(removed.verified, null);
  assert.equal(reducer(removed, { type: 'verify', app: 'mail', pin: '123456', time: '10:00' }).verified, null);
  for (const permission of ['usage', 'service'] as const) {
    const revoked = reducer(verified, { type: 'permission', permission, enabled: false });
    assert.equal(canOpen(revoked, 'mail'), false);
    assert.equal(reducer(revoked, { type: 'verify', app: 'mail', pin: '123456', time: '10:00' }).verified, null);
  }
});

test('privacy preference pauses new history without silently deleting existing events', () => {
  const state = reducer(initialState(), { type: 'privacy', value: { behavior: false, movement: false, history: false } });
  const result = reducer(state, { type: 'verify', app: 'mail', pin: '123456', time: '10:00' });
  assert.equal(result.events.length, 3);
  assert.equal(result.verified, 'mail');
  assert.equal(result.privacy.behavior, false);
});

test('fingerprint requires enrollment and search handles case, category and no matches', () => {
  assert.equal(reducer(initialState(), { type: 'verify-fingerprint', app: 'mail', time: '10:00' }).verified, null);
  const enrolled = reducer(initialState(), { type: 'fingerprint', enabled: true });
  assert.equal(reducer(enrolled, { type: 'verify-fingerprint', app: 'mail', time: '10:00' }).verified, 'mail');
  assert.deepEqual(filterApps('  MAIL ').map(a => a.id), ['mail']);
  assert.deepEqual(filterApps('downloads').map(a => a.id), ['files']);
  assert.deepEqual(filterApps('no match'), []);
  assert.equal(filterApps('').length, 4);
  assert.equal(validPin('012345'), true);
});
