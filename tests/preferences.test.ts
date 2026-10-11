import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, reducer } from '../src/mobile/state.ts';
import { PREFERENCES_KEY, loadPreferences, loadInitialState, savePreferences, clearSavedPreferences, type PreferencesStorage } from '../src/mobile/preferences.ts';

function memoryStorage(): PreferencesStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return { values, getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } };
}

test('saved choices rehydrate while temporary identity and session state starts fresh', () => {
  const storage = memoryStorage();
  let state = reducer(initialState(), { type: 'set-pin', pin: '654321' });
  state = reducer(state, { type: 'fingerprint', enabled: true });
  state = reducer(state, { type: 'verify', app: 'mail', pin: '654321', time: '12:00' });
  state = reducer(state, { type: 'privacy', value: { behavior: false, movement: false, history: false } });
  assert.equal(savePreferences({ ...state, selected: ['mail', 'browser'] }, storage), true);
  const loaded = loadInitialState(storage);
  assert.deepEqual(loaded.selected, ['mail', 'browser']);
  assert.deepEqual(loaded.privacy, { behavior: false, movement: false, history: false });
  assert.equal(loaded.pin, '123456');
  assert.equal(loaded.verified, null);
  assert.equal(loaded.fingerprint, false);
  assert.equal(loaded.events.length, 3);
  assert.deepEqual(Object.keys(JSON.parse(storage.values.get(PREFERENCES_KEY)!)).sort(), ['privacy', 'selected', 'version']);
});

test('empty app selection and disabled privacy choices survive reload', () => {
  const storage = memoryStorage();
  savePreferences({ selected: [], privacy: { behavior: false, movement: true, history: false } }, storage);
  assert.deepEqual(loadInitialState(storage).selected, []);
  assert.deepEqual(loadInitialState(storage).privacy, { behavior: false, movement: true, history: false });
});

test('unknown apps are ignored and duplicate apps are normalized', () => {
  const storage = memoryStorage();
  storage.values.set(PREFERENCES_KEY, JSON.stringify({ version: 1, selected: ['browser', 'unknown', 'mail', 'mail'], privacy: initialState().privacy, verified: 'mail', pin: '111111' }));
  const loaded = loadInitialState(storage);
  assert.deepEqual(loaded.selected, ['mail', 'browser']);
  assert.equal(loaded.verified, null);
  assert.equal(loaded.pin, '123456');
});

test('malformed or incompatible saved data falls back without overwriting it', () => {
  const storage = memoryStorage();
  for (const raw of ['{bad', 'null', '[]', JSON.stringify({ version: 2, selected: [], privacy: initialState().privacy }),
    JSON.stringify({ version: 1, selected: [123], privacy: initialState().privacy }),
    JSON.stringify({ version: 1, selected: [], privacy: { behavior: 'false', movement: false, history: false } })]) {
    storage.values.set(PREFERENCES_KEY, raw);
    assert.equal(loadPreferences(storage), null);
    assert.deepEqual(loadInitialState(storage), initialState());
    assert.equal(storage.values.get(PREFERENCES_KEY), raw);
  }
});

test('unavailable storage never crashes initialization and reports failed save/reset', () => {
  const storage: PreferencesStorage = {
    getItem: () => { throw new Error('Unavailable'); },
    setItem: () => { throw new Error('Quota exceeded'); },
    removeItem: () => { throw new Error('Unavailable'); },
  };
  assert.deepEqual(loadInitialState(storage), initialState());
  assert.equal(savePreferences(initialState(), storage), false);
  assert.equal(clearSavedPreferences(storage), false);
});

test('reset clears only GhostAuth preferences and retains a restricted session and custom PIN', () => {
  const storage = memoryStorage();
  storage.values.set('unrelated.setting', 'keep');
  savePreferences({ selected: [], privacy: { behavior: false, movement: false, history: false } }, storage);
  let state = reducer(initialState(), { type: 'set-pin', pin: '654321' });
  state = reducer(state, { type: 'restrict' });
  state = reducer(state, { type: 'select', apps: [] });
  state = reducer(state, { type: 'reset-preferences' });
  assert.equal(clearSavedPreferences(storage), true);
  assert.equal(storage.values.has(PREFERENCES_KEY), false);
  assert.equal(storage.values.get('unrelated.setting'), 'keep');
  assert.deepEqual(state.selected, initialState().selected);
  assert.deepEqual(state.privacy, initialState().privacy);
  assert.equal(state.restricted, true);
  assert.equal(state.pin, '654321');
  assert.equal(state.verified, null);
  assert.deepEqual(loadInitialState(storage), initialState());
});
