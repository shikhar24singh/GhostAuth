import { useCallback, useEffect, useRef, useState } from 'react';
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { checkedDiagnosticStatus, type DiagnosticStatus } from './diagnostic-status';

interface DiagnosticPlugin {
  openDiagnostic(): Promise<{ lease: string; status: unknown }>;
  closeDiagnostic(options: { lease: string }): Promise<void>;
  getDiagnostic(options: { lease: string }): Promise<unknown>;
  startDiagnostic(options: { lease: string; consent: true }): Promise<unknown>;
  stopDiagnostic(options: { lease: string }): Promise<unknown>;
  clearDiagnostic(options: { lease: string }): Promise<unknown>;
  copyDiagnostic(options: { lease: string; runId: number }): Promise<{ copied: boolean }>;
  addListener(event: 'diagnosticChanged', listener: () => void): Promise<PluginListenerHandle>;
}
const AndroidDiagnostic = registerPlugin<DiagnosticPlugin>('GhostResearch');
export function useMotionDiagnostic() {
  const [status, setStatus] = useState<DiagnosticStatus | null>(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const lease = useRef(''), mounted = useRef(false), epoch = useRef(0), mutating = useRef(false);
  const refresh = useCallback(async () => {
    if (!mounted.current || !lease.current || mutating.current) return;
    const request = ++epoch.current;
    try {
      const next = checkedDiagnosticStatus(await AndroidDiagnostic.getDiagnostic({ lease: lease.current }));
      if (mounted.current && request === epoch.current) { setStatus(next); setError(''); }
    } catch {
      if (mounted.current && request === epoch.current) { setStatus(null); setError('Couldn’t read the diagnostic. Reopen this screen to try again.'); }
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    const opened = AndroidDiagnostic.openDiagnostic();
    void opened.then(result => {
      if (disposed) { void AndroidDiagnostic.closeDiagnostic({ lease: result.lease }).catch(() => {}); return; }
      if (typeof result.lease !== 'string' || !result.lease || result.lease.length > 128) throw Error('Invalid screen lease');
      lease.current = result.lease; setStatus(checkedDiagnosticStatus(result.status)); setError('');
    }).catch(() => { if (!disposed) setError('The motion diagnostic is unavailable. Reopen this screen to try again.'); })
      .finally(() => { if (!disposed) setLoading(false); });
    const changes = AndroidDiagnostic.addListener('diagnosticChanged', () => { if (!document.hidden) void refresh(); });
    void changes.catch(() => {});
    const visibility = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      disposed = true; mounted.current = false; epoch.current++;
      const closing = lease.current; lease.current = '';
      if (closing) void AndroidDiagnostic.closeDiagnostic({ lease: closing }).catch(() => {});
      document.removeEventListener('visibilitychange', visibility);
      void changes.then(handle => handle.remove()).catch(() => {});
    };
  }, [refresh]);
  useEffect(() => {
    if (status?.state !== 'running') return;
    const interval = window.setInterval(() => void refresh(), 1000);
    return () => window.clearInterval(interval);
  }, [status?.state, refresh]);
  async function change(action: 'start' | 'stop' | 'clear' | 'copy') {
    if (mutating.current || !lease.current) return false;
    mutating.current = true; const request = ++epoch.current;
    setBusy(true); setError(''); setNotice('');
    try {
      const options = { lease: lease.current };
      if (action === 'copy') {
        if (!status?.run || status.state === 'running') return false;
        const result = await AndroidDiagnostic.copyDiagnostic({ ...options, runId: status.run.id });
        if (result?.copied !== true) throw Error('Copy failed');
        if (mounted.current && request === epoch.current) setNotice('Results copied to your clipboard.');
      } else {
        const next = checkedDiagnosticStatus(await (action === 'start' ? AndroidDiagnostic.startDiagnostic({ ...options, consent: true })
          : action === 'stop' ? AndroidDiagnostic.stopDiagnostic(options) : AndroidDiagnostic.clearDiagnostic(options)));
        if (mounted.current && request === epoch.current) setStatus(next);
      }
      return true;
    } catch {
      if (mounted.current && request === epoch.current) setError(action === 'copy' ? 'Couldn’t copy these results. Refresh and try again.'
        : 'Couldn’t change the diagnostic. Check motion research, Movement signals and that this screen is visible, then refresh.');
      return false;
    } finally { mutating.current = false; if (mounted.current) setBusy(false); }
  }
  return { status, error, notice, loading, busy, refresh,
    start: () => change('start'), stop: () => change('stop'), clear: () => change('clear'), copy: () => change('copy') };
}
