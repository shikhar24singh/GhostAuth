import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAndroidBack } from '../src/native/back.ts';

function actions(dialogOpen: boolean) {
  const calls: string[] = [];
  return { calls, dismissDialog: () => { if (dialogOpen) calls.push('dismiss'); return dialogOpen; },
    goBack: () => calls.push('back'), exit: () => calls.push('exit') };
}

test('Android Back dismisses a confirmation without navigating or exiting', () => {
  for (const canGoBack of [true, false]) {
    const controls = actions(true);
    handleAndroidBack(canGoBack, controls);
    assert.deepEqual(controls.calls, ['dismiss']);
  }
});

test('Android Back returns through route history when no dialog is open', () => {
  const controls = actions(false);
  handleAndroidBack(true, controls);
  assert.deepEqual(controls.calls, ['back']);
});

test('Android Back exits only when no dialog or previous route remains', () => {
  const controls = actions(false);
  handleAndroidBack(false, controls);
  assert.deepEqual(controls.calls, ['exit']);
});
