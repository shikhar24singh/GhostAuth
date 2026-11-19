import test from 'node:test';
import assert from 'node:assert/strict';
import { checkedResearchStatus } from '../src/native/research-status.ts';

const valid = { enabled: false, movementAllowed: true, collecting: false, pausedForError: false,
  total: 2, eligible: 1, rejected: 1, accelerometer: true, gyroscope: false, reasons: { eligible: 1, pin_flow: 1 },
  diagnostics: { fingerprintSessions: 1, pinSessions: 1, usableFingerprintSessions: 1, bothSensorsUsable: 0,
    stops: { verification_finished: 1 },
    acceleration: { windows: 1, usableWindows: 1, medianDurationMillis: 2000, medianRateHz: 20, maxGapMillis: 50 },
    rotation: { windows: 0, usableWindows: 0, medianDurationMillis: null, medianRateHz: null, maxGapMillis: null } } };
test('research diagnostics retain insufficient-data coverage and missing sensors', () => {
  assert.deepEqual(checkedResearchStatus(valid), valid);
});
test('research coverage rejects wrong denominators, fabricated measurements and contradictory sensor combinations', () => {
  const diagnostics = valid.diagnostics;
  for (const change of [{ fingerprintSessions: 2 }, { usableFingerprintSessions: 0 }, { bothSensorsUsable: 1 },
    { stops: {} }, { stops: { made_up: 1 } }, { stops: { focus_lost: -1 } },
    { acceleration: { ...diagnostics.acceleration, medianDurationMillis: NaN } },
    { acceleration: { ...diagnostics.acceleration, windows: 2 } },
    { acceleration: { ...diagnostics.acceleration, medianRateHz: null } },
    { rotation: { ...diagnostics.rotation, medianDurationMillis: 0 } },
    { rotation: { ...diagnostics.rotation, medianRateHz: 0, maxGapMillis: 0 } },
    { rotation: { ...diagnostics.rotation, windows: 1, usableWindows: 1 } }]) {
    assert.throws(() => checkedResearchStatus({ ...valid, diagnostics: { ...diagnostics, ...change } }));
  }
  assert.throws(() => checkedResearchStatus({ ...valid, diagnostics: undefined }));
});
test('one sensor reading preserves unknown rate and gaps and strips unrelated native fields', () => {
  const result = checkedResearchStatus({ ...valid, eligible: 0, rejected: 2, reasons: { too_short: 1, pin_flow: 1 },
    secret: 'not retained', diagnostics: { ...valid.diagnostics, usableFingerprintSessions: 0, participant: 'not retained',
      acceleration: { windows: 1, usableWindows: 0, medianDurationMillis: 0, medianRateHz: null, maxGapMillis: null, mean: 'not retained' } } });
  assert.equal(result.diagnostics.acceleration.medianRateHz, null);
  assert.equal(JSON.stringify(result).includes('not retained'), false);
});
test('malformed counts and impossible active-collection states are rejected', () => {
  for (const change of [{ total: 501 }, { total: 1 }, { eligible: -1 }, { reasons: { eligible: 2 } },
    { reasons: { made_up: 2 } }, { collecting: true }, { enabled: true, collecting: true, movementAllowed: false },
    { enabled: true, collecting: true, pausedForError: true }, { error: '' }]) {
    assert.throws(() => checkedResearchStatus({ ...valid, ...change }));
  }
});
