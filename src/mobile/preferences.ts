import { APPS, initialState, type Privacy, type State } from './state.ts';

// Keep the original storage key so the brand correction preserves saved choices.
export const PREFERENCES_KEY = 'ghostnet.preferences.v1';
export type Preferences = Pick<State, 'selected' | 'privacy'>;
export type PreferencesStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function deviceStorage(): PreferencesStorage | undefined {
  try { return typeof window === 'undefined' ? undefined : window.localStorage; }
  catch { return undefined; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function loadPreferences(storage = deviceStorage()): Preferences | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(PREFERENCES_KEY);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.selected)
      || !value.selected.every(id => typeof id === 'string') || !isRecord(value.privacy)) return null;
    const privacy = value.privacy;
    if (typeof privacy.behavior !== 'boolean' || typeof privacy.movement !== 'boolean'
      || typeof privacy.history !== 'boolean') return null;
    const selected = value.selected;
    return {
      selected: APPS.filter(app => selected.includes(app.id)).map(app => app.id),
      privacy: { behavior: privacy.behavior, movement: privacy.movement, history: privacy.history },
    };
  } catch { return null; }
}

export function loadInitialState(storage = deviceStorage()): State {
  return { ...initialState(), ...loadPreferences(storage) };
}

export function savePreferences(preferences: Preferences, storage = deviceStorage()): boolean {
  if (!storage) return false;
  // Explicit fields keep temporary verification/session data out of saved preferences.
  const privacy: Privacy = {
    behavior: preferences.privacy.behavior,
    movement: preferences.privacy.movement,
    history: preferences.privacy.history,
  };
  const value = {
    version: 1,
    selected: APPS.filter(app => preferences.selected.includes(app.id)).map(app => app.id),
    privacy,
  };
  try { storage.setItem(PREFERENCES_KEY, JSON.stringify(value)); return true; }
  catch { return false; }
}

export function clearSavedPreferences(storage = deviceStorage()): boolean {
  if (!storage) return false;
  try { storage.removeItem(PREFERENCES_KEY); return true; }
  catch { return false; }
}
