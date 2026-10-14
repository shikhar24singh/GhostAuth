import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { Activity, ArrowRight, Check, ChevronRight, Delete, Fingerprint, Folder, Grid2X2, LockKeyhole, Plus, Search, Settings } from 'lucide-react';
import Modal from '../components/Modal';
import { canOpen, canVerify, filterApps, initialState, reducer, validPin, type AppId, type Permission, type Privacy, type SecurityEvent } from './state';
import { readRoute, screens, type Route } from './screens';
import { clearSavedPreferences, loadInitialState, savePreferences, type Preferences } from './preferences';
import { AndroidAuth, authError, nativeAuthentication } from '../native/auth';
import { useNativeAuth } from '../native/useNativeAuth';
import { useNativeDevice } from '../native/useNativeDevice';
import { useAppearance } from '../native/useAppearance';
import { useNativeHistory } from '../native/useNativeHistory';
import { eventTime, eventOutcome } from '../native/history-status';
import './mobile.css';

function ActionButton({ children, onClick, secondary = false, submit = false, disabled = false }: { children: ReactNode; onClick?: () => void; secondary?: boolean; submit?: boolean; disabled?: boolean }) {
  return <button type={submit ? 'submit' : 'button'} disabled={disabled} className={`action-button${secondary ? ' secondary' : ''}`} onClick={onClick}><span>{children}</span><ArrowRight size={20} strokeWidth={1.5} aria-hidden="true" /></button>;
}
function Row({ title, detail, onClick }: { title: string; detail: string; onClick?: () => void }) {
  const content = <><span className="row-copy"><span className="row-title">{title}</span><span className="row-detail">{detail}</span></span>{onClick && <ChevronRight size={18} strokeWidth={1.5} aria-hidden="true" />}</>;
  return onClick ? <button type="button" className="list-row" onClick={onClick}>{content}</button> : <div className="list-row">{content}</div>;
}
function AppIcon({ icon }: { icon?: string }) {
  const [failedIcon, setFailedIcon] = useState<string>();
  return icon && failedIcon !== icon
    ? <img className="app-icon" src={icon} alt="" width={32} height={32} decoding="async" loading="lazy" onError={() => setFailedIcon(icon)} />
    : <Folder className={icon ? 'app-icon' : undefined} size={icon ? 32 : 24} strokeWidth={1.5} aria-hidden="true" />;
}
function AppRow({ title, detail, checked, icon, onToggle, onOpen }: { title: string; detail: string; checked: boolean; icon?: string; onToggle?: () => void; onOpen?: () => void }) {
  const content = <><AppIcon icon={icon} /><span className="row-copy"><span className="row-title">{title}</span><span className="row-detail">{detail}</span></span><span className={`checkbox${checked ? ' checked' : ''}`} aria-hidden="true">{checked && <Check size={18} strokeWidth={1.5} />}</span></>;
  return onToggle ? <label className="app-row"><input type="checkbox" checked={checked} onChange={onToggle} aria-label={title} />{content}</label> : <button type="button" className="app-row" onClick={onOpen} aria-label={`Open ${title} protection details`}>{content}</button>;
}
function Note({ title, children }: { title: string; children: ReactNode }) { return <div className="note"><p className="eyebrow">{title}</p><p className="small-copy">{children}</p></div>; }
function Spacer() { return <div className="spacer" />; }
const permissionLabels: Record<Permission, string> = { usage: 'App usage access', service: 'Protection service', notifications: 'Notifications' };
const privacyItems: [keyof Privacy, string, string][] = [['behavior', 'Behavior signals', 'Touch timing within GhostAuth'], ['movement', 'Movement signals', 'Device motion, when available'], ['history', 'Security history', 'Save verification attempts on this device']];
const protectedRoutes: Route[] = ['pinVerify', 'pinError', 'biometricVerify', 'fingerprintCheck', 'success', 'handoff'];
const timeNow = () => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date());
type ModalKind = 'reset-profile' | 'new-session' | 'security' | 'reset-preferences' | 'clear-history';
const modalTitles: Record<ModalKind, string> = {
  'reset-profile': 'Reset learned profile?', 'new-session': 'Start a new demo session?',
  security: 'PIN & fingerprint', 'reset-preferences': 'Reset saved preferences?',
  'clear-history': 'Clear security history?',
};
const modalMessages: Record<Exclude<ModalKind, 'security'>, string> = {
  'reset-profile': 'Restart the learning preview. Your selected apps, PIN and privacy preferences will be kept.',
  'new-session': 'Clear the current simulated restriction and verification. Your PIN, app selection and preferences will stay the same.',
  'reset-preferences': 'Restore the default app selection and privacy choices on this device? Your PIN will be kept.',
  'clear-history': 'Delete all saved verification history on this device? Your PIN, fingerprint, protected apps and privacy choices will be kept.',
};

