import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { nativeAuthentication } from './auth';
import { checkedResearchStatus, type ResearchStatus } from './research-status';

interface ResearchPlugin {
  getSnapshot(options?: { initialMovement: boolean }): Promise<unknown>;
  configure(options: { enabled?: boolean; movementAllowed?: boolean }): Promise<unknown>;
  clearData(): Promise<unknown>;
  addListener(event: 'researchChanged', listener: () => void): Promise<PluginListenerHandle>;
}
const AndroidResearch = registerPlugin<ResearchPlugin>('GhostResearch');
export function useNativeResearch(initialMovement: boolean) {
  const [status, setStatus] = useState<ResearchStatus | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(nativeAuthentication), [busy, setBusy] = useState(false);
  const initial = useRef(initialMovement), mounted = useRef(false), epoch = useRef(0), mutating = useRef(false);
  const refresh = useCallback(async (initialize = false) => {
    if (!nativeAuthentication || !mounted.current || mutating.current) return;
    const request = ++epoch.current; setLoading(true);
    try {
      const next = checkedResearchStatus(await AndroidResearch.getSnapshot(initialize ? { initialMovement: initial.current } : undefined));
      if (mounted.current && epoch.current === request) { setStatus(next); setError(next.error ?? ''); }
    } catch {
      if (mounted.current && epoch.current === request) { setStatus(null); setError('Couldn’t read research data. Collection status is unavailable. Refresh or clear research data; your credentials are kept.'); }
    } finally { if (mounted.current && epoch.current === request) setLoading(false); }
  }, []);
  useEffect(() => {
    if (!nativeAuthentication) return;
    mounted.current = true; void refresh(true);
    const changes = AndroidResearch.addListener('researchChanged', () => { if (!document.hidden) void refresh(); });
    const foreground = App.addListener('appStateChange', ({ isActive }) => { if (isActive) void refresh(); });
    void changes.catch(() => {}); void foreground.catch(() => {});
    return () => {
      mounted.current = false; epoch.current++;
      void changes.then(handle => handle.remove()).catch(() => {});
      void foreground.then(handle => handle.remove()).catch(() => {});
    };
  }, [refresh]);
  async function mutate(operation: () => Promise<unknown>) {
    if (mutating.current) return false;
    mutating.current = true; const request = ++epoch.current; setBusy(true); setLoading(false); setError('');
    try {
      const next = checkedResearchStatus(await operation());
      if (mounted.current && epoch.current === request) { setStatus(next); setError(next.error ?? ''); }
      return true;
    } catch {
      if (mounted.current && epoch.current === request) { setStatus(null); setError('Couldn’t save research settings. Collection stopped. Try again; your PIN and fingerprint are kept.'); }
      return false;
    } finally { mutating.current = false; if (mounted.current) setBusy(false); }
  }
  return { status, error, loading, busy, refresh,
    configure: (options: { enabled?: boolean; movementAllowed?: boolean }) => mutate(() => AndroidResearch.configure(options)),
    clear: () => mutate(() => AndroidResearch.clearData()) };
}
