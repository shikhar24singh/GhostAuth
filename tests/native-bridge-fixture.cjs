// A deterministic bridge fixture for UI integration checks, not an Android emulator.
module.exports = async function installBridge(context, initial = {}) {
  const fixture = { pin: null, biometricAvailable: true, biometricEnabled: false,
    attempts: 0, lockedUntil: 0, expiresAt: 0, biometric: 'success', ...initial, calls: [] };
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
    fixture.calls.push({ plugin, method }); // No PIN values in diagnostic records.
    if (plugin === 'App') return { value: undefined };
    try {
      switch (method) {
        case 'lock': fixture.expiresAt = 0; return { value: undefined };
        case 'getStatus': if (fixture.unavailable) throw { code: 'AUTH_UNAVAILABLE' }; return { value: status() };
        case 'enrollPin':
          if (fixture.pin !== null) throw { code: 'ALREADY_ENROLLED' };
          fixture.pin = options.pin; return { value: status() };
        case 'verifyPin': {
          const ok = check(options.pin);
          fixture.expiresAt = ok ? Date.now() + 30_000 : 0;
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
          if (!fixture.biometricAvailable || !fixture.biometricEnabled) throw { code: 'BIOMETRIC_UNAVAILABLE' };
          if (fixture.biometric === 'cancel') throw { code: 'BIOMETRIC_CANCELED' };
          if (fixture.biometric === 'pending') await new Promise(resolve => { fixture.completeBiometric = resolve; });
          fixture.expiresAt = Date.now() + 30_000;
          return { value: { ...status(), verified: true, expiresInSeconds: 30 } };
        }
        default: throw { code: 'UNIMPLEMENTED' };
      }
    } catch (error) { return { error }; }
  });
  await context.addInitScript(() => {
    window.androidBridge = {};
    window.__nativeExits = 0;
    window.__authListeners = {};
    window.Capacitor = {
      PluginHeaders: [
        { name: 'App', methods: [{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'callback' }, { name: 'exitApp', rtype: 'promise' }] },
        { name: 'GhostAuth', methods: ['getStatus', 'lock', 'enrollPin', 'verifyPin', 'changePin', 'enableBiometric', 'disableBiometric', 'verifyBiometric']
          .map(name => ({ name, rtype: 'promise' })).concat([{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'callback' }]) },
      ],
      nativeCallback: (plugin, method, options, callback) => {
        if (method === 'addListener') {
          if (plugin === 'App' && options.eventName === 'backButton') window.__androidBack = callback;
          if (plugin === 'GhostAuth') window.__authListeners[options.eventName] = callback;
        }
        return 'mock-listener';
      },
      nativePromise: async (plugin, method, options) => {
        if (plugin === 'App' && method === 'exitApp') window.__nativeExits++;
        const result = await window.__mockNativeCall(plugin, method, options);
        if (result.error) throw result.error;
        if (plugin === 'GhostAuth' && method === 'lock') window.__authListeners.sessionEnded?.({});
        return result.value;
      },
    };
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.style.setProperty('--safe-area-inset-top', '28px');
      document.documentElement.style.setProperty('--safe-area-inset-bottom', '24px');
    });
  });
  return fixture;
};
