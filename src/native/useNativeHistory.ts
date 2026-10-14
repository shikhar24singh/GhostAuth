import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { nativeAuthentication } from './auth';
import { checkedHistoryStatus, type HistoryStatus } from './history-status';

interface NativeHistory {
  getSnapshot(options?: { initialEnabled: boolean }): Promise<unknown>;
  configureRecording(options: { enabled: boolean }): Promise<unknown>;
  clearHistory(): Promise<unknown>;
  addListener(event: 'historyChanged', listener: () => void): Promise<PluginListenerHandle>;
}
const AndroidHistory = registerPlugin<NativeHistory>('GhostHistory');

export function useNativeHistory(initialEnabled: boolean) {
  const [status, setStatus] = useState<HistoryStatus | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(nativeAuthentication);
  const [ready, setReady] = useState(!nativeAuthentication);
  const [busy, setBusy] = useState(false);
  const initial = useRef(initialEnabled), mounted = useRef(false), epoch = useRef(0), mutating = useRef(false);
  const refresh = useCallback(async (initialize = false) => {
    if (!nativeAuthentication || !mounted.current || mutating.current) return;
    const request = ++epoch.current; setLoading(true);
    try {
      const result = checkedHistoryStatus(await AndroidHistory.getSnapshot(initialize ? { initialEnabled: initial.current } : undefined));
      if (mounted.current && request === epoch.current) { setStatus(result); setError(result.error ?? ''); }
    } catch {
      if (mounted.current && request === epoch.current) setError('Couldn’t read security history. Try refreshing or clear history to reset its storage. Your credentials are kept.');
    } finally {
      if (mounted.current && request === epoch.current) { setLoading(false); setReady(true); }
    }
  }, []);
  useEffect(() => {
    if (!nativeAuthentication) return;
    mounted.current = true; void refresh(true);
    const changes = AndroidHistory.addListener('historyChanged', () => { if (!document.hidden) void refresh(); });
    const foreground = App.addListener('appStateChange', ({ isActive }) => { if (isActive) void refresh(); });
    const visibility = () => { if (!document.hidden) void refresh(); };
    void changes.catch(() => {}); void foreground.catch(() => {});
    document.addEventListener('visibilitychange', visibility);
    return () => {
      mounted.current = false; epoch.current++;
      document.removeEventListener('visibilitychange', visibility);
      void changes.then(handle => handle.remove()).catch(() => {});
      void foreground.then(handle => handle.remove()).catch(() => {});
    };
  }, [refresh]);
  async function mutate(operation: () => Promise<unknown>): Promise<boolean> {
    if (mutating.current) return false;
    mutating.current = true; const request = ++epoch.current; setBusy(true); setLoading(false); setError('');
    try {
      const result = checkedHistoryStatus(await operation());
      if (mounted.current && request === epoch.current) { setStatus(result); setError(result.error ?? ''); }
      return true;
    } catch {
      if (mounted.current && request === epoch.current) setError('Couldn’t save security history settings. Your previous history and credentials are kept. Try again.');
      return false;
    } finally { mutating.current = false; if (mounted.current) setBusy(false); }
  }
  return { status, error, loading, ready, busy, refresh,
    configure: (enabled: boolean) => mutate(() => AndroidHistory.configureRecording({ enabled })),
    clear: () => mutate(() => AndroidHistory.clearHistory()) };
}
