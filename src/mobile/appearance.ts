import type { PreferencesStorage } from './preferences.ts';
export const APPEARANCE_KEY = 'ghostauth.appearance.v1';
export const ANDROID_APPEARANCE_KEY = 'ghostauth.android.appearance.v1';
function storage(): PreferencesStorage | undefined {
  try { return typeof window === 'undefined' ? undefined : window.localStorage; } catch { return undefined; }
}
export function loadDarkMode(native = false, saved = storage()): boolean {
  try { return saved?.getItem(native ? ANDROID_APPEARANCE_KEY : APPEARANCE_KEY) === 'dark'; } catch { return false; }
}
export function saveDarkMode(dark: boolean, native = false, saved = storage()): boolean {
  try {
    if (!saved) return false;
    saved.setItem(native ? ANDROID_APPEARANCE_KEY : APPEARANCE_KEY, dark ? 'dark' : 'light'); return true;
  } catch { return false; }
}
export function applyDarkMode(dark: boolean) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#16181E' : '#F5F4F0');
}
