import test from 'node:test';
import assert from 'node:assert/strict';
import { checkedDiagnosticStatus } from '../src/native/diagnostic-status.ts';

const empty = (units: string) => ({ samples: 0, durationMillis: 0, rateHz: null, maxGapMillis: null, quality: 'too_short', units });
const idle = { canStart: true, blockedReason: null, accelerometer: true, gyroscope: false, windowMillis: 5000, state: 'idle', run: null };
const complete = { ...idle, state: 'complete', run: { id: 1, remainingMillis: 0, reason: 'completed',
  acceleration: { samples: 81, durationMillis: 4000, rateHz: 20, maxGapMillis: 50, quality: 'eligible', units: 'm/s²' }, rotation: empty('rad/s') } };
test('standalone diagnostic preserves missing sensors and never exposes feature vectors', () => {
  const result = checkedDiagnosticStatus({ ...complete, profile: 'private', run: { ...complete.run,
    acceleration: { ...complete.run.acceleration, mean: 'private', rms: 'private' } } });
  assert.equal(result.run?.rotation.rateHz, null);
  assert.equal(JSON.stringify(result).includes('private'), false);
  assert.deepEqual(checkedDiagnosticStatus(idle), idle);
});
test('diagnostic rejects impossible states, fabricated rates and invalid delivery claims', () => {
  for (const value of [{ ...idle, state: 'running' }, { ...idle, windowMillis: 10000 }, { ...idle, canStart: false },
    { ...complete, state: 'stopped' }, { ...complete, accelerometer: false }, { ...complete, run: { ...complete.run, reason: 'invented' } },
    { ...complete, run: { ...complete.run, remainingMillis: 1 } },
    ...[{ samples: 1 }, { durationMillis: 100 }, { maxGapMillis: 251 }, { rateHz: NaN }, { rateHz: 0 }, { units: 'g' }].map(change =>
      ({ ...complete, run: { ...complete.run, acceleration: { ...complete.run.acceleration, ...change } } }))]) {
    assert.throws(() => checkedDiagnosticStatus(value));
  }
});
test('interrupted runs stay stopped and a single reading has no invented rate or gap', () => {
  const stopped = { ...complete, state: 'stopped', run: { ...complete.run, reason: 'focus_lost',
    acceleration: { ...empty('m/s²'), samples: 1 } } };
  assert.equal(checkedDiagnosticStatus(stopped).run?.acceleration.rateHz, null);
  assert.throws(() => checkedDiagnosticStatus({ ...stopped, run: { ...stopped.run, acceleration: { ...stopped.run.acceleration, rateHz: 0 } } }));
});
