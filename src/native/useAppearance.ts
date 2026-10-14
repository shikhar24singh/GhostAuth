import { useEffect, useRef, useState } from 'react';
import { registerPlugin, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { nativeAuthentication } from './auth';
import { applyDarkMode, loadDarkMode, saveDarkMode } from '../mobile/appearance';
interface NativeAppearance {
  getTheme(): Promise<{ dark: boolean }>;
  setTheme(options: { dark: boolean }): Promise<{ dark: boolean }>;
}
const AndroidAppearance = registerPlugin<NativeAppearance>('GhostAppearance');
function checked(value: { dark: boolean }): boolean {
  if (!value || typeof value.dark !== 'boolean') throw Error('Invalid appearance response');
  return value.dark;
}
export function useAppearance() {
  const [dark, setDark] = useState(() => loadDarkMode(nativeAuthentication));
  const [ready, setReady] = useState(!nativeAuthentication);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  useEffect(() => {
    applyDarkMode(dark);
    if (nativeAuthentication) void SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
  }, [dark]);
  useEffect(() => {
    if (!nativeAuthentication) return;
    let disposed = false;
    void AndroidAppearance.getTheme().then(result => {
      if (!disposed) { const saved = checked(result); setDark(saved); saveDarkMode(saved, true); }
    }).catch(() => { if (!disposed) setError('Couldn’t read the saved appearance. Try changing it again.'); })
      .finally(() => { if (!disposed) setReady(true); });
    return () => { disposed = true; };
  }, []);
  async function change(next: boolean) {
    if (pending.current || !ready) return;
    pending.current = true; setBusy(true); setError('');
    try {
      if (nativeAuthentication) {
        const saved = checked(await AndroidAppearance.setTheme({ dark: next }));
        setDark(saved); saveDarkMode(saved, true);
      } else {
        setDark(next);
        if (!saveDarkMode(next)) setError('Appearance changed for this session, but couldn’t be saved on this device.');
      }
    } catch { setError('Couldn’t save the appearance. Your previous setting is kept. Try again.'); }
    finally { pending.current = false; setBusy(false); }
  }
  return { dark, ready, busy, error, change };
}
