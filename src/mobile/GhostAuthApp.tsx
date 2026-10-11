import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { Activity, ArrowRight, Check, ChevronRight, Delete, Fingerprint, Folder, Grid2X2, LockKeyhole, Plus, Search, Settings } from 'lucide-react';
import Modal from '../components/Modal';
import { APPS, canOpen, canVerify, filterApps, initialState, reducer, validPin, type AppId, type Permission, type Privacy, type SecurityEvent } from './state';
import { readRoute, screens, type Route } from './screens';
import { clearSavedPreferences, loadInitialState, savePreferences, type Preferences } from './preferences';
import { AndroidAuth, nativeAuthentication } from '../native/auth';
import { useNativeAuth } from '../native/useNativeAuth';
import './mobile.css';

function ActionButton({ children, onClick, secondary = false, submit = false, disabled = false }: { children: ReactNode; onClick?: () => void; secondary?: boolean; submit?: boolean; disabled?: boolean }) {
  return <button type={submit ? 'submit' : 'button'} disabled={disabled} className={`action-button${secondary ? ' secondary' : ''}`} onClick={onClick}><span>{children}</span><ArrowRight size={20} strokeWidth={1.5} aria-hidden="true" /></button>;
}
function Row({ title, detail, onClick }: { title: string; detail: string; onClick?: () => void }) {
  const content = <><span className="row-copy"><span className="row-title">{title}</span><span className="row-detail">{detail}</span></span>{onClick && <ChevronRight size={18} strokeWidth={1.5} aria-hidden="true" />}</>;
  return onClick ? <button type="button" className="list-row" onClick={onClick}>{content}</button> : <div className="list-row">{content}</div>;
}
function AppRow({ title, detail, checked, onToggle, onOpen }: { title: string; detail: string; checked: boolean; onToggle?: () => void; onOpen?: () => void }) {
  const content = <><Folder size={24} strokeWidth={1.5} aria-hidden="true" /><span className="row-copy"><span className="row-title">{title}</span><span className="row-detail">{detail}</span></span><span className={`checkbox${checked ? ' checked' : ''}`} aria-hidden="true">{checked && <Check size={18} strokeWidth={1.5} />}</span></>;
  return onToggle ? <label className="app-row"><input type="checkbox" checked={checked} onChange={onToggle} aria-label={title} />{content}</label> : <button type="button" className="app-row" onClick={onOpen} aria-label={`Open ${title} protection details`}>{content}</button>;
}
function Note({ title, children }: { title: string; children: ReactNode }) { return <div className="note"><p className="eyebrow">{title}</p><p className="small-copy">{children}</p></div>; }
function Spacer() { return <div className="spacer" />; }
const permissionLabels: Record<Permission, string> = { usage: 'App usage access', service: 'Protection service', notifications: 'Notifications' };
const privacyItems: [keyof Privacy, string, string][] = [['behavior', 'Behavior signals', 'Touch timing within GhostAuth'], ['movement', 'Movement signals', 'Device motion, when available'], ['history', 'Security history', 'Keep access decisions on this device']];
const protectedRoutes: Route[] = ['pinVerify', 'pinError', 'biometricVerify', 'fingerprintCheck', 'success', 'handoff'];
const timeNow = () => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date());
type ModalKind = 'reset-profile' | 'new-session' | 'security' | 'reset-preferences';
const modalTitles: Record<ModalKind, string> = {
  'reset-profile': 'Reset learned profile?', 'new-session': 'Start a new demo session?',
  security: 'PIN & fingerprint', 'reset-preferences': 'Reset saved preferences?',
};
const modalMessages: Record<Exclude<ModalKind, 'security'>, string> = {
  'reset-profile': 'Restart the learning preview. Your selected apps, PIN and privacy preferences will be kept.',
  'new-session': 'Clear the current simulated restriction and verification. Your PIN, app selection and preferences will stay the same.',
  'reset-preferences': 'Restore the default app selection and privacy choices on this device? Your PIN will be kept.',
};