export default function GhostAuthApp() {
  const [state, dispatch] = useReducer(reducer, undefined, () => loadInitialState(undefined, nativeAuthentication));
  const [route, setRoute] = useState<Route>(readRoute);
  const [currentApp, setCurrentApp] = useState<AppId>(state.selected[0] ?? '');
  const [draftApps, setDraftApps] = useState<AppId[]>(state.selected);
  const [draftPrivacy, setDraftPrivacy] = useState(state.privacy);
  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinContext, setPinContext] = useState<'setup' | 'settings'>('setup');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [returnRoute, setReturnRoute] = useState<Route>('settings');
  const [privacyReturn, setPrivacyReturn] = useState<Route>('settings');
  const [permission, setPermission] = useState<Permission>('service');
  const [event, setEvent] = useState<SecurityEvent | null>(state.events[0] ?? null);
  const [modal, setModal] = useState<ModalKind | null>(null);
  const [storageError, setStorageError] = useState('');
  const [resetError, setResetError] = useState('');
  const [launchError, setLaunchError] = useState('');
  const [launching, setLaunching] = useState(false);
  const launchPending = useRef(false);
  const protectionRequest = useRef('');
  const [quickVerification, setQuickVerification] = useState(false);
  const [verificationReady, setVerificationReady] = useState(false);
  const verificationGeneration = useRef(0);
  const automaticPrompt = useRef('');
  const verificationRoute = useRef(route);
  const heading = useRef<HTMLHeadingElement>(null);
  const scrollContent = useRef<HTMLElement>(null);
  const firstRender = useRef(true);
  const pinInput = useRef<HTMLInputElement>(null);
  const [authIntent, setAuthIntent] = useState<'verify' | 'changePin' | 'enableBiometric' | 'disableBiometric'>('verify');
  const appearance = useAppearance();
  const device = useNativeDevice();
  const history = useNativeHistory(state.privacy.history);
  const historyHydrated = useRef(false);
  useEffect(() => {
    if (nativeAuthentication && history.status) {
      dispatch({ type: 'native-history', enabled: history.status.enabled, events: history.status.events });
      if (!historyHydrated.current) {
        setDraftPrivacy(previous => ({ ...previous, history: history.status!.enabled })); historyHydrated.current = true;
      }
      setEvent(previous => previous ? history.status!.events.find(item => item.id === previous.id) ?? null : null);
    }
  }, [history.status]);
  useEffect(() => {
    if (!nativeAuthentication) return;
    if (device.status) {
      dispatch({ type: 'native-device', ...device.status, protectedPackages: device.status.protection.configured ? device.status.protection.packages : undefined });
      setDraftApps(previous => previous.filter(id => device.status!.apps.some(app => app.id === id)));
    } else if (device.error) dispatch({ type: 'native-device-unavailable' });
  }, [device.status, device.error]);
  useEffect(() => {
    if (!state.apps.some(app => app.id === currentApp)) setCurrentApp(state.selected[0] ?? '');
  }, [state.apps, state.selected, currentApp]);
  const auth = useNativeAuth(() => {
    dispatch({ type: 'lock' }); setPin(''); setNewPin(''); setModal(null); setAuthIntent('verify');
  }, route);
  useEffect(() => {
    const pending = device.status?.protection.pending;
    if (!pending) { protectionRequest.current = ''; return; }
    if (!auth.status || !history.ready || protectionRequest.current === pending.id) return;
    protectionRequest.current = pending.id;
    void beginVerification(pending.packageName);
  }, [device.status, auth.status, history.ready]);
  useEffect(() => {
    if (nativeAuthentication && auth.status) {
      dispatch({ type: 'native-status', fingerprint: auth.status.biometricEnabled });
      if (!auth.status.sessionValid) dispatch({ type: 'lock' });
    }
  }, [auth.status]);
  // Clear a partially entered new PIN when navigating away from credential setup.
  useEffect(() => {
    if (!['pinSetup', 'pinConfirm', 'pinVerify', 'pinError'].includes(route)) { setNewPin(''); setAuthIntent('verify'); }
  }, [route]);
  function go(next: Route) { if (next !== route) window.location.hash = next; }
  useEffect(() => {
    const change = () => { setPin(''); setError(''); setNotice(''); setRoute(readRoute()); };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
    scrollContent.current?.scrollTo(0, 0);
    if (!firstRender.current) heading.current?.focus({ preventScroll: true });
    firstRender.current = false;
  }, [route]);
  const app = state.apps.find(a => a.id === currentApp) ?? { name: 'Selected app', description: currentApp };
  const healthy = state.permissions.usage && state.permissions.service;
  const identityReady = nativeAuthentication || healthy;
  let view = route;
  const identityCheck = protectedRoutes.includes(view) && authIntent === 'verify';
  if (identityCheck && state.restricted) view = 'blocked';
  else if (identityCheck && !identityReady) view = 'permissionHealth';
  else if (identityCheck && (!state.selected.includes(currentApp) || !state.apps.some(app => app.id === currentApp))) view = 'empty';
  else if (['success', 'handoff'].includes(view) && (!canOpen(state, currentApp) || (nativeAuthentication && !auth.status?.sessionValid))) view = 'pinVerify';
  else if (view === 'home' && !state.selected.length) view = 'empty';
  if (view === 'event' && !event) view = 'activity';
  if (nativeAuthentication && auth.status) {
    if (!auth.status.pinSet && !['welcome', 'privacy', 'pinSetup', 'pinConfirm', 'privacySettings'].includes(view)) view = 'welcome';
    else if (auth.status.pinSet && view === 'pinSetup' && pinContext === 'setup') view = 'home';
  }
  const preview = screens[view][0] === 'PROTOTYPE PREVIEW' && !(nativeAuthentication && ['fingerprintSetup', 'fingerprintCheck', 'recoveryInfo', 'permissionPreview'].includes(view));
  const activeTab = (['home', 'activity', 'settings'] as Route[]).includes(view) ? view : null;
  let [kicker, title, subtitle]: string[] = [...screens[view]];
  if (view === 'appDetail') { title = app.name; subtitle = app.description; }
  const appName = (id: string) => state.apps.find(a => a.id === id)?.name ?? id;
  if (view === 'event' && event) subtitle = `${event.appLabel ?? appName(event.app)} · ${eventTime(event)}`;
  if (view === 'permissionPreview') title = permissionLabels[permission];
  if (view === 'permissionHealth' && healthy) { title = 'Ready to\nprotect.'; subtitle = 'The required access is enabled in this preview.'; }
  if (view === 'pinVerify' && state.pin !== '123456') subtitle = 'Enter the six-digit PIN you created in this preview.';
  if (nativeAuthentication) {
    if (view === 'permissionPreview') {
      kicker = 'ANDROID PERMISSIONS';
      subtitle = permission === 'service' ? 'Enable GhostAuth protection in Android Accessibility to require verification when selected apps open.'
        : permission === 'usage' ? 'Open Android Settings to allow or revoke usage access. GhostAuth currently checks the permission only; it does not read app usage history.'
        : 'Manage GhostAuth notifications in Android Settings. This build does not send protection alerts.';
    }
    if (view === 'permissionHealth') { title = 'Android\npermissions.'; subtitle = 'Protection requires the Android accessibility service. Usage access and notifications are optional.'; }
    if (view === 'permissions') { title = 'Review\npermissions.'; subtitle = 'Enable protection in Android Accessibility. Usage access and notifications are optional.'; }
    if (view === 'empty') subtitle = 'Choose installed apps, then enable protection in Permissions.';
    if (view === 'appSelect') subtitle = 'Launchable apps in this Android profile. Protection also requires the accessibility service.';
    if (view === 'risk') subtitle = 'Try local identity verification. Session risk is not calculated in this build.';
    if (view === 'pinVerify' || view === 'pinError') {
      subtitle = authIntent === 'changePin' ? 'Enter your current PIN to save the new one.'
        : authIntent === 'enableBiometric' ? 'Enter your PIN, then confirm with Android biometrics.'
        : authIntent === 'disableBiometric' ? 'Enter your PIN to turn off fingerprint verification.'
          : device.status?.protection.pending ? `${app.name} · ${currentApp}\nEnter your saved six-digit PIN to open this app.` : 'Enter your saved six-digit PIN.';
    }
    if (view === 'fingerprintSetup') { kicker = 'ANDROID SECURITY'; subtitle = 'Confirm your PIN, then approve the system biometric prompt. Your fingerprint stays with Android.'; }
    if (view === 'fingerprintCheck') { kicker = 'ANDROID SECURITY'; subtitle = 'Android will verify an enrolled strong biometric. You can use your GhostAuth PIN instead.'; }
    if (view === 'recoveryInfo') subtitle = 'There is no PIN recovery bypass. Use an enabled fingerprint for identity checks. Clearing app data removes your PIN and all GhostAuth settings.';
    if (view === 'home') subtitle = 'Verify with your PIN or fingerprint, then open a selected app.';
    if (view === 'learning') { title = 'Setup\ncomplete.'; subtitle = 'Your PIN is saved securely on this device. Enable protection in Permissions. Behavior learning remains a preview.'; }
    if (view === 'success') subtitle = 'Verified on this device for up to 30 seconds, while GhostAuth stays in the foreground.';
    if (view === 'handoff') subtitle = 'Open the app before your verification expires.';
  }
  useEffect(() => { document.title = `GhostAuth · ${title.replace(/\n/g, ' ')}`; }, [title]);
  useEffect(() => {
    if (!quickVerification || !verificationReady || route !== 'biometricVerify' || view !== 'biometricVerify'
      || auth.busy || launching || !auth.status || !canVerify(state, currentApp)) return;
    const key = `${verificationGeneration.current}:${currentApp}`;
    if (automaticPrompt.current === key) return;
    automaticPrompt.current = key;
    if (auth.status.biometricEnabled) void verifyBiometric();
    else go('pinVerify');
  }, [quickVerification, verificationReady, route, view, auth.busy, auth.status, launching, currentApp, state]);
  useEffect(() => {
    if (verificationRoute.current !== route && !protectedRoutes.includes(route)) {
      verificationGeneration.current++; setQuickVerification(false); setVerificationReady(false);
    }
    verificationRoute.current = route;
  }, [route]);
  function editApps(target: Route = 'manageApps') { setDraftApps([...state.selected]); setQuery(''); go(target); }
  function editPrivacy() { setDraftPrivacy({ ...state.privacy }); setPrivacyReturn(route); go('privacySettings'); }
  function openPermission(key: Permission) { device.clearSettingsError(); setPermission(key); setReturnRoute(route); go('permissionPreview'); }
  function openApp(id: AppId) { setLaunchError(''); setCurrentApp(id); go('appDetail'); }
  async function beginVerification(target: AppId) {
    if (!history.ready) return;
    const epoch = ++verificationGeneration.current;
    automaticPrompt.current = ''; setVerificationReady(false); setQuickVerification(true);
    setCurrentApp(target); dispatch({ type: 'lock' }); auth.clearError();
    setPin(''); setNewPin(''); setAuthIntent('verify'); setPinContext('setup'); setLaunchError(''); setModal(null);
    await AndroidAuth.lock().catch(() => {});
    if (epoch !== verificationGeneration.current) return;
    go(auth.status?.biometricEnabled ? 'biometricVerify' : 'pinVerify');
    setVerificationReady(true);
  }
  function usePinInstead() {
    verificationGeneration.current++; setVerificationReady(false); auth.cancel(); setPin(''); go('pinVerify');
  }
  function useFingerprintInstead() {
    automaticPrompt.current = ''; setVerificationReady(true); auth.clearError(); go('biometricVerify');
  }
  async function launchApp(verifiedTarget?: AppId) {
    if (!nativeAuthentication || launchPending.current) return;
    if (!verifiedTarget && (!canOpen(state, currentApp) || !auth.status?.sessionValid)) return;
    const target = verifiedTarget ?? currentApp;
    launchPending.current = true; setLaunching(true); setLaunchError('');
    try {
      // Native code consumes a fresh approval bound to this exact package.
      await AndroidAuth.launchApp({ packageName: target });
      go('home');
    } catch (failure) {
      setLaunchError(authError(failure));
      void device.refresh();
    } finally {
      dispatch({ type: 'lock' });
      await AndroidAuth.lock().catch(() => {});
      launchPending.current = false; setLaunching(false);
    }
  }
  function persistChoices(preferences: Preferences) {
    setStorageError(savePreferences(preferences, undefined, nativeAuthentication) ? '' : 'Couldn’t save on this device. Your choices apply to this session only.');
  }
  async function savePrivacy() {
    if (nativeAuthentication && !await history.configure(draftPrivacy.history)) return;
    persistChoices({ selected: state.selected, privacy: draftPrivacy });
    dispatch({ type: 'privacy', value: draftPrivacy }); go(privacyReturn);
  }
  async function confirmModal() {
    if (modal === 'clear-history') {
      if (!await history.clear()) return;
      setEvent(null);
    } else if (modal === 'reset-preferences') {
      if (nativeAuthentication && !await device.configureProtection([])) { setResetError('Could not reset Android protection settings. Try again.'); return; }
      if (nativeAuthentication && !await history.configure(true)) { setResetError('Could not reset security history settings. Try again.'); return; }
      if (!clearSavedPreferences(undefined, nativeAuthentication)) { setResetError('Couldn’t reset saved preferences. Please try again.'); return; }
      const defaults = initialState(nativeAuthentication);
      dispatch({ type: 'reset-preferences' });
      setDraftApps(defaults.selected); setDraftPrivacy(defaults.privacy); setStorageError('');
    } else if (modal === 'reset-profile' || modal === 'new-session') {
      dispatch({ type: modal }); go(modal === 'reset-profile' ? 'learning' : 'home');
    }
    setModal(null);
  }
  function requestBiometricChange(enable: boolean) {
    auth.clearError(); setPin(''); setAuthIntent(enable ? 'enableBiometric' : 'disableBiometric'); go('pinVerify');
  }
  async function verifyBiometric() {
    if (!canVerify(state, currentApp)) return;
    const epoch = verificationGeneration.current;
    const target = currentApp;
    setLaunchError('');
    const result = await auth.run(() => AndroidAuth.verifyBiometric({ packageName: target }), failure => {
      if (failure && typeof failure === 'object' && 'code' in failure && failure.code === 'BIOMETRIC_USE_PIN') {
        verificationGeneration.current++; setVerificationReady(false); setPin(''); go('pinVerify'); return true;
      }
      return false;
    });
    if (epoch !== verificationGeneration.current) return;
    if (result?.verified === true && result.sessionValid) {
      dispatch({ type: 'native-verified', app: target, method: 'fingerprint', time: timeNow() });
      if (quickVerification) await launchApp(target); else go('success');
    }
  }
  async function verify() {
    if (auth.busy || launchPending.current || !history.ready) return;
    if (!validPin(pin)) { setError('Enter all six digits to continue.'); pinInput.current?.focus(); return; }
    if (view === 'pinSetup') { setNewPin(pin); go('pinConfirm'); return; }
    if (view === 'pinConfirm') {
      if (!newPin) { setError('Create a PIN first.'); return; }
      if (pin !== newPin) { setError('The PINs do not match. Try again.'); setPin(''); return; }
      if (nativeAuthentication) {
        if (auth.status?.pinSet) { setAuthIntent('changePin'); go('pinVerify'); return; }
        const result = await auth.run(() => AndroidAuth.enrollPin({ pin }));
        setPin(''); setNewPin('');
        if (result?.pinSet) go('biometricSetup');
        return;
      }
      dispatch({ type: 'set-pin', pin }); go(pinContext === 'settings' ? 'settings' : 'biometricSetup'); return;
    }
    if (nativeAuthentication && authIntent !== 'verify') {
      const result = await auth.run(() => authIntent === 'changePin'
        ? AndroidAuth.changePin({ currentPin: pin, newPin })
        : authIntent === 'enableBiometric' ? AndroidAuth.enableBiometric({ pin }) : AndroidAuth.disableBiometric({ pin }));
      setPin('');
      if (result?.changed) {
        const next = authIntent === 'changePin' || pinContext === 'settings' ? 'settings' : returnRoute === 'biometricVerify' ? 'biometricVerify' : 'permissions';
        setNewPin(''); setAuthIntent('verify'); go(next);
      } else if (result) setError(result.lockedForSeconds ? `Too many attempts. Try again in ${result.lockedForSeconds} seconds.` : 'That PIN did not match. Try again.');
      return;
    }
    if (!canVerify(state, currentApp)) { go(state.restricted ? 'blocked' : !identityReady ? 'permissionHealth' : 'empty'); return; }
    if (nativeAuthentication) {
      const epoch = verificationGeneration.current;
      const target = currentApp;
      setLaunchError('');
      const result = await auth.run(() => AndroidAuth.verifyPin({ pin, packageName: target }));
      setPin('');
      if (epoch !== verificationGeneration.current) return;
      if (result?.verified === true && result.sessionValid) {
        dispatch({ type: 'native-verified', app: target, method: 'PIN', time: timeNow() });
        if (quickVerification) await launchApp(target); else go('success');
      } else if (result) setError(result.lockedForSeconds ? `Too many attempts. Try again in ${result.lockedForSeconds} seconds.` : 'That PIN did not match. Try again.');
      return;
    }
    dispatch({ type: 'verify', app: currentApp, pin, time: timeNow() });
    if (pin === state.pin) go('success'); else { setPin(''); setError('That PIN did not match. Try again.'); go('pinError'); }
  }
  const toggleApp = (id: AppId) => setDraftApps(selected => selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  async function saveApps() {
    if (nativeAuthentication && (!device.status || device.loading)) return;
    const selected = state.apps.filter(app => draftApps.includes(app.id)).map(app => app.id);
    if (view === 'appSelect' && !selected.length) { setReturnRoute('appSelect'); go('selectionEmpty'); return; }
    if (nativeAuthentication && !await device.configureProtection(selected)) return;
    persistChoices({ selected, privacy: state.privacy }); dispatch({ type: 'select', apps: selected });
    go(view === 'appSelect' ? 'learning' : selected.length ? 'home' : 'empty');
  }
  const visibleApps = filterApps(view === 'appSelect' ? '' : query, state.apps);
  function permissionDetail(key: Permission) {
    if (!nativeAuthentication) return state.permissions[key] ? 'Enabled · preview' : 'Action required · open Android settings';
    if (device.loading) return 'Checking Android status…';
    if (!device.status) return 'Status unavailable · refresh to retry';
    if (key === 'service') return device.status.protection.error ? 'Protection unavailable · review settings'
      : state.permissions.service ? 'Active · Android accessibility service' : device.status.protection.enabled
        ? 'Not connected · enable in Android Accessibility' : 'Off · enable protection';
    return state.permissions[key] ? 'Enabled on this device' : 'Not enabled · open Android settings';
  }
  async function cancelVerification() {
    verificationGeneration.current++; setQuickVerification(false); setVerificationReady(false);
    setAuthIntent('verify'); setNewPin('');
    if (nativeAuthentication && device.status?.protection.pending) {
      await AndroidAuth.lock().catch(() => {});
      try { await device.cancelProtection(); } catch { setLaunchError('Could not close the protected app. Return to your home screen.'); }
    }
    go(pinContext === 'settings' ? 'settings' : 'home');
  }
  async function enableProtection() {
    if (!await device.configureProtection(state.selected, true)) return;
    if (!device.status?.protection.connected) await device.openSettings('service');
  }
  const pinScreen = ['pinSetup', 'pinConfirm', 'pinVerify', 'pinError'].includes(view);
  function pinEntry() { return <>
    <div className="pin-entry"><input ref={pinInput} aria-label="Six-digit PIN" aria-describedby={error ? 'form-error' : undefined} aria-invalid={!!error} className="pin-input" type="password" autoComplete="off" inputMode="none" pattern="[0-9]{6}" maxLength={6} value={pin} onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }} /><div className="pin-cells" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <span className={`pin-cell${pin.length === i ? ' current' : ''}`} key={i}>{i < pin.length ? '•' : ''}</span>)}</div></div>
    {view === 'pinError' && <Note title="PIN did not match">Re-enter your six-digit PIN to try again.</Note>}
    <div className="keypad" aria-label="PIN keypad">{['1','2','3','4','5','6','7','8','9','','0','delete'].map((digit, i) => digit ? <button type="button" key={digit} aria-label={digit === 'delete' ? 'Delete digit' : `Digit ${digit}`} onClick={() => { setPin(p => digit === 'delete' ? p.slice(0, -1) : (p + digit).slice(0, 6)); setError(''); }}>{digit === 'delete' ? <Delete size={28} strokeWidth={1.5} aria-hidden="true" /> : digit}</button> : <span key={i} />)}</div>
    {error && <p className="form-error" id="form-error" role="alert">{error}</p>}<Spacer />
    {view === 'pinSetup' && <p className="small-copy muted">{nativeAuthentication ? 'Choose a PIN you can remember. Android securely stores a salted verifier, never your PIN.' : 'Avoid birthdays and repeated digits. Use a demo PIN.'}</p>}
    <ActionButton submit disabled={auth.busy || launching || !history.ready}>{launching ? 'Opening…' : auth.busy ? 'Verifying…' : view === 'pinSetup' ? 'Continue' : view === 'pinConfirm' ? 'Confirm PIN' : view === 'pinError' ? 'Try again' : 'Verify PIN'}</ActionButton>
    {view === 'pinConfirm' && <ActionButton secondary onClick={() => { setNewPin(''); go('pinSetup'); }}>Start again</ActionButton>}
    {view === 'pinVerify' && <ActionButton secondary disabled={auth.busy} onClick={() => void cancelVerification()}>Cancel</ActionButton>}
    {nativeAuthentication && authIntent === 'verify' && ['pinVerify', 'pinError'].includes(view) && state.fingerprint && <ActionButton secondary disabled={auth.busy} onClick={useFingerprintInstead}>Use fingerprint instead</ActionButton>}
  </>; }

  function content(): ReactNode {
    if (pinScreen) return pinEntry();
    switch (view) {
      case 'welcome': return <><img className="brand-art" src="/assets/ghostauth-logo.png" width="190" height="190" alt="GhostAuth fingerprint mark with a cobalt accent" /><Spacer /><ActionButton onClick={() => { setPinContext('setup'); go(nativeAuthentication && auth.status?.pinSet ? 'home' : 'privacy'); }}>{nativeAuthentication && auth.status?.pinSet ? 'Open GhostAuth' : 'Set up GhostAuth'}</ActionButton><p className="small-copy muted">{nativeAuthentication && auth.status?.pinSet ? 'Your saved PIN is ready for identity checks.' : 'A few steps. Always in your control.'}</p></>;
      case 'privacy': return <><Row title="Your apps, your choice" detail="Only apps you select are protected." /><Row title="No message or photo collection" detail="App content stays outside GhostAuth." /><Row title="Understand every signal" detail="Review and manage behavioral data." onClick={editPrivacy} /><Spacer /><ActionButton onClick={() => go('pinSetup')}>Continue</ActionButton><ActionButton secondary onClick={() => go('welcome')}>Back</ActionButton></>;
      case 'biometricSetup': return <><Fingerprint className="cobalt feature-icon" size={72} strokeWidth={1.5} /><Note title="Handled by Android">GhostAuth does not receive or store your fingerprint image.{nativeAuthentication && !auth.status?.biometricAvailable && ' Enroll a fingerprint or strong biometric in Android Settings to use it here.'}</Note><Spacer /><ActionButton onClick={() => { setReturnRoute('biometricSetup'); go('fingerprintSetup'); }}>{state.fingerprint ? 'Manage fingerprint' : 'Enable fingerprint'}</ActionButton><ActionButton secondary onClick={() => go(pinContext === 'settings' ? 'settings' : 'permissions')}>{pinContext === 'settings' ? 'Back to settings' : 'Set up later'}</ActionButton></>;
      case 'permissions': return <>{(Object.keys(permissionLabels) as Permission[]).map(key => <Row key={key} title={permissionLabels[key]} detail={nativeAuthentication ? permissionDetail(key) : key === 'usage' ? 'Detect which app is opened.' : key === 'service' ? 'Show verification when required.' : 'Know when protection needs attention.'} onClick={() => openPermission(key)} />)}<Note title="You remain in control">{nativeAuthentication ? 'Protection uses Android Accessibility. Usage access and notifications are optional for protection and local identity checks.' : 'Each permission opens an Android-settings preview. You can revoke access at any time.'}</Note><Spacer /><ActionButton onClick={() => editApps('appSelect')}>Continue to app selection</ActionButton></>;
      case 'appSelect':
      case 'manageApps': return <>{view === 'appSelect' ? <div className="section-label"><span>Selected apps</span><span>{String(draftApps.filter(id => state.apps.some(app => app.id === id)).length).padStart(2, '0')}</span></div> : <label className="search-field"><Search size={18} strokeWidth={1.5} aria-hidden="true" /><input aria-label="Search installed apps" placeholder="Search installed apps" type="search" value={query} onChange={e => setQuery(e.target.value)} /></label>}{visibleApps.map(a => <AppRow key={a.id} title={a.name} detail={a.description} icon={a.icon} checked={draftApps.includes(a.id)} onToggle={() => toggleApp(a.id)} />)}{!visibleApps.length && !(nativeAuthentication && (device.loading || device.error)) && <div className="no-results"><p>{state.apps.length ? `No apps match “${query}”.` : 'No launchable apps were found in this Android profile.'}</p>{query && <button className="text-link" onClick={() => setQuery('')}>Clear search</button>}</div>}<Spacer /><ActionButton disabled={nativeAuthentication && (!device.status || device.loading || device.opening)} onClick={() => void saveApps()}>{view === 'appSelect' ? nativeAuthentication ? 'Save selected apps' : 'Protect selected apps' : 'Save selection'}</ActionButton></>;
      case 'learning': return <><Note title={nativeAuthentication ? 'Selected apps saved' : 'Simulated protection'}>{nativeAuthentication ? 'Enable GhostAuth protection in Permissions to cover selected apps when they open. Behavior signals are not collected.' : 'Verification and behavior learning are simulated in this browser preview.'}</Note>{!nativeAuthentication && <><Row title="Touch & interaction patterns" detail="Collected with your consent." /><Row title="Movement signals" detail="Used only where Android permits." /></>}<Spacer /><ActionButton onClick={() => go('home')}>Open GhostAuth</ActionButton><ActionButton secondary onClick={editPrivacy}>Review data choices</ActionButton></>;
      case 'home': return <><div className="protection-status"><LockKeyhole className="cobalt" size={18} strokeWidth={1.5} /><span>{nativeAuthentication ? state.permissions.service ? 'Protection service active' : 'Protection is off or disconnected' : 'Simulated protection'}</span><button className="text-link" onClick={() => go('permissionHealth')}>{!nativeAuthentication && !healthy ? 'Fix' : 'Permissions'}</button></div><div className="section-label"><span>Selected apps</span></div>{state.apps.filter(a => state.selected.includes(a.id)).map(a => <AppRow key={a.id} title={a.name} detail={a.description} icon={a.icon} checked onOpen={() => openApp(a.id)} />)}<Spacer /><ActionButton onClick={() => editApps()}>Choose apps</ActionButton></>;
      case 'empty': return <><Plus className="cobalt feature-icon" size={48} strokeWidth={1.5} /><Note title="No apps selected">{nativeAuthentication ? 'Select installed apps and enable GhostAuth protection in Permissions.' : 'Select sample apps to try the protection preview.'}</Note><Spacer /><ActionButton onClick={() => editApps()}>Choose apps</ActionButton><ActionButton secondary onClick={() => go('permissionHealth')}>Check permissions</ActionButton></>;
      case 'appDetail': return <><Row title="Protection" detail={nativeAuthentication ? state.permissions.service ? 'On · Android accessibility service' : 'Off · enable the protection service' : `${state.selected.includes(currentApp) ? 'On' : 'Off'} · simulated verification`} onClick={() => editApps()} /><Row title="Current session" detail={state.restricted ? 'Access restricted' : canOpen(state, currentApp) ? 'Identity verified' : 'Additional verification required'} onClick={() => go(state.restricted ? 'blocked' : 'risk')} /><Row title="Recent activity" detail="Review access attempts" onClick={() => go('activity')} /><Note title="How access works">{nativeAuthentication ? 'With the accessibility service active, opening this app shows a GhostAuth lock screen. Verify to open it; leaving the app or turning off the screen locks it again.' : 'Low-risk sessions continue. Higher-risk sessions need verification or remain restricted.'}</Note><Spacer /><ActionButton onClick={() => { if (nativeAuthentication) void beginVerification(currentApp); else go('pinVerify'); }}>{nativeAuthentication ? 'Verify & open app' : 'Preview identity check'}</ActionButton><ActionButton secondary onClick={() => go('home')}>Back to apps</ActionButton></>;
      case 'risk': return <>{nativeAuthentication ? <Note title="Identity check preview">No risk engine or behavior learning runs in this build. You can try your saved PIN or enabled biometrics inside GhostAuth.</Note> : <><Row title="Network changed" detail="You recently joined another network." /><Row title="Behavior profile" detail="Still learning your normal interactions." /><Row title="Device checks" detail="Available checks passed." /><Note title="Additional verification">Confirm your identity before continuing to your protected app.</Note></>}<Spacer /><ActionButton onClick={() => go('pinVerify')}>Verify identity</ActionButton><ActionButton secondary onClick={() => go('appDetail')}>Back</ActionButton></>;
      case 'biometricVerify': return <><Fingerprint className="cobalt feature-icon" size={72} strokeWidth={1.5} /><Note title="Android verification">{state.fingerprint ? 'Use a fingerprint registered on this device.' : nativeAuthentication ? 'Fingerprint is unavailable or has not been enabled. Use your PIN, or enable fingerprint in Settings.' : 'Fingerprint is not enabled in this preview. Set it up or use your PIN.'}</Note><Spacer /><ActionButton disabled={auth.busy} onClick={() => { if (state.fingerprint) { if (nativeAuthentication) void verifyBiometric(); else go('fingerprintCheck'); } else { setReturnRoute('biometricVerify'); go('fingerprintSetup'); } }}>{auth.busy ? 'Waiting for Android…' : state.fingerprint ? 'Verify with fingerprint' : 'Set up fingerprint'}</ActionButton><ActionButton secondary disabled={auth.busy} onClick={() => go('pinVerify')}>Use PIN instead</ActionButton><ActionButton secondary disabled={auth.busy} onClick={() => void cancelVerification()}>Cancel</ActionButton></>;
      case 'blocked': return <><LockKeyhole className="feature-icon" size={48} strokeWidth={1.5} /><Note title="A PIN cannot override this">Resolve the device or session issue before trying again.</Note><Row title="Review the reason" detail="See the available security checks." onClick={() => go('restrictedReason')} /><Row title="Need help?" detail="Review recovery options." onClick={() => go('recovery')} /><Spacer /><ActionButton onClick={() => go('home')}>Return to safety</ActionButton></>;
      case 'success': return <><Check className="cobalt feature-icon" size={64} strokeWidth={1.5} /><Note title={nativeAuthentication ? 'Local identity verified' : 'Verification preview'}>{nativeAuthentication ? 'Open the selected app using this verification. You will need to verify again for another launch.' : 'GhostAuth simulates checking the session when conditions change.'}</Note><Spacer /><ActionButton disabled={auth.busy || launching} onClick={() => { if (nativeAuthentication) void launchApp(); else go('handoff'); }}>{nativeAuthentication ? launching ? 'Opening…' : `Open ${app.name}` : 'Continue to protected app'}</ActionButton><p className="small-copy muted">{nativeAuthentication ? 'Android checks verification again before opening the app.' : 'Opens the app-handoff preview.'}</p></>;
      case 'activity': return <><div className="section-label"><span>{nativeAuthentication ? 'Latest 100 checks' : 'Today'}</span><span>{String(state.events.length).padStart(2, '0')}</span></div>{state.events.map(e => <Row key={e.id} title={`${e.appLabel ?? appName(e.app)} · ${eventOutcome(e)}`} detail={nativeAuthentication ? `${eventTime(e)} · ${e.method}` : `${e.time} · ${e.decision === 'restricted' ? 'high session risk' : e.decision === 'allowed' ? 'low session risk' : 'additional verification'}`} onClick={() => { setEvent(e); setCurrentApp(e.app); go('event'); }} />)}{nativeAuthentication && !state.events.length && !history.loading && <Note title="No saved security history">{state.privacy.history ? 'Verification attempts will appear here.' : 'New recording is paused. Enable Security history in Privacy & data to record future checks.'}</Note>}<Spacer /><p className="small-copy muted">{nativeAuthentication ? 'Saved only on this device. The latest 100 verification attempts are retained; app content and credentials are never included.' : 'Only security events appear here. App content is never included.'}{!state.privacy.history && ' New event recording is paused.'}</p>{nativeAuthentication && <><ActionButton secondary disabled={history.loading || history.busy} onClick={() => void history.refresh()}>Refresh history</ActionButton><ActionButton secondary disabled={history.busy || (!state.events.length && !history.error)} onClick={() => setModal('clear-history')}>Clear history</ActionButton></>}</>;
      case 'event': return event && <><Row title="Decision" detail={nativeAuthentication && event.outcome && event.outcome !== 'verified' ? `${eventOutcome(event)} (${event.method}).` : event.decision === 'verified' ? nativeAuthentication ? `Identity verified with ${event.method}.` : `Allowed after ${event.method} verification.` : event.decision === 'allowed' ? 'Allowed · low session risk.' : event.decision === 'failed' ? 'Verification failed.' : 'Access restricted.'} /><Row title="Trigger" detail={event.reason} /><Row title="Session risk" detail={nativeAuthentication ? 'Not calculated in this build.' : event.decision === 'restricted' ? 'High.' : event.decision === 'allowed' ? 'Low.' : 'Medium before verification.'} /><Row title="Data retained" detail={nativeAuthentication ? 'App label and package, date and time, verification method and outcome.' : 'App name, time, reason and result.'} />{nativeAuthentication && <Row title="Package" detail={event.app} />}<Spacer />{event.decision === 'restricted' && <ActionButton secondary onClick={() => { dispatch({ type: 'restrict' }); go('blocked'); }}>Preview restricted session</ActionButton>}<ActionButton onClick={() => go('activity')}>Back to activity</ActionButton></>;
      case 'settings': return <><label className="app-row appearance-option"><input type="checkbox" aria-label="Dark mode" checked={appearance.dark} disabled={!appearance.ready || appearance.busy} onChange={e => void appearance.change(e.target.checked)} /><span className="row-copy"><span className="row-title">Dark mode</span><span className="row-detail">{appearance.busy ? 'Saving appearance…' : appearance.dark ? 'On · saved on this device' : 'Off · light appearance'}</span></span><span className={`checkbox${appearance.dark ? ' checked' : ''}`} aria-hidden="true">{appearance.dark && <Check size={18} strokeWidth={1.5} />}</span></label>{appearance.error && <p className="form-error" role="alert">{appearance.error}</p>}<Row title="PIN & fingerprint" detail="Manage identity verification" onClick={() => setModal('security')} /><Row title="Privacy & data" detail="Choose what GhostAuth can use" onClick={editPrivacy} /><Row title="Permissions" detail="Review protection access" onClick={() => go('permissionHealth')} /><Row title="Recovery" detail="Plan for lost access" onClick={() => go('recovery')} /><Row title="Reset saved preferences" detail="Restore app selection and data choices" onClick={() => { setResetError(''); setModal('reset-preferences'); }} /><Spacer /><p className="small-copy muted">GhostAuth for Android<br />Research prototype · version {nativeAuthentication ? '0.6.1' : '0.1'}</p><button className="text-link demo-session" onClick={() => setModal('new-session')}>Start a new demo session</button></>;
      case 'privacySettings': return <>{privacyItems.map(([key, label, detail]) => <AppRow key={key} title={label} detail={detail} checked={draftPrivacy[key]} onToggle={() => setDraftPrivacy(p => ({ ...p, [key]: !p[key] }))} />)}<Note title="Never collected">Messages, photos, passwords and fingerprint images are outside the behavior profile.</Note><Spacer /><ActionButton disabled={history.busy || !history.ready} onClick={() => void savePrivacy()}>Save preferences</ActionButton><ActionButton secondary onClick={() => setModal('reset-profile')}>Reset learned profile</ActionButton></>;
      case 'permissionHealth': return <>{(Object.keys(permissionLabels) as Permission[]).map(key => <Row key={key} title={permissionLabels[key]} detail={permissionDetail(key)} onClick={() => openPermission(key)} />)}<Note title={nativeAuthentication ? 'Protection status' : healthy ? 'Permissions are ready' : 'Until access is restored'}>{nativeAuthentication ? 'Protection requires enabling GhostAuth in Android Accessibility. Usage access and notifications are optional. If Android disconnects the service, selected apps may open normally until it is re-enabled.' : healthy ? 'This is a browser preview. No Android permissions have been changed.' : 'GhostAuth cannot reliably present verification over selected apps.'}</Note><Spacer />{nativeAuthentication ? <ActionButton disabled={device.loading} onClick={() => void device.refresh()}>Refresh Android status</ActionButton> : <ActionButton onClick={() => openPermission('service')}>Open Android settings</ActionButton>}<ActionButton secondary onClick={() => go('home')}>Back to GhostAuth</ActionButton></>;
      case 'recovery': return <><Row title={state.fingerprint ? 'Fingerprint available' : 'Set up fingerprint'} detail={state.fingerprint ? 'Try device biometric verification.' : 'Enable the preview or use your PIN.'} onClick={() => go('biometricVerify')} /><Row title="Forgot your PIN" detail="Review recovery availability." onClick={() => go('recoveryInfo')} /><Note title="High-risk sessions stay restricted">Recovery does not override failed device or session checks.</Note><p className="small-copy muted">Recovery enrollment is an implementation decision to validate before release.</p><Spacer /><ActionButton onClick={() => go('settings')}>Back to settings</ActionButton></>;
      case 'selectionEmpty': return <ActionButton onClick={() => go('appSelect')}>Back to selection</ActionButton>;
      case 'search': return <><label className="search-field"><Search size={18} /><input type="search" aria-label="Search installed apps" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search installed apps" /></label>{visibleApps.map(a => <ActionButton key={a.id} onClick={() => { setQuery(a.name); go('manageApps'); }}>{a.name}</ActionButton>)}<ActionButton secondary onClick={() => { setQuery(''); go('manageApps'); }}>All apps</ActionButton></>;
      case 'pinHelp': return <ActionButton onClick={() => go(returnRoute.startsWith('pin') ? returnRoute : 'pinVerify')}>Try again</ActionButton>;
      case 'permissionPreview': return nativeAuthentication && permission === 'service' ? <><Note title="Enable app protection">GhostAuth uses Android accessibility window package names to detect selected apps and cover them until verification. It does not read screen text, passwords, messages or photos. Only enable this if you want GhostAuth to monitor which app opens.</Note><Note title="Research prototype">App content may briefly appear before detection. Force-stopping GhostAuth, disabling Accessibility or an Android service interruption stops protection. Keep Android Settings available so you can disable the service.</Note><Row title="Service status" detail={permissionDetail('service')} />{!device.status?.protection.enabled ? <ActionButton disabled={device.opening || device.loading || !auth.status?.pinSet} onClick={() => void enableProtection()}>Enable protection</ActionButton> : <><ActionButton disabled={device.opening} onClick={() => void device.openSettings('service')}>Open Android Accessibility</ActionButton><ActionButton secondary disabled={device.opening} onClick={() => void device.configureProtection(state.selected, false)}>Disable protection</ActionButton></>}<ActionButton secondary disabled={device.loading} onClick={() => void device.refresh()}>Refresh Android status</ActionButton><ActionButton secondary onClick={() => go(returnRoute)}>Back to GhostAuth</ActionButton></> : nativeAuthentication ? <><Note title="Current status">{permissionDetail(permission)}</Note>{permission !== 'service' && <ActionButton disabled={device.opening} onClick={() => void device.openSettings(permission)}>{device.opening ? 'Opening Android settings…' : 'Open Android settings'}</ActionButton>}<ActionButton secondary disabled={device.loading} onClick={() => void device.refresh()}>Refresh Android status</ActionButton><ActionButton secondary onClick={() => go(returnRoute)}>Back to GhostAuth</ActionButton></> : <><ActionButton onClick={() => { dispatch({ type: 'permission', permission, enabled: true }); go(returnRoute); }}>Simulate access enabled</ActionButton>{state.permissions[permission] && <ActionButton secondary onClick={() => { dispatch({ type: 'permission', permission, enabled: false }); go(returnRoute); }}>Simulate access revoked</ActionButton>}<ActionButton secondary onClick={() => go(returnRoute)}>Cancel</ActionButton></>;
      case 'fingerprintSetup': return nativeAuthentication ? <><Note title={state.fingerprint ? 'Fingerprint enabled' : 'PIN required'}>{state.fingerprint ? 'Changing enrolled biometrics in Android may require enabling fingerprint again with your PIN.' : auth.status?.biometricAvailable ? 'Use your current PIN to approve fingerprint access for GhostAuth.' : 'No enrolled strong biometric is available. Set one up in Android Settings, or continue using your PIN.'}</Note><Spacer /><ActionButton disabled={!auth.status?.biometricAvailable} onClick={() => requestBiometricChange(true)}>Confirm PIN & enable</ActionButton>{state.fingerprint && <ActionButton secondary onClick={() => requestBiometricChange(false)}>Turn off fingerprint</ActionButton>}<ActionButton secondary onClick={() => go(returnRoute)}>Cancel</ActionButton></> : <><ActionButton onClick={() => { dispatch({ type: 'fingerprint', enabled: true }); go(returnRoute === 'biometricVerify' ? 'biometricVerify' : pinContext === 'settings' ? 'settings' : 'permissions'); }}>Simulate enabled</ActionButton><ActionButton secondary onClick={() => go(returnRoute)}>Cancel</ActionButton></>;
      case 'fingerprintCheck': return nativeAuthentication ? <><ActionButton disabled={auth.busy || !state.fingerprint} onClick={() => void verifyBiometric()}>{auth.busy ? 'Waiting for Android…' : 'Verify with fingerprint'}</ActionButton><ActionButton secondary disabled={auth.busy} onClick={() => go('pinVerify')}>Use PIN instead</ActionButton></> : <><ActionButton onClick={() => { if (!state.fingerprint) { setReturnRoute('biometricVerify'); go('fingerprintSetup'); return; } dispatch({ type: 'verify-fingerprint', app: currentApp, time: timeNow() }); go('success'); }}>Simulate a match</ActionButton><ActionButton secondary onClick={() => { setNotice('Fingerprint did not match. Try again or use your PIN.'); }}>No match · try again</ActionButton><ActionButton secondary onClick={() => go('pinVerify')}>Use PIN instead</ActionButton>{notice && <p role="status" className="small-copy">{notice}</p>}</>;
      case 'recoveryInfo': return <><ActionButton onClick={() => go('biometricVerify')}>Try fingerprint</ActionButton><ActionButton secondary onClick={() => go('recovery')}>Back to recovery</ActionButton></>;
      case 'restrictedReason': return <ActionButton onClick={() => go('blocked')}>Back to restriction</ActionButton>;
      case 'handoff': return nativeAuthentication ? <ActionButton disabled={auth.busy || launching} onClick={() => void launchApp()}>{launching ? 'Opening…' : `Open ${app.name}`}</ActionButton> : <ActionButton onClick={() => go('home')}>Return to GhostAuth</ActionButton>;
    }
  }
  if (nativeAuthentication && !auth.status) return <div className="phone-shell"><header className="app-header"><span className="wordmark">ghostauth<span>.</span></span></header><main className="screen-content"><p className="eyebrow">ANDROID SECURITY</p><h1>{auth.error ? 'Authentication unavailable.' : 'Preparing secure access.'}</h1><p className="subtitle" role={auth.error ? 'alert' : 'status'}>{auth.error || 'Checking your saved credentials on this device…'}</p>{auth.error && <ActionButton disabled={auth.busy} onClick={() => void auth.refresh()}>Try again</ActionButton>}</main></div>;
  if (nativeAuthentication && quickVerification && view === 'biometricVerify') return <div className="phone-shell verification-shell">
    <main className="fingerprint-gate" aria-label={`Verify to open ${app.name}`} aria-busy={auth.busy || launching}>
      <h1 className="visually-hidden">Verify with fingerprint</h1>
      <img className="gate-logo" src="/assets/ghostauth-logo.png" width="160" height="160" alt="GhostAuth" />
      <button type="button" className="fingerprint-reader" aria-label="Try fingerprint again" disabled={auth.busy || launching || !verificationReady} onClick={() => void verifyBiometric()}><Fingerprint size={64} strokeWidth={1.25} aria-hidden="true" /></button>
      {(auth.error || launchError) && <p className="gate-error" role="alert">{launchError || auth.error}</p>}
      <button type="button" className="gate-pin" disabled={launching} onClick={usePinInstead}>Use PIN instead</button>
    </main>
  </div>;
  return <>
    <a href="#main-content" className="skip-link" onClick={e => { e.preventDefault(); heading.current?.focus(); }}>Skip to content</a>
    <div className={`phone-shell${preview ? ' preview-shell' : ''}`}>
      {!preview && <><div className="status-bar" aria-hidden="true"><span>9:41</span><span>5G&nbsp; · &nbsp;100%</span></div><header className="app-header"><span className="wordmark">ghostauth<span>.</span></span><span className="brand-caption">Android<br />Personal security</span></header></>}
      <main ref={scrollContent} id="main-content" aria-busy={auth.busy || launching} className={`screen-content${preview ? ' preview-content' : ''}`}>
        {preview && <span className="preview-wordmark">ghostauth.</span>}
        <p className="eyebrow">{kicker}</p><h1 ref={heading} tabIndex={-1}>{title}</h1>{subtitle && <p className="subtitle">{subtitle}</p>}
        {auth.error && <p className="form-error" role="alert">{auth.error}</p>}
        {nativeAuthentication && ['activity', 'privacySettings'].includes(view) && history.error && <p className="form-error" role="alert">{history.error}</p>}
        {nativeAuthentication && view === 'activity' && history.loading && <p className="small-copy muted" role="status">Refreshing security history…</p>}
        {launchError && <p className="form-error" role="alert">{launchError}</p>}
        {nativeAuthentication && device.settingsError && <p className="form-error" role="alert">{device.settingsError}</p>}
        {nativeAuthentication && device.status?.protection.error && <p className="form-error" role="alert">{device.status.protection.error}</p>}
        {nativeAuthentication && device.loading && <p className="small-copy muted" role="status">Refreshing installed apps and Android permissions…</p>}
        {nativeAuthentication && device.error && <div className="storage-error" role="alert"><p>{device.error}</p><button type="button" className="text-link" disabled={device.loading} onClick={() => void device.refresh()}>Refresh Android status</button></div>}
        {storageError && <div className="storage-error" role="alert"><p>{storageError}</p><button type="button" className="text-link" onClick={() => persistChoices(state)}>Try saving again</button></div>}
        {pinScreen ? <form noValidate className="pin-form" onSubmit={e => { e.preventDefault(); verify(); }}>{content()}</form> : content()}
      </main>
      {!preview && (activeTab ? <nav className="bottom-nav" aria-label="Main navigation">{([['home', 'Apps', Grid2X2], ['activity', 'Activity', Activity], ['settings', 'Settings', Settings]] as const).map(([key, label, Icon]) => <a key={key} href={`#${key}`} aria-current={activeTab === key ? 'page' : undefined}><Icon size={20} strokeWidth={1.5} aria-hidden="true" /><span>{label}</span></a>)}</nav> : <footer className="app-footer"><span>GhostAuth</span><span>Android</span></footer>)}
    </div>
    {modal && <Modal title={modalTitles[modal]} onClose={() => setModal(null)}>
      {modal === 'security' ? <div className="dialog-actions"><ActionButton onClick={() => { setModal(null); setPinContext('settings'); setNewPin(''); go('pinSetup'); }}>Change PIN</ActionButton><ActionButton secondary onClick={() => { setModal(null); setPinContext('settings'); go('biometricSetup'); }}>Manage fingerprint</ActionButton></div> : <><p>{modalMessages[modal]}</p>{modal === 'clear-history' && history.error && <p className="form-error" role="alert">{history.error}</p>}{modal === 'reset-preferences' && resetError && <p className="form-error" role="alert">{resetError}</p>}<div className="dialog-actions"><ActionButton disabled={history.busy || device.opening} onClick={() => void confirmModal()}>{modal === 'clear-history' ? history.busy ? 'Clearing…' : 'Clear history' : modal === 'reset-preferences' ? 'Reset preferences' : 'Continue'}</ActionButton><ActionButton secondary onClick={() => setModal(null)}>Cancel</ActionButton></div></>}
    </Modal>}
  </>;
}
