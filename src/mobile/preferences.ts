import { APPS, initialState, type Privacy, type State } from './state.ts';

export const PREFERENCES_KEY = 'ghostnet.preferences.v1';
export const ANDROID_PREFERENCES_KEY = 'ghostauth.android.preferences.v1';
export function validPackageName(value: string): boolean {
  return value.length <= 255 && /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(value);
}
function selectedApps(selected: string[], native: boolean): string[] {
  return native ? [...new Set(selected.filter(validPackageName))]
    : APPS.filter(app => selected.includes(app.id)).map(app => app.id);
}
export type Preferences = Pick<State, 'selected' | 'privacy'>;
export type PreferencesStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function deviceStorage(): PreferencesStorage | undefined {
  try { return typeof window === 'undefined' ? undefined : window.localStorage; }
  catch { return undefined; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function loadPreferences(storage = deviceStorage(), native = false): Preferences | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(native ? ANDROID_PREFERENCES_KEY : PREFERENCES_KEY);
    if (raw === null) {
      const legacy = native ? loadPreferences(storage) : null;
      return legacy ? { selected: [], privacy: legacy.privacy } : null;
    }
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.selected)
      || !value.selected.every(id => typeof id === 'string') || !isRecord(value.privacy)) return null;
    const privacy = value.privacy;
    if (typeof privacy.behavior !== 'boolean' || typeof privacy.movement !== 'boolean'
      || typeof privacy.history !== 'boolean') return null;
    const selected = value.selected;
    return {
      selected: selectedApps(selected, native),
      privacy: { behavior: privacy.behavior, movement: privacy.movement, history: privacy.history },
    };
  } catch { return null; }
}

export function loadInitialState(storage = deviceStorage(), native = false): State {
  return { ...initialState(native), ...loadPreferences(storage, native) };
}

export function savePreferences(preferences: Preferences, storage = deviceStorage(), native = false): boolean {
  if (!storage) return false;
  const privacy: Privacy = {
    behavior: preferences.privacy.behavior,
    movement: preferences.privacy.movement,
    history: preferences.privacy.history,
  };
  const value = {
    version: 1,
    selected: selectedApps(preferences.selected, native),
    privacy,
  };
  try { storage.setItem(native ? ANDROID_PREFERENCES_KEY : PREFERENCES_KEY, JSON.stringify(value)); return true; }
  catch { return false; }
}

export function clearSavedPreferences(storage = deviceStorage(), native = false): boolean {
  if (!storage) return false;
  if (native) return savePreferences(initialState(true), storage, true);
  try { storage.removeItem(native ? ANDROID_PREFERENCES_KEY : PREFERENCES_KEY); return true; }
  catch { return false; }
}
