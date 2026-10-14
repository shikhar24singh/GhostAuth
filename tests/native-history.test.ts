import test from 'node:test';
import assert from 'node:assert/strict';
import { checkedHistoryStatus, eventOutcome, eventTime } from '../src/native/history-status.ts';
import { initialState, reducer, canOpen } from '../src/mobile/state.ts';
const entry = { id: 1, occurredAt: Date.UTC(2026, 9, 13, 12), packageName: 'com.example.mail', label: 'Mail', method: 'PIN', outcome: 'verified' };

test('native history preserves package, stored label, date, method and distinct outcomes', () => {
  for (const outcome of ['verified', 'failed', 'canceled', 'locked-out', 'unavailable']) {
    const status = checkedHistoryStatus({ enabled: true, entries: [{ ...entry, outcome }] });
    assert.equal(status.events[0].app, entry.packageName); assert.equal(status.events[0].appLabel, 'Mail');
    assert.equal(status.events[0].occurredAt, entry.occurredAt); assert.equal(status.events[0].outcome, outcome);
    assert.equal(status.events[0].decision, outcome === 'verified' ? 'verified' : 'failed');
    assert.ok(eventOutcome(status.events[0])); assert.match(eventTime(status.events[0]), /2026/);
  }
});
test('malformed or oversized history fails without admitting sample apps or unknown outcomes', () => {
  for (const entries of [[{ ...entry, id: 0 }], [{ ...entry, occurredAt: 0 }], [{ ...entry, occurredAt: 9e15 }],
    [{ ...entry, packageName: 'mail' }], [{ ...entry, label: '' }], [{ ...entry, method: 'password' }],
    [{ ...entry, outcome: 'allowed' }], Array.from({ length: 101 }, (_, i) => ({ ...entry, id: 101 - i }))]) {
    assert.throws(() => checkedHistoryStatus({ enabled: true, entries }));
  }
});
test('duplicate or unordered identifiers fail while clock rollback does not reorder native evidence', () => {
  assert.throws(() => checkedHistoryStatus({ enabled: true, entries: [entry, entry] }));
  assert.throws(() => checkedHistoryStatus({ enabled: true, entries: [entry, { ...entry, id: 2 }] }));
  const result = checkedHistoryStatus({ enabled: false, entries: [{ ...entry, id: 2, occurredAt: entry.occurredAt - 1000 }, entry] });
  assert.deepEqual(result.events.map(event => event.id), [2, 1]);
});
test('rehydrating verified history cannot grant access, enroll credentials or clear restrictions', () => {
  const native = { ...initialState(true), apps: [{ id: entry.packageName, name: 'Mail', description: entry.packageName }], selected: [entry.packageName], restricted: true };
  const status = checkedHistoryStatus({ enabled: false, entries: [entry] });
  const hydrated = reducer(native, { type: 'native-history', ...status });
  assert.equal(hydrated.verified, null); assert.equal(canOpen(hydrated, entry.packageName), false);
  assert.equal(hydrated.pin, ''); assert.equal(hydrated.fingerprint, false); assert.equal(hydrated.restricted, true);
  assert.equal(hydrated.privacy.history, false); assert.equal(hydrated.events.length, 1);
  assert.equal(reducer(initialState(), { type: 'native-history', ...status }).events.length, 3);
});
test('empty or paused history remains valid and untrusted extra fields are not retained', () => {
  assert.deepEqual(checkedHistoryStatus({ enabled: false, entries: [] }), { enabled: false, events: [] });
  const result = checkedHistoryStatus({ enabled: true, entries: [{ ...entry, pin: 'secret', sessionValid: true }], pin: 'secret' });
  assert.equal(JSON.stringify(result).includes('secret'), false);
});