export default function GhostAuthApp() {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const saved = loadInitialState();
    return nativeAuthentication ? { ...saved, nativeAuth: true, pin: '', events: [] } : saved;
  });
  const [route, setRoute] = useState<Route>(readRoute);
  const [currentApp, setCurrentApp] = useState<AppId>('mail');
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
  const [event, setEvent] = useState<SecurityEvent>(state.events[0] ?? initialState().events[0]);
  const [modal, setModal] = useState<ModalKind | null>(null);
  const [storageError, setStorageError] = useState('');
  const [resetError, setResetError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const scrollContent = useRef<HTMLElement>(null);
  const firstRender = useRef(true);
  const pinInput = useRef<HTMLInputElement>(null);
  const [authIntent, setAuthIntent] = useState<'verify' | 'changePin' | 'enableBiometric' | 'disableBiometric'>('verify');
  const auth = useNativeAuth(() => {
    dispatch({ type: 'lock' }); setPin(''); setNewPin(''); setModal(null); setAuthIntent('verify');
  }, route);
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
  const app = APPS.find(a => a.id === currentApp)!;
  const healthy = state.permissions.usage && state.permissions.service;
  let view = route;
  const identityCheck = protectedRoutes.includes(view) && authIntent === 'verify';
  if (identityCheck && state.restricted) view = 'blocked';
  else if (identityCheck && !healthy) view = 'permissionHealth';
  else if (identityCheck && !state.selected.includes(currentApp)) view = 'empty';
  else if (['success', 'handoff'].includes(view) && (!canOpen(state, currentApp) || (nativeAuthentication && !auth.status?.sessionValid))) view = 'pinVerify';
  else if (view === 'home' && !state.selected.length) view = 'empty';
  if (nativeAuthentication && auth.status) {
    if (!auth.status.pinSet && !['welcome', 'privacy', 'pinSetup', 'pinConfirm', 'privacySettings'].includes(view)) view = 'welcome';
    else if (auth.status.pinSet && view === 'pinSetup' && pinContext === 'setup') view = 'home';
  }
  const preview = screens[view][0] === 'PROTOTYPE PREVIEW' && !(nativeAuthentication && ['fingerprintSetup', 'fingerprintCheck', 'recoveryInfo'].includes(view));
  const activeTab = (['home', 'activity', 'settings'] as Route[]).includes(view) ? view : null;
  let [kicker, title, subtitle]: string[] = [...screens[view]];
  if (view === 'appDetail') { title = app.name; subtitle = app.description; }
  if (view === 'event') subtitle = `${APPS.find(a => a.id === event.app)!.name} · Today, ${event.time}`;
  if (view === 'permissionPreview') title = permissionLabels[permission];
  if (view === 'permissionHealth' && healthy) { title = 'Ready to\nprotect.'; subtitle = 'The required access is enabled in this preview.'; }
  if (view === 'pinVerify' && state.pin !== '123456') subtitle = 'Enter the six-digit PIN you created in this preview.';
  if (nativeAuthentication) {
    if (view === 'pinVerify' || view === 'pinError') {
      subtitle = authIntent === 'changePin' ? 'Enter your current PIN to save the new one.'
        : authIntent === 'enableBiometric' ? 'Enter your PIN, then confirm with Android biometrics.'
        : authIntent === 'disableBiometric' ? 'Enter your PIN to turn off fingerprint verification.' : 'Enter your saved six-digit PIN.';
    }
    if (view === 'fingerprintSetup') { kicker = 'ANDROID SECURITY'; subtitle = 'Confirm your PIN, then approve the system biometric prompt. Your fingerprint stays with Android.'; }
    if (view === 'fingerprintCheck') { kicker = 'ANDROID SECURITY'; subtitle = 'Android will verify an enrolled strong biometric. You can use your GhostAuth PIN instead.'; }
    if (view === 'recoveryInfo') subtitle = 'There is no PIN recovery bypass. Use an enabled fingerprint for identity checks. Clearing app data removes your PIN and all GhostAuth settings.';
    if (view === 'home') subtitle = 'Identity checks use Android authentication. Protection of other apps remains a preview.';
    if (view === 'learning') { title = 'Setup\ncomplete.'; subtitle = 'Your PIN is saved securely on this device. App protection and behavior learning remain previews.'; }
    if (view === 'success') subtitle = 'Verified on this device for up to 30 seconds, while GhostAuth stays in the foreground.';
    if (view === 'handoff') subtitle = 'Native verification is complete. Launching and protecting other apps is still a preview.';
  }
  useEffect(() => { document.title = `GhostAuth · ${title.replace(/\n/g, ' ')}`; }, [title]);
  function editApps(target: Route = 'manageApps') { setDraftApps([...state.selected]); setQuery(''); go(target); }
  function editPrivacy() { setDraftPrivacy({ ...state.privacy }); setPrivacyReturn(route); go('privacySettings'); }
  function openPermission(key: Permission) { setPermission(key); setReturnRoute(route); go('permissionPreview'); }
  function openApp(id: AppId) { setCurrentApp(id); go('appDetail'); }
  function persistChoices(preferences: Preferences) {
    setStorageError(savePreferences(preferences) ? '' : 'Couldn’t save on this device. Your choices apply to this session only.');
  }
  function savePrivacy() {
    persistChoices({ selected: state.selected, privacy: draftPrivacy });
    dispatch({ type: 'privacy', value: draftPrivacy }); go(privacyReturn);
  }
  function confirmModal() {
    if (modal === 'reset-preferences') {
      if (!clearSavedPreferences()) { setResetError('Couldn’t reset saved preferences. Please try again.'); return; }
      const defaults = initialState();
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
    const result = await auth.run(() => AndroidAuth.verifyBiometric());
    if (result?.verified === true && result.sessionValid) {
      dispatch({ type: 'native-verified', app: currentApp, method: 'fingerprint', time: timeNow() }); go('success');
    }
  }
  async function verify() {
    if (auth.busy) return;
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
    if (!canVerify(state, currentApp)) { go(state.restricted ? 'blocked' : !healthy ? 'permissionHealth' : 'empty'); return; }
    if (nativeAuthentication) {
      const result = await auth.run(() => AndroidAuth.verifyPin({ pin }));
      setPin('');
      if (result?.verified === true && result.sessionValid) {
        dispatch({ type: 'native-verified', app: currentApp, method: 'PIN', time: timeNow() }); go('success');
      } else if (result) setError(result.lockedForSeconds ? `Too many attempts. Try again in ${result.lockedForSeconds} seconds.` : 'That PIN did not match. Try again.');
      return;
    }
    dispatch({ type: 'verify', app: currentApp, pin, time: timeNow() });
    if (pin === state.pin) go('success'); else { setPin(''); setError('That PIN did not match. Try again.'); go('pinError'); }
  }
  const toggleApp = (id: AppId) => setDraftApps(selected => selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  function saveApps() { if (view === 'appSelect' && !draftApps.length) { setReturnRoute('appSelect'); go('selectionEmpty'); return; } persistChoices({ selected: draftApps, privacy: state.privacy }); dispatch({ type: 'select', apps: draftApps }); go(view === 'appSelect' ? 'learning' : draftApps.length ? 'home' : 'empty'); }
  const pinScreen = ['pinSetup', 'pinConfirm', 'pinVerify', 'pinError'].includes(view);
  function pinEntry() { return <>
    <div className="pin-entry"><input ref={pinInput} aria-label="Six-digit PIN" aria-describedby={error ? 'form-error' : undefined} aria-invalid={!!error} className="pin-input" type="password" autoComplete="off" inputMode="none" pattern="[0-9]{6}" maxLength={6} value={pin} onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }} /><div className="pin-cells" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <span className={`pin-cell${pin.length === i ? ' current' : ''}`} key={i}>{i < pin.length ? '•' : ''}</span>)}</div></div>
    {view === 'pinError' && <Note title="PIN did not match">Re-enter your six-digit PIN to try again.</Note>}
    <div className="keypad" aria-label="PIN keypad">{['1','2','3','4','5','6','7','8','9','','0','delete'].map((digit, i) => digit ? <button type="button" key={digit} aria-label={digit === 'delete' ? 'Delete digit' : `Digit ${digit}`} onClick={() => { setPin(p => digit === 'delete' ? p.slice(0, -1) : (p + digit).slice(0, 6)); setError(''); }}>{digit === 'delete' ? <Delete size={28} strokeWidth={1.5} aria-hidden="true" /> : digit}</button> : <span key={i} />)}</div>
    {error && <p className="form-error" id="form-error" role="alert">{error}</p>}<Spacer />
    {view === 'pinSetup' && <p className="small-copy muted">{nativeAuthentication ? 'Choose a PIN you can remember. Android securely stores a salted verifier, never your PIN.' : 'Avoid birthdays and repeated digits. Use a demo PIN.'}</p>}
    <ActionButton submit disabled={auth.busy}>{auth.busy ? 'Verifying…' : view === 'pinSetup' ? 'Continue' : view === 'pinConfirm' ? 'Confirm PIN' : view === 'pinError' ? 'Try again' : 'Verify PIN'}</ActionButton>
    {view === 'pinConfirm' && <ActionButton secondary onClick={() => { setNewPin(''); go('pinSetup'); }}>Start again</ActionButton>}
    {view === 'pinVerify' && <ActionButton secondary disabled={auth.busy} onClick={() => { setAuthIntent('verify'); setNewPin(''); go(pinContext === 'settings' ? 'settings' : 'home'); }}>Cancel</ActionButton>}
    {nativeAuthentication && authIntent === 'verify' && ['pinVerify', 'pinError'].includes(view) && state.fingerprint && <ActionButton secondary disabled={auth.busy} onClick={() => go('biometricVerify')}>Use fingerprint instead</ActionButton>}
  </>; }

  function content(): ReactNode {
    if (pinScreen) return pinEntry();
    switch (view) {
      case 'welcome': return <><img className="brand-art" src="/assets/ghostauth-logo.png" width="190" height="190" alt="GhostAuth fingerprint mark with a cobalt accent" /><Spacer /><ActionButton onClick={() => { setPinContext('setup'); go(nativeAuthentication && auth.status?.pinSet ? 'home' : 'privacy'); }}>{nativeAuthentication && auth.status?.pinSet ? 'Open GhostAuth' : 'Set up GhostAuth'}</ActionButton><p className="small-copy muted">{nativeAuthentication && auth.status?.pinSet ? 'Your saved PIN is ready for identity checks.' : 'A few steps. Always in your control.'}</p></>;
      case 'privacy': return <><Row title="Your apps, your choice" detail="Only apps you select are protected." /><Row title="No message or photo collection" detail="App content stays outside GhostAuth." /><Row title="Understand every signal" detail="Review and manage behavioral data." onClick={editPrivacy} /><Spacer /><ActionButton onClick={() => go('pinSetup')}>Continue</ActionButton><ActionButton secondary onClick={() => go('welcome')}>Back</ActionButton></>;
      case 'biometricSetup': return <><Fingerprint className="cobalt feature-icon" size={72} strokeWidth={1.5} /><Note title="Handled by Android">GhostAuth does not receive or store your fingerprint image.{nativeAuthentication && !auth.status?.biometricAvailable && ' Enroll a fingerprint or strong biometric in Android Settings to use it here.'}</Note><Spacer /><ActionButton onClick={() => { setReturnRoute('biometricSetup'); go('fingerprintSetup'); }}>{state.fingerprint ? 'Manage fingerprint' : 'Enable fingerprint'}</ActionButton><ActionButton secondary onClick={() => go(pinContext === 'settings' ? 'settings' : 'permissions')}>{pinContext === 'settings' ? 'Back to settings' : 'Set up later'}</ActionButton></>;
      case 'permissions': return <><Row title="App usage access" detail="Detect which app is opened." onClick={() => openPermission('usage')} /><Row title="Protection service" detail="Show verification when required." onClick={() => openPermission('service')} /><Row title="Notifications" detail="Know when protection needs attention." onClick={() => openPermission('notifications')} /><Note title="You remain in control">Each permission opens an Android-settings preview. You can revoke access at any time.</Note><Spacer /><ActionButton onClick={() => editApps('appSelect')}>Continue to app selection</ActionButton></>;
      case 'appSelect':
      case 'manageApps': return <>{view === 'appSelect' ? <div className="section-label"><span>Selected apps</span><span>{String(draftApps.length).padStart(2, '0')}</span></div> : <label className="search-field"><Search size={18} strokeWidth={1.5} aria-hidden="true" /><input aria-label="Search installed apps" placeholder="Search installed apps" type="search" value={query} onChange={e => setQuery(e.target.value)} /></label>}{filterApps(view === 'manageApps' ? query : '').map(a => <AppRow key={a.id} title={a.name} detail={a.description} checked={draftApps.includes(a.id)} onToggle={() => toggleApp(a.id)} />)}{!filterApps(query).length && view === 'manageApps' && <div className="no-results"><p>No apps match “{query}”.</p><button className="text-link" onClick={() => setQuery('')}>Clear search</button></div>}<Spacer /><ActionButton onClick={saveApps}>{view === 'appSelect' ? 'Protect selected apps' : 'Save selection'}</ActionButton></>;
      case 'learning': return <><Note title={healthy ? 'Protection is already active' : 'Permissions need attention'}>{healthy ? 'Verification stays conservative while there is not enough data to recognize your normal patterns.' : 'Restore the required permissions to complete protection.'}</Note><Row title="Touch & interaction patterns" detail="Collected with your consent." /><Row title="Movement signals" detail="Used only where Android permits." /><Spacer /><ActionButton onClick={() => go('home')}>Open GhostAuth</ActionButton><ActionButton secondary onClick={editPrivacy}>Review data choices</ActionButton></>;
      case 'home': return <><div className="protection-status"><Check className="cobalt" size={18} strokeWidth={1.5} /><span>{healthy ? 'Protection is active' : 'Protection needs attention'}</span>{!healthy && <button className="text-link" onClick={() => go('permissionHealth')}>Fix</button>}</div><div className="section-label"><span>Selected apps</span></div>{APPS.filter(a => state.selected.includes(a.id)).map(a => <AppRow key={a.id} title={a.name} detail={a.description} checked onOpen={() => openApp(a.id)} />)}<Spacer /><ActionButton onClick={() => editApps()}>Choose apps</ActionButton></>;
      case 'empty': return <><Plus className="cobalt feature-icon" size={48} strokeWidth={1.5} /><Note title="No apps selected">Protection will begin after you select an app and complete setup.</Note><Spacer /><ActionButton onClick={() => editApps()}>Choose apps</ActionButton><ActionButton secondary onClick={() => go('permissionHealth')}>Check permissions</ActionButton></>;
      case 'appDetail': return <><Row title="Protection" detail={`${state.selected.includes(currentApp) ? 'On' : 'Off'} · adaptive verification`} onClick={() => editApps()} /><Row title="Current session" detail={state.restricted ? 'Access restricted' : canOpen(state, currentApp) ? 'Identity verified' : 'Additional verification required'} onClick={() => go(state.restricted ? 'blocked' : 'risk')} /><Row title="Recent activity" detail="Review access attempts" onClick={() => go('activity')} /><Note title="How access works">Low-risk sessions continue. Higher-risk sessions need verification or remain restricted.</Note><Spacer /><ActionButton onClick={() => go('pinVerify')}>Preview identity check</ActionButton><ActionButton secondary onClick={() => go('home')}>Back to apps</ActionButton></>;
      case 'risk': return <><Row title="Network changed" detail="You recently joined another network." /><Row title="Behavior profile" detail="Still learning your normal interactions." /><Row title="Device checks" detail="Available checks passed." /><Note title="Additional verification">Confirm your identity before continuing to your protected app.</Note><Spacer /><ActionButton onClick={() => go('pinVerify')}>Verify identity</ActionButton><ActionButton secondary onClick={() => go('appDetail')}>Back</ActionButton></>;
      case 'biometricVerify': return <><Fingerprint className="cobalt feature-icon" size={72} strokeWidth={1.5} /><Note title="Android verification">{state.fingerprint ? 'Use a fingerprint registered on this device.' : nativeAuthentication ? 'Fingerprint is unavailable or has not been enabled. Use your PIN, or enable fingerprint in Settings.' : 'Fingerprint is not enabled in this preview. Set it up or use your PIN.'}</Note><Spacer /><ActionButton disabled={auth.busy} onClick={() => { if (state.fingerprint) { if (nativeAuthentication) void verifyBiometric(); else go('fingerprintCheck'); } else { setReturnRoute('biometricVerify'); go('fingerprintSetup'); } }}>{auth.busy ? 'Waiting for Android…' : state.fingerprint ? 'Verify with fingerprint' : 'Set up fingerprint'}</ActionButton><ActionButton secondary disabled={auth.busy} onClick={() => go('pinVerify')}>Use PIN instead</ActionButton><ActionButton secondary disabled={auth.busy} onClick={() => go('home')}>Cancel</ActionButton></>;
      case 'blocked': return <><LockKeyhole className="feature-icon" size={48} strokeWidth={1.5} /><Note title="A PIN cannot override this">Resolve the device or session issue before trying again.</Note><Row title="Review the reason" detail="See the available security checks." onClick={() => go('restrictedReason')} /><Row title="Need help?" detail="Review recovery options." onClick={() => go('recovery')} /><Spacer /><ActionButton onClick={() => go('home')}>Return to safety</ActionButton></>;
      case 'success': return <><Check className="cobalt feature-icon" size={64} strokeWidth={1.5} /><Note title="Protection continues">GhostAuth checks the session again when relevant conditions change.</Note><Spacer /><ActionButton disabled={auth.busy} onClick={() => { if (nativeAuthentication) void auth.run(() => AndroidAuth.getStatus()).then(result => { if (result?.sessionValid) go('handoff'); }); else go('handoff'); }}>Continue to protected app</ActionButton><p className="small-copy muted">Opens the app-handoff preview.</p></>;
      case 'activity': return <><div className="section-label"><span>Today</span><span>{String(state.events.length).padStart(2, '0')}</span></div>{state.events.map(e => <Row key={e.id} title={`${APPS.find(a => a.id === e.app)!.name} · ${e.decision === 'verified' ? `verified with ${e.method}` : e.decision === 'allowed' ? 'access allowed' : e.decision === 'failed' ? 'verification failed' : 'access restricted'}`} detail={`${e.time} · ${e.decision === 'restricted' ? 'high session risk' : e.decision === 'allowed' ? 'low session risk' : 'additional verification'}`} onClick={() => { setEvent(e); setCurrentApp(e.app); go('event'); }} />)}<Spacer /><p className="small-copy muted">Only security events appear here. App content is never included.{!state.privacy.history && ' New event recording is paused.'}</p></>;
      case 'event': return <><Row title="Decision" detail={event.decision === 'verified' ? `Allowed after ${event.method} verification.` : event.decision === 'allowed' ? 'Allowed · low session risk.' : event.decision === 'failed' ? 'Verification failed.' : 'Access restricted.'} /><Row title="Trigger" detail={event.reason} /><Row title="Session risk" detail={event.decision === 'restricted' ? 'High.' : event.decision === 'allowed' ? 'Low.' : 'Medium before verification.'} /><Row title="Data retained" detail="App name, time, reason and result." /><Spacer />{event.decision === 'restricted' && <ActionButton secondary onClick={() => { dispatch({ type: 'restrict' }); go('blocked'); }}>Preview restricted session</ActionButton>}<ActionButton onClick={() => go('activity')}>Back to activity</ActionButton></>;
      case 'settings': return <><Row title="PIN & fingerprint" detail="Manage identity verification" onClick={() => setModal('security')} /><Row title="Privacy & data" detail="Choose what GhostAuth can use" onClick={editPrivacy} /><Row title="Permissions" detail="Review protection access" onClick={() => go('permissionHealth')} /><Row title="Recovery" detail="Plan for lost access" onClick={() => go('recovery')} /><Row title="Reset saved preferences" detail="Restore app selection and data choices" onClick={() => { setResetError(''); setModal('reset-preferences'); }} /><Spacer /><p className="small-copy muted">GhostAuth for Android<br />Research prototype · version {nativeAuthentication ? '0.2' : '0.1'}</p><button className="text-link demo-session" onClick={() => setModal('new-session')}>Start a new demo session</button></>;
      case 'privacySettings': return <>{privacyItems.map(([key, label, detail]) => <AppRow key={key} title={label} detail={detail} checked={draftPrivacy[key]} onToggle={() => setDraftPrivacy(p => ({ ...p, [key]: !p[key] }))} />)}<Note title="Never collected">Messages, photos, passwords and fingerprint images are outside the behavior profile.</Note><Spacer /><ActionButton onClick={savePrivacy}>Save preferences</ActionButton><ActionButton secondary onClick={() => setModal('reset-profile')}>Reset learned profile</ActionButton></>;
      case 'permissionHealth': return <>{(Object.keys(permissionLabels) as Permission[]).map(key => <Row key={key} title={permissionLabels[key]} detail={state.permissions[key] ? 'Enabled · preview' : 'Action required · open Android settings'} onClick={() => openPermission(key)} />)}<Note title={healthy ? 'Permissions are ready' : 'Until access is restored'}>{healthy ? 'This is a browser preview. No Android permissions have been changed.' : 'GhostAuth cannot reliably present verification over selected apps.'}</Note><Spacer /><ActionButton onClick={() => openPermission('service')}>Open Android settings</ActionButton><ActionButton secondary onClick={() => go('home')}>Back to GhostAuth</ActionButton></>;
      case 'recovery': return <><Row title={state.fingerprint ? 'Fingerprint available' : 'Set up fingerprint'} detail={state.fingerprint ? 'Try device biometric verification.' : 'Enable the preview or use your PIN.'} onClick={() => go('biometricVerify')} /><Row title="Forgot your PIN" detail="Review recovery availability." onClick={() => go('recoveryInfo')} /><Note title="High-risk sessions stay restricted">Recovery does not override failed device or session checks.</Note><p className="small-copy muted">Recovery enrollment is an implementation decision to validate before release.</p><Spacer /><ActionButton onClick={() => go('settings')}>Back to settings</ActionButton></>;
      case 'selectionEmpty': return <ActionButton onClick={() => go('appSelect')}>Back to selection</ActionButton>;
      case 'search': return <><label className="search-field"><Search size={18} /><input type="search" aria-label="Search installed apps" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search installed apps" /></label>{filterApps(query).map(a => <ActionButton key={a.id} onClick={() => { setQuery(a.name); go('manageApps'); }}>{a.name}</ActionButton>)}<ActionButton secondary onClick={() => { setQuery(''); go('manageApps'); }}>All apps</ActionButton></>;
      case 'pinHelp': return <ActionButton onClick={() => go(returnRoute.startsWith('pin') ? returnRoute : 'pinVerify')}>Try again</ActionButton>;
      case 'permissionPreview': return <><ActionButton onClick={() => { dispatch({ type: 'permission', permission, enabled: true }); go(returnRoute); }}>Simulate access enabled</ActionButton>{state.permissions[permission] && <ActionButton secondary onClick={() => { dispatch({ type: 'permission', permission, enabled: false }); go(returnRoute); }}>Simulate access revoked</ActionButton>}<ActionButton secondary onClick={() => go(returnRoute)}>Cancel</ActionButton></>;
      case 'fingerprintSetup': return nativeAuthentication ? <><Note title={state.fingerprint ? 'Fingerprint enabled' : 'PIN required'}>{state.fingerprint ? 'Changing enrolled biometrics in Android may require enabling fingerprint again with your PIN.' : auth.status?.biometricAvailable ? 'Use your current PIN to approve fingerprint access for GhostAuth.' : 'No enrolled strong biometric is available. Set one up in Android Settings, or continue using your PIN.'}</Note><Spacer /><ActionButton disabled={!auth.status?.biometricAvailable} onClick={() => requestBiometricChange(true)}>Confirm PIN & enable</ActionButton>{state.fingerprint && <ActionButton secondary onClick={() => requestBiometricChange(false)}>Turn off fingerprint</ActionButton>}<ActionButton secondary onClick={() => go(returnRoute)}>Cancel</ActionButton></> : <><ActionButton onClick={() => { dispatch({ type: 'fingerprint', enabled: true }); go(returnRoute === 'biometricVerify' ? 'biometricVerify' : pinContext === 'settings' ? 'settings' : 'permissions'); }}>Simulate enabled</ActionButton><ActionButton secondary onClick={() => go(returnRoute)}>Cancel</ActionButton></>;
      case 'fingerprintCheck': return nativeAuthentication ? <><ActionButton disabled={auth.busy || !state.fingerprint} onClick={() => void verifyBiometric()}>{auth.busy ? 'Waiting for Android…' : 'Verify with fingerprint'}</ActionButton><ActionButton secondary disabled={auth.busy} onClick={() => go('pinVerify')}>Use PIN instead</ActionButton></> : <><ActionButton onClick={() => { if (!state.fingerprint) { setReturnRoute('biometricVerify'); go('fingerprintSetup'); return; } dispatch({ type: 'verify-fingerprint', app: currentApp, time: timeNow() }); go('success'); }}>Simulate a match</ActionButton><ActionButton secondary onClick={() => { setNotice('Fingerprint did not match. Try again or use your PIN.'); }}>No match · try again</ActionButton><ActionButton secondary onClick={() => go('pinVerify')}>Use PIN instead</ActionButton>{notice && <p role="status" className="small-copy">{notice}</p>}</>;
      case 'recoveryInfo': return <><ActionButton onClick={() => go('biometricVerify')}>Try fingerprint</ActionButton><ActionButton secondary onClick={() => go('recovery')}>Back to recovery</ActionButton></>;
      case 'restrictedReason': return <ActionButton onClick={() => go('blocked')}>Back to restriction</ActionButton>;
      case 'handoff': return <ActionButton onClick={() => go('home')}>Return to GhostAuth</ActionButton>;
    }
  }
  if (nativeAuthentication && !auth.status) return <div className="phone-shell"><header className="app-header"><span className="wordmark">ghostauth<span>.</span></span></header><main className="screen-content"><p className="eyebrow">ANDROID SECURITY</p><h1>{auth.error ? 'Authentication unavailable.' : 'Preparing secure access.'}</h1><p className="subtitle" role={auth.error ? 'alert' : 'status'}>{auth.error || 'Checking your saved credentials on this device…'}</p>{auth.error && <ActionButton disabled={auth.busy} onClick={() => void auth.refresh()}>Try again</ActionButton>}</main></div>;
  return <>
    <a href="#main-content" className="skip-link" onClick={e => { e.preventDefault(); heading.current?.focus(); }}>Skip to content</a>
    <div className={`phone-shell${preview ? ' preview-shell' : ''}`}>
      {!preview && <><div className="status-bar" aria-hidden="true"><span>9:41</span><span>5G&nbsp; · &nbsp;100%</span></div><header className="app-header"><span className="wordmark">ghostauth<span>.</span></span><span className="brand-caption">Android<br />Personal security</span></header></>}
      <main ref={scrollContent} id="main-content" aria-busy={auth.busy} className={`screen-content${preview ? ' preview-content' : ''}`}>
        {preview && <span className="preview-wordmark">ghostauth.</span>}
        <p className="eyebrow">{kicker}</p><h1 ref={heading} tabIndex={-1}>{title}</h1>{subtitle && <p className="subtitle">{subtitle}</p>}
        {auth.error && <p className="form-error" role="alert">{auth.error}</p>}
        {storageError && <div className="storage-error" role="alert"><p>{storageError}</p><button type="button" className="text-link" onClick={() => persistChoices(state)}>Try saving again</button></div>}
        {pinScreen ? <form noValidate className="pin-form" onSubmit={e => { e.preventDefault(); verify(); }}>{content()}</form> : content()}
      </main>
      {!preview && (activeTab ? <nav className="bottom-nav" aria-label="Main navigation">{([['home', 'Apps', Grid2X2], ['activity', 'Activity', Activity], ['settings', 'Settings', Settings]] as const).map(([key, label, Icon]) => <a key={key} href={`#${key}`} aria-current={activeTab === key ? 'page' : undefined}><Icon size={20} strokeWidth={1.5} aria-hidden="true" /><span>{label}</span></a>)}</nav> : <footer className="app-footer"><span>GhostAuth</span><span>Android</span></footer>)}
    </div>
    {modal && <Modal title={modalTitles[modal]} onClose={() => setModal(null)}>
      {modal === 'security' ? <div className="dialog-actions"><ActionButton onClick={() => { setModal(null); setPinContext('settings'); setNewPin(''); go('pinSetup'); }}>Change PIN</ActionButton><ActionButton secondary onClick={() => { setModal(null); setPinContext('settings'); go('biometricSetup'); }}>Manage fingerprint</ActionButton></div> : <><p>{modalMessages[modal]}</p>{modal === 'reset-preferences' && resetError && <p className="form-error" role="alert">{resetError}</p>}<div className="dialog-actions"><ActionButton onClick={confirmModal}>{modal === 'reset-preferences' ? 'Reset preferences' : 'Continue'}</ActionButton><ActionButton secondary onClick={() => setModal(null)}>Cancel</ActionButton></div></>}
    </Modal>}
  </>;
}
