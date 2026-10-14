// A deterministic bridge fixture for UI integration checks, not an Android emulator.
module.exports = async function installBridge(context, initial = {}) {
  const fixture = { pin: null, biometricAvailable: true, biometricEnabled: false,
    apps: [{ id: 'com.example.mail', name: 'Mail', icon: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aTXkAAAAASUVORK5CYII=' }, { id: 'com.example.photos', name: 'Photos' }],
    permissions: { usage: false, service: false, notifications: false },
    protection: { configured: false, enabled: false, connected: false, packages: [] },
    darkMode: false, historyEnabled: null, historyEntries: [], nextHistoryId: 1, nativeEpoch: 0,
    attempts: 0, lockedUntil: 0, expiresAt: 0, verifiedPackage: null, launched: [], biometric: 'success', ...initial, calls: [] };
  const recordHistory = (pkg, method, outcome) => {
    if (fixture.historyEnabled !== true || !pkg) return;
    fixture.historyEntries.unshift({ id: fixture.nextHistoryId++, occurredAt: Date.now(), packageName: pkg,
      label: (fixture.apps.find(app => app.id === pkg)?.name || pkg).slice(0, 160), method, outcome });
    fixture.historyEntries = fixture.historyEntries.slice(0, 100);
  };
  const history = () => ({ enabled: fixture.historyEnabled === true, entries: structuredClone(fixture.historyEntries) });
  const status = () => ({ pinSet: fixture.pin !== null, biometricAvailable: fixture.biometricAvailable,
    biometricEnabled: fixture.biometricEnabled, lockedForSeconds: Math.max(0, Math.ceil((fixture.lockedUntil - Date.now()) / 1000)),
    sessionValid: fixture.expiresAt > Date.now(), sessionRemainingMillis: Math.max(0, fixture.expiresAt - Date.now()) });
  const check = pin => {
    if (fixture.lockedUntil > Date.now()) return false;
    const ok = fixture.pin !== null && pin === fixture.pin;
    fixture.attempts = ok ? 0 : fixture.attempts + 1;
    if (!ok && fixture.attempts >= 5) fixture.lockedUntil = Date.now() + 30_000;
    return ok;
  };
  await context.exposeBinding('__mockNativeCall', async (_source, plugin, method, options) => {
    fixture.calls.push({ plugin, method, packageName: options?.packageName }); // No PIN values in diagnostic records.
    if (plugin === 'App') return { value: undefined };
    try {
      if (plugin === 'GhostAppearance') {
        if (fixture.appearanceUnavailable) throw { code: 'APPEARANCE_UNAVAILABLE' };
        if (method === 'setTheme') fixture.darkMode = options.dark;
        return { value: { dark: fixture.darkMode } };
      }
      if (plugin === 'SystemBars') { fixture.systemBarsStyle = options.style; return { value: undefined }; }
      if (plugin === 'GhostHistory') {
        if (method === 'simulateFingerprintFailure') { recordHistory(fixture.activeBio?.pkg, 'fingerprint', 'failed'); return { value: undefined }; }
        if (fixture.historyUnavailable || (method === 'getSnapshot' && fixture.historyReadUnavailable)) throw { code: 'HISTORY_UNAVAILABLE' };
        if (method === 'getSnapshot') {
          if (fixture.historyEnabled === null && options?.initialEnabled !== undefined) fixture.historyEnabled = options.initialEnabled;
          const value = history();
          if (fixture.historySnapshotPending) await new Promise(resolve => { fixture.completeHistorySnapshot = resolve; });
          return { value: fixture.malformedHistory ? { enabled: true, entries: [{ id: -1 }] } : value };
        }
        if (method === 'configureRecording') fixture.historyEnabled = options.enabled;
        if (method === 'clearHistory') { fixture.historyEntries = []; if (fixture.malformedHistory || fixture.historyReadUnavailable) fixture.historyEnabled = false; fixture.malformedHistory = false; fixture.historyReadUnavailable = false; }
        return { value: history() };
      }
      if (plugin === 'GhostDevice') {
        if (fixture.deviceUnavailable) throw { code: 'DEVICE_UNAVAILABLE' };
        if (method === 'getSnapshot') {
          fixture.protection.packages = fixture.protection.packages.filter(id => fixture.apps.some(app => app.id === id));
          const value = { apps: fixture.apps.map(app => ({ ...app })), permissions: { ...fixture.permissions,
            service: fixture.protection.enabled && fixture.protection.connected }, protection: structuredClone(fixture.protection) };
          if (fixture.snapshotPending) await new Promise(resolve => { fixture.completeSnapshot = resolve; });
          return { value };
        }
        if (method === 'configureProtection') {
          if (fixture.protectionUnavailable) throw { code: 'PROTECTION_UNAVAILABLE' };
          if (options.enabled === false) { fixture.protection.enabled = false; delete fixture.protection.pending; }
          else {
            if (options.packages.includes('com.android.settings')) throw { code: 'UNSAFE_APP' };
            fixture.protection.packages = [...options.packages]; fixture.protection.configured = true;
            if (options.enabled !== undefined) fixture.protection.enabled = options.enabled;
            delete fixture.protection.pending;
          }
          return { value: undefined };
        }
        if (method === 'cancelProtection') { delete fixture.protection.pending; fixture.canceledProtection = true; return { value: undefined }; }
        if (method === 'openSettings') {
          if (fixture.settingsUnavailable) throw { code: 'SETTINGS_UNAVAILABLE' };
          fixture.lastSettings = options.permission;
          return { value: undefined };
        }
      }
      switch (method) {
        case 'lock': fixture.nativeEpoch++; if (fixture.activeBio) { recordHistory(fixture.activeBio.pkg, 'fingerprint', 'canceled'); fixture.activeBio = null; } fixture.expiresAt = 0; fixture.verifiedPackage = null; if (!fixture.lateBiometric) fixture.cancelBiometric?.({ code: 'SESSION_ENDED' }); return { value: undefined };
        case 'launchApp': {
          if (fixture.launchPending) await new Promise(resolve => { fixture.completeLaunch = resolve; });
          const allowed = fixture.expiresAt > Date.now() && fixture.verifiedPackage === options.packageName;
          fixture.expiresAt = 0; fixture.verifiedPackage = null;
          if (!fixture.apps.some(app => app.id === options.packageName && !app.disabled) || fixture.launchUnavailable) throw { code: 'APP_UNAVAILABLE' };
          if (!allowed) throw { code: 'SESSION_ENDED' };
          if (fixture.protection.pending && fixture.protection.pending.packageName !== options.packageName) throw { code: 'SESSION_ENDED' };
          delete fixture.protection.pending;
          fixture.launched.push(options.packageName);
          return { value: undefined };
        }
        case 'getStatus': if (fixture.unavailable) throw { code: 'AUTH_UNAVAILABLE' }; return { value: status() };
        case 'enrollPin':
          if (fixture.pin !== null) throw { code: 'ALREADY_ENROLLED' };
          fixture.pin = options.pin; return { value: status() };
        case 'verifyPin': {
          fixture.expiresAt = 0; fixture.verifiedPackage = null;
          if (!fixture.apps.some(app => app.id === options.packageName && !app.disabled)) throw { code: 'APP_UNAVAILABLE' };
          const locked = fixture.lockedUntil > Date.now();
          const ok = check(options.pin);
          recordHistory(options.packageName, 'PIN', ok ? 'verified' : locked ? 'locked-out' : 'failed');
          fixture.expiresAt = ok ? Date.now() + 30_000 : 0;
          fixture.verifiedPackage = ok ? options.packageName : null;
          return { value: { ...status(), verified: ok, expiresInSeconds: ok ? 30 : 0 } };
        }
        case 'changePin': {
          const changed = check(options.currentPin);
          if (changed) fixture.pin = options.newPin;
          fixture.expiresAt = 0;
          return { value: { ...status(), changed } };
        }
        case 'enableBiometric':
        case 'disableBiometric': {
          const changed = check(options.pin);
          if (changed && method === 'enableBiometric' && fixture.biometric === 'cancel') throw { code: 'BIOMETRIC_CANCELED' };
          if (changed) fixture.biometricEnabled = method === 'enableBiometric';
          return { value: { ...status(), changed } };
        }
        case 'verifyBiometric': {
          fixture.expiresAt = 0; fixture.verifiedPackage = null;
          if (!fixture.apps.some(app => app.id === options.packageName && !app.disabled)) throw { code: 'APP_UNAVAILABLE' };
          if (!fixture.biometricAvailable || !fixture.biometricEnabled) { recordHistory(options.packageName, 'fingerprint', 'unavailable'); throw { code: 'BIOMETRIC_UNAVAILABLE' }; }
          if (fixture.biometric === 'cancel') { recordHistory(options.packageName, 'fingerprint', 'canceled'); throw { code: 'BIOMETRIC_CANCELED' }; }
          if (fixture.biometric === 'pin') { recordHistory(options.packageName, 'fingerprint', 'canceled'); throw { code: 'BIOMETRIC_USE_PIN' }; }
          if (fixture.biometric === 'lockout') { recordHistory(options.packageName, 'fingerprint', 'locked-out'); throw { code: 'BIOMETRIC_LOCKOUT' }; }
          const scan = { pkg: options.packageName, epoch: fixture.nativeEpoch }; fixture.activeBio = scan;
          if (fixture.biometric === 'pending') await new Promise((resolve, reject) => { fixture.completeBiometric = resolve; fixture.cancelBiometric = reject; });
          if (fixture.activeBio === scan) { fixture.cancelBiometric = null; fixture.activeBio = null; }
          if (scan.epoch === fixture.nativeEpoch) recordHistory(options.packageName, 'fingerprint', 'verified');
          fixture.expiresAt = Date.now() + 30_000;
          fixture.verifiedPackage = options.packageName;
          return { value: { ...status(), verified: true, expiresInSeconds: 30 } };
        }
        default: throw { code: 'UNIMPLEMENTED' };
      }
    } catch (error) { return { error }; }
  });
  await context.addInitScript(selected => {
    if (selected) localStorage.setItem('ghostauth.android.preferences.v1', JSON.stringify({ version: 1, selected,
      privacy: { behavior: true, movement: true, history: true } }));
    window.androidBridge = {};
    window.__nativeExits = 0;
    window.__authListeners = {};
    window.__appListeners = {};
    window.__deviceListeners = {};
    window.__historyListeners = {};
    window.__appCallbacks = {};
    window.Capacitor = {
      PluginHeaders: [
        { name: 'GhostAppearance', methods: ['getTheme', 'setTheme'].map(name => ({ name, rtype: 'promise' })) },
        { name: 'SystemBars', methods: [{ name: 'setStyle', rtype: 'promise' }] },
        { name: 'GhostHistory', methods: ['getSnapshot', 'configureRecording', 'clearHistory'].map(name => ({ name, rtype: 'promise' }))
          .concat([{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'callback' }]) },
        { name: 'App', methods: [{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'callback' }, { name: 'exitApp', rtype: 'promise' }] },
        { name: 'GhostAuth', methods: ['getStatus', 'lock', 'enrollPin', 'verifyPin', 'launchApp', 'changePin', 'enableBiometric', 'disableBiometric', 'verifyBiometric']
          .map(name => ({ name, rtype: 'promise' })).concat([{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'callback' }]) },
        { name: 'GhostDevice', methods: ['getSnapshot', 'openSettings', 'configureProtection', 'cancelProtection'].map(name => ({ name, rtype: 'promise' }))
          .concat([{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'callback' }]) },
      ],
      nativeCallback: (plugin, method, options, callback) => {
        if (method === 'addListener') {
          if (plugin === 'App' && options.eventName === 'backButton') window.__androidBack = callback;
          if (plugin === 'App') { (window.__appCallbacks[options.eventName] ||= []).push(callback); window.__appListeners[options.eventName] = event => window.__appCallbacks[options.eventName].forEach(listener => listener(event)); }
          if (plugin === 'GhostAuth') window.__authListeners[options.eventName] = callback;
          if (plugin === 'GhostDevice') window.__deviceListeners[options.eventName] = callback;
          if (plugin === 'GhostHistory') window.__historyListeners[options.eventName] = callback;
        }
        return 'mock-listener';
      },
      nativePromise: async (plugin, method, options) => {
        if (plugin === 'App' && method === 'exitApp') window.__nativeExits++;
        const result = await window.__mockNativeCall(plugin, method, options);
        if (plugin === 'GhostAuth' && ['verifyPin', 'verifyBiometric', 'lock'].includes(method)) window.__historyListeners.historyChanged?.({});
        if (result.error) throw result.error;
        if (plugin === 'GhostAuth' && method === 'lock') window.__authListeners.sessionEnded?.({});
        return result.value;
      },
    };
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.style.setProperty('--safe-area-inset-top', '28px');
      document.documentElement.style.setProperty('--safe-area-inset-bottom', '24px');
    });
  }, initial.selected);
  return fixture;
};
