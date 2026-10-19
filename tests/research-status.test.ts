import test from 'node:test';
import assert from 'node:assert/strict';
import { checkedResearchStatus } from '../src/native/research-status.ts';

const valid = { enabled: false, movementAllowed: true, collecting: false, pausedForError: false,
  total: 2, eligible: 1, rejected: 1, accelerometer: true, gyroscope: false, reasons: { eligible: 1, too_short: 1 } };
test('research diagnostics retain insufficient-data coverage and missing sensors', () => {
  assert.deepEqual(checkedResearchStatus(valid), valid);
});
test('malformed counts and impossible active-collection states are rejected', () => {
  for (const change of [{ total: 501 }, { total: 1 }, { eligible: -1 }, { reasons: { eligible: 2 } },
    { reasons: { made_up: 2 } }, { collecting: true }, { enabled: true, collecting: true, movementAllowed: false },
    { enabled: true, collecting: true, pausedForError: true }, { error: '' }]) {
    assert.throws(() => checkedResearchStatus({ ...valid, ...change }));
  }
});
