import { useCallback, useEffect, useRef, useState } from 'react';
import { AndroidAuth, authError, nativeAuthentication, type AuthStatus } from './auth';

function checkedStatus(value: AuthStatus): AuthStatus {
  if (!value || typeof value.pinSet !== 'boolean' || typeof value.biometricAvailable !== 'boolean'
    || typeof value.biometricEnabled !== 'boolean' || typeof value.sessionValid !== 'boolean'
    || !Number.isFinite(value.lockedForSeconds) || value.lockedForSeconds < 0
    || !Number.isFinite(value.sessionRemainingMillis) || value.sessionRemainingMillis < 0
    || value.sessionRemainingMillis > 30_000 || (value.sessionValid && value.sessionRemainingMillis === 0)) {
    throw new Error('Invalid native authentication response');
  }
  return value;
}

export function useNativeAuth(onLock: () => void, route: string) {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const working = useRef(false);
  const monitoring = useRef(false);
  const lockCallback = useRef(onLock);
  lockCallback.current = onLock;

  const ended = useCallback(() => {
    generation.current++;
    setStatus(previous => previous ? { ...previous, sessionValid: false, sessionRemainingMillis: 0 } : null);
    lockCallback.current();
  }, []);

  const refresh = useCallback(async () => {
    if (!nativeAuthentication || working.current) return;
    working.current = true; setBusy(true); setError('');
    try {
      if (!monitoring.current) throw new Error('Native session listener unavailable');
      await AndroidAuth.lock();
      const result = checkedStatus(await AndroidAuth.getStatus());
      setStatus({ ...result, sessionValid: false });
    } catch (failure) { setStatus(null); setError(authError(failure)); }
    finally { working.current = false; setBusy(false); }
  }, []);

  useEffect(() => {
    if (nativeAuthentication && working.current) {
      ended(); void AndroidAuth.lock().catch(() => {});
    }
  }, [route, ended]);

  useEffect(() => {
    if (!nativeAuthentication) return;
    let disposed = false;
    const listener = AndroidAuth.addListener('sessionEnded', event => {
      ended();
      if (event.active === true) {
        const epoch = generation.current;
        void AndroidAuth.getStatus().then(result => {
          if (!disposed && epoch === generation.current) setStatus({ ...checkedStatus(result), sessionValid: false, sessionRemainingMillis: 0 });
        }).catch(() => { if (!disposed) { setStatus(null); setError('Native authentication is unavailable. Restart GhostAuth.'); } });
      }
    });
    const failedListener = AndroidAuth.addListener('biometricFailed', () => {
      if (!disposed && working.current) setError('Fingerprint did not match. Try again or use your PIN.');
    });
    void failedListener.catch(() => {});
    void listener.then(handle => {
      if (disposed) { void handle.remove(); return; }
      monitoring.current = true; void refresh();
    }).catch(() => {
      monitoring.current = false;
      setStatus(null); setError('Native session monitoring is unavailable. Restart GhostAuth.');
    });
    const visibility = () => {
      if (document.hidden) { ended(); void AndroidAuth.lock().catch(() => {}); }
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      disposed = true; generation.current++;
      document.removeEventListener('visibilitychange', visibility);
      void listener.then(handle => handle.remove()).catch(() => {});
      void failedListener.then(handle => handle.remove()).catch(() => {});
    };
  }, [ended, refresh]);

  // Native code independently enforces the same deadline with a monotonic clock.
  useEffect(() => {
    if (!status?.sessionValid) return;
    const timer = window.setTimeout(() => { ended(); void AndroidAuth.lock().catch(() => {}); }, status.sessionRemainingMillis);
    return () => window.clearTimeout(timer);
  }, [status, ended]);

  async function run<T extends AuthStatus>(operation: () => Promise<T>, onFailure?: (failure: unknown) => boolean): Promise<T | null> {
    if (!nativeAuthentication || !status || working.current) return null;
    const epoch = generation.current;
    working.current = true; setBusy(true); setError('');
    try {
      const result = await operation();
      checkedStatus(result);
      if (epoch !== generation.current) return null;
      setError('');
      setStatus(result);
      return result;
    } catch (failure) {
      if (epoch === generation.current) {
        setError(onFailure?.(failure) ? '' : authError(failure)); generation.current++;
        setStatus(previous => previous ? { ...previous, sessionValid: false, sessionRemainingMillis: 0 } : null);
      }
      return null;
    } finally { working.current = false; setBusy(false); }
  }
  const cancel = () => { ended(); setError(''); void AndroidAuth.lock().catch(() => {}); };
  return { status, error, busy, run, refresh, cancel, clearError: () => setError('') };
}
