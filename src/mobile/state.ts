export const APPS = [
  { id: 'mail', name: 'Mail', description: 'Messages & accounts' },
  { id: 'photos', name: 'Photos', description: 'Personal library' },
  { id: 'files', name: 'Files', description: 'Documents & downloads' },
  { id: 'browser', name: 'Browser', description: 'Browsing & saved logins' },
] as const;
export type AppId = typeof APPS[number]['id'];
export type Privacy = { behavior: boolean; movement: boolean; history: boolean };
export type Permission = 'usage' | 'service' | 'notifications';
export type SecurityEvent = { id: number; app: AppId; time: string; decision: 'verified' | 'allowed' | 'restricted' | 'failed'; reason: string; method?: 'PIN' | 'fingerprint' };
export type State = {
  selected: AppId[]; pin: string; fingerprint: boolean; privacy: Privacy;
  permissions: Record<Permission, boolean>; verified: AppId | null; restricted: boolean;
  events: SecurityEvent[]; learning: boolean;
  nativeAuth?: boolean;
};
export function initialState(): State {
  return { selected: ['mail', 'photos', 'files'], pin: '123456', fingerprint: false,
    privacy: { behavior: true, movement: true, history: true },
    permissions: { usage: true, service: true, notifications: true }, verified: null, restricted: false, learning: true,
    events: [
      { id: 3, app: 'mail', time: '09:41', decision: 'verified', reason: 'Network change detected.', method: 'PIN' },
      { id: 2, app: 'photos', time: '09:22', decision: 'allowed', reason: 'Low session risk.' },
      { id: 1, app: 'mail', time: '08:57', decision: 'restricted', reason: 'High session risk.' },
    ],
  };
}
export type Action =
  | { type: 'select'; apps: AppId[] }
  | { type: 'set-pin'; pin: string }
  | { type: 'privacy'; value: Privacy }
  | { type: 'permission'; permission: Permission; enabled: boolean }
  | { type: 'fingerprint'; enabled: boolean }
  | { type: 'restrict' }
  | { type: 'new-session' }
  | { type: 'reset-profile' }
  | { type: 'reset-preferences' }
  | { type: 'verify'; app: AppId; pin: string; time: string }
  | { type: 'verify-fingerprint'; app: AppId; time: string }
  | { type: 'native-status'; fingerprint: boolean }
  | { type: 'lock' }
  | { type: 'native-verified'; app: AppId; time: string; method: 'PIN' | 'fingerprint' };
export function canVerify(state: State, app: AppId) {
  return !state.restricted && state.selected.includes(app) && state.permissions.usage && state.permissions.service;
}
export function canOpen(state: State, app: AppId) { return canVerify(state, app) && state.verified === app; }
export function validPin(pin: string) { return /^\d{6}$/.test(pin); }
export function filterApps(query: string) {
  const q = query.trim().toLocaleLowerCase();
  return APPS.filter(app => `${app.name} ${app.description}`.toLocaleLowerCase().includes(q));
}
export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'select': { const selected = APPS.filter(app => action.apps.includes(app.id)).map(app => app.id); return { ...state, selected, verified: state.verified && selected.includes(state.verified) ? state.verified : null }; }
    case 'set-pin': return !state.nativeAuth && validPin(action.pin) ? { ...state, pin: action.pin, verified: null } : state;
    case 'privacy': return { ...state, privacy: { ...action.value } };
    case 'permission': return { ...state, permissions: { ...state.permissions, [action.permission]: action.enabled }, verified: action.enabled ? state.verified : null };
    case 'fingerprint': return state.nativeAuth ? state : { ...state, fingerprint: action.enabled };
    case 'native-status': return state.nativeAuth ? { ...state, fingerprint: action.fingerprint } : state;
    case 'lock': return { ...state, verified: null };
    case 'native-verified': {
      if (!state.nativeAuth || !canVerify(state, action.app)) return { ...state, verified: null };
      const event: SecurityEvent = { id: Math.max(0, ...state.events.map(e => e.id)) + 1, app: action.app,
        time: action.time, decision: 'verified', reason: 'Android identity verification completed.', method: action.method };
      return { ...state, verified: action.app, events: state.privacy.history ? [event, ...state.events].slice(0, 100) : state.events };
    }
    case 'restrict': return { ...state, restricted: true, verified: null };
    case 'new-session': return { ...state, restricted: false, verified: null };
    case 'reset-profile': return { ...state, learning: true, verified: null };
    case 'reset-preferences': {
      const defaults = initialState();
      return { ...state, selected: defaults.selected, privacy: defaults.privacy, verified: null };
    }
    case 'verify':
    case 'verify-fingerprint': {
      if (state.nativeAuth || !canVerify(state, action.app)) return { ...state, verified: null };
      const ok = action.type === 'verify' ? validPin(action.pin) && action.pin === state.pin : state.fingerprint;
      const event: SecurityEvent = { id: Math.max(0, ...state.events.map(e => e.id)) + 1, app: action.app, time: action.time,
        decision: ok ? 'verified' : 'failed', reason: ok ? 'Additional verification completed.' : 'Identity check did not match.', method: action.type === 'verify' ? 'PIN' : 'fingerprint' };
      return { ...state, verified: ok ? action.app : null, events: state.privacy.history ? [event, ...state.events].slice(0, 100) : state.events };
    }
  }
}
