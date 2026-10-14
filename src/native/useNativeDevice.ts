import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { nativeAuthentication } from './auth';
import { checkedDeviceStatus, type DeviceStatus } from './device-status';

interface NativeDevice {
  getSnapshot(): Promise<unknown>;
  openSettings(options: { permission: 'usage' | 'notifications' | 'service' }): Promise<void>;
  configureProtection(options: { packages: string[]; enabled?: boolean }): Promise<void>;
  cancelProtection(): Promise<void>;
  addListener(event: 'protectionChanged', listener: () => void): Promise<PluginListenerHandle>;
}
const AndroidDevice = registerPlugin<NativeDevice>('GhostDevice');

export function useNativeDevice() {
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  const [error, setError] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [loading, setLoading] = useState(nativeAuthentication);
  const [opening, setOpening] = useState(false);
  const epoch = useRef(0);
  const mounted = useRef(false);
  const settingsBusy = useRef(false);

  const refresh = useCallback(async () => {
    if (!nativeAuthentication || !mounted.current) return;
    const request = ++epoch.current;
    setLoading(true);
    try {
      const result = checkedDeviceStatus(await AndroidDevice.getSnapshot());
      if (!mounted.current || request !== epoch.current) return;
      setStatus(result); setError('');
    } catch {
      if (!mounted.current || request !== epoch.current) return;
      setStatus(null); setError('Couldn’t read installed apps or Android permissions. Try refreshing.');
    } finally {
      if (mounted.current && request === epoch.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!nativeAuthentication) return;
    mounted.current = true;
    void refresh();
    const visibility = () => { if (document.hidden) epoch.current++; else void refresh(); };
    document.addEventListener('visibilitychange', visibility);
    const listener = App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) epoch.current++; else void refresh();
    });
    const protectionListener = AndroidDevice.addListener('protectionChanged', () => { if (!document.hidden) void refresh(); });
    void protectionListener.catch(() => {});
    // Visibility changes still refresh status if the App listener is unavailable.
    void listener.catch(() => {});
    return () => {
      mounted.current = false; epoch.current++;
      document.removeEventListener('visibilitychange', visibility);
      void listener.then(handle => handle.remove()).catch(() => {});
      void protectionListener.then(handle => handle.remove()).catch(() => {});
    };
  }, [refresh]);

  async function openSettings(permission: 'usage' | 'notifications' | 'service') {
    if (settingsBusy.current) return;
    settingsBusy.current = true; setOpening(true); setSettingsError('');
    try { await AndroidDevice.openSettings({ permission }); }
    catch { if (mounted.current) setSettingsError('Android settings could not be opened. Use your phone’s Settings app, then return and refresh.'); }
    finally { settingsBusy.current = false; if (mounted.current) setOpening(false); }
  }
  async function configureProtection(packages: string[], enabled?: boolean) {
    if (settingsBusy.current) return false;
    settingsBusy.current = true; setOpening(true); setSettingsError('');
    try {
      await AndroidDevice.configureProtection({ packages, ...(enabled === undefined ? {} : { enabled }) });
      await refresh(); return true;
    } catch (error) {
      setSettingsError(error && typeof error === 'object' && 'code' in error && error.code === 'UNSAFE_APP'
        ? 'Android Settings, your launcher and keyboard must remain available. Remove them from the selection.'
        : 'Could not save protection settings. Refresh the app list and try again.'); return false;
    }
    finally { settingsBusy.current = false; setOpening(false); }
  }
  async function cancelProtection() { await AndroidDevice.cancelProtection(); await refresh(); }
  return { status, error, settingsError, loading, opening, refresh, openSettings,
    configureProtection, cancelProtection,
    clearSettingsError: () => setSettingsError('') };
}
