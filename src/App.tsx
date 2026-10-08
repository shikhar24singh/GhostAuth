import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Activity, ArrowUpRight, BookOpen, CalendarDays, Check, CheckCheck, CheckCircle2,
  ChevronRight, CircleHelp, Cloud, FileClock, FileText, Fingerprint, FlaskConical,
  GraduationCap, LayoutDashboard, Layers3, LockKeyhole, LogOut, MapPin, Menu,
  Monitor, PanelTop, Radio, RotateCcw, Search, Shield, ShieldAlert, ShieldCheck,
  ShieldX, Smartphone, Users, X,
} from 'lucide-react';
import AuthScreen from './components/AuthScreen';
import Modal from './components/Modal';
import { RESOURCES, SCENARIOS, USERS } from './lib/demo-data';
import { createDemoState, getResourceDecision, requestResource, revokeSession, simulateScenario, switchRole, verifyMfa } from './lib/demo-state';
import type { AuditEntry, Decision, DemoSession, DemoState, ProtectedResource, Role, Scenario } from './lib/types';

type Page = 'overview' | 'resources' | 'sessions' | 'audit';
type ActiveModal = { kind: 'help' } | { kind: 'mfa'; resourceId?: string } | { kind: 'revoke'; session: DemoSession } | { kind: 'resource'; resource: ProtectedResource } | null;
const pages: Record<Page, { label: string; title: string; description: string; icon: typeof Shield }> = {
  overview: { label: 'Overview', title: 'Security overview', description: 'A clear view of your identity, sessions, and access.', icon: LayoutDashboard },
  resources: { label: 'Protected resources', title: 'Protected resources', description: 'The right access. Only when your session is verified.', icon: Layers3 },
  sessions: { label: 'Active sessions', title: 'Your sessions', description: 'See where you are signed in and stay in control.', icon: Monitor },
  audit: { label: 'Audit trail', title: 'Audit trail', description: 'Every decision has a reason. Follow it here.', icon: FileClock },
};
const decisionLabels: Record<Decision, string> = { allow: 'Access allowed', challenge: 'Verification needed', deny: 'Access blocked' };
const decisionTone: Record<Decision, string> = { allow: '', challenge: 'amber', deny: 'red' };
const readPage = (): Page => { const hash = window.location.hash.slice(1); return Object.hasOwn(pages, hash) ? hash as Page : 'overview'; };
const formatTime = (time: string) => new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).format(new Date(time));

function Badge({ children, tone = '' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
function ResourceIcon({ resource, size = 20 }: { resource: ProtectedResource; size?: number }) {
  const Icon = { book: BookOpen, chart: GraduationCap, cloud: Cloud, shield: Shield }[resource.icon];
  const tone = { book: '', chart: 'gold', cloud: 'green', shield: 'violet' }[resource.icon];
  return <div className={`resource-symbol ${tone}`}><Icon size={size} strokeWidth={1.6} /></div>;
}
function DeviceIcon({ session }: { session: DemoSession }) {
  return <div className="device-icon">{session.platform === 'iOS' ? <Smartphone size={18} strokeWidth={1.5} /> : <Monitor size={18} strokeWidth={1.5} />}</div>;
}
function SessionBadge({ session }: { session: DemoSession }) {
  const labels = { active: 'Active', challenged: 'Verify', blocked: 'Blocked', revoked: 'Revoked' };
  const tones = { active: '', challenged: 'amber', blocked: 'red', revoked: 'neutral' };
  return <Badge tone={tones[session.status]}>{labels[session.status]}</Badge>;
}
function Metric({ label, icon: Icon, value, unit, children }: { label: string; icon: typeof Shield; value: number | string; unit?: string; children: ReactNode }) {
  return <div className="metric"><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={16} strokeWidth={1.6} /></span></div><div className="metric-value">{value}{unit && <small>{unit}</small>}</div><div className="metric-bottom">{children}</div></div>;
}

function RiskPanel({ state }: { state: DemoState }) {
  const tone = state.riskScore >= 70 ? 'red' : state.riskScore >= 35 ? 'amber' : '';
  const icons = [Fingerprint, Monitor, MapPin, Activity];
  const circumference = 2 * Math.PI * 64;
  return <section className="panel risk-panel" aria-labelledby="risk-title">
    <div className="panel-header"><h2 id="risk-title">Session risk</h2><span className="panel-subtitle">Simulated</span></div>
    <div className={`risk-chart ${tone}`} role="img" aria-label={`Risk score ${state.riskScore} out of 100. Lower is better.`}>
      <svg viewBox="0 0 170 170" aria-hidden="true"><circle className="risk-track" cx="85" cy="85" r="64" /><circle className="risk-value" cx="85" cy="85" r="64" strokeDasharray={`${state.riskScore / 100 * circumference} ${circumference}`} /></svg>
      <div className="risk-chart-label"><strong>{state.riskScore}<span>OUT OF 100</span></strong></div>
    </div>
    <p className={`risk-caption ${tone}`}>{tone === 'red' ? 'High risk · Access restricted' : tone === 'amber' ? 'Elevated risk · Verify identity' : 'Low risk · Within trusted range'}</p>
    <div className="risk-factors">{state.riskFactors.map((factor, index) => { const Icon = icons[index]; return <div className="risk-factor" key={factor.id} title={factor.detail}><span><Icon size={13} />{factor.label}</span><strong className={factor.level === 'high' ? 'red' : factor.level === 'medium' ? 'amber' : ''}>{factor.value}</strong></div>; })}</div>
  </section>;
}
function ActivityList({ entries }: { entries: AuditEntry[] }) {
  return <ol className="activity-list">{entries.map(event => <li className="activity-item" key={event.id}>
    <span className={`activity-icon ${event.severity === 'critical' ? 'red' : event.severity === 'warning' ? 'amber' : ''}`}>{event.decision === 'deny' ? <ShieldX size={13} /> : event.decision === 'challenge' ? <Fingerprint size={13} /> : <Check size={13} />}</span>
    <div className="activity-copy"><strong>{event.action}</strong><p>{event.actor}</p><time dateTime={event.timestamp}>{formatTime(event.timestamp)} IST</time></div>
  </li>)}</ol>;
}

function Overview({ state, navigate, openResource }: { state: DemoState; navigate: (page: Page) => void; openResource: (resource: ProtectedResource) => void }) {
  const currentRevoked = state.sessions.some(session => session.isCurrent && session.status === 'revoked');
  const activeSessions = state.sessions.filter(session => session.status === 'active').length;
  const allowed = RESOURCES.filter(resource => getResourceDecision(state, resource).decision === 'allow').length;
  return <>
    <div className="metrics">
      <Metric label="Session risk score" icon={ShieldCheck} value={state.riskScore} unit="/ 100"><span className={state.riskScore < 35 ? 'green' : 'red'}>{state.riskScore < 35 ? 'Low risk' : state.riskScore < 70 ? 'Elevated risk' : 'High risk'}</span><span>· Lower is better</span></Metric>
      <Metric label="Active sessions" icon={Monitor} value={activeSessions}><span>{activeSessions === 1 ? '1 connected device' : `${activeSessions} connected devices`}</span></Metric>
      <Metric label="Available resources" icon={Layers3} value={allowed} unit={`/ ${RESOURCES.length}`}><LockKeyhole size={11} /><span>Based on role and risk</span></Metric>
      <Metric label="Recorded events" icon={FileClock} value={state.auditLogs.length}><CheckCheck size={12} className="green" /><span>In this demo workspace</span></Metric>
    </div>
    <div className="overview-grid">
      <div className="stack">
        <section className={`trust-panel ${decisionTone[state.decision]}`} aria-labelledby="trust-title">
          <div className="trust-content">
            <div className="eyebrow"><Radio size={13} /> ADAPTIVE TRUST ENGINE <span style={{ marginLeft: 'auto', opacity: .65 }}>DEMO</span></div>
            <h2 className="trust-title" id="trust-title">{state.decision === 'allow' ? <>Every session.<br /><span>Continuously verified.</span></> : state.decision === 'challenge' ? <>A new device.<br /><span>One more check.</span></> : <>Access paused.<br /><span>{currentRevoked ? 'Session revoked.' : 'Risk detected.'}</span></>}</h2>
            <p className="trust-description">{state.decision === 'allow' ? 'Identity, device, and behavior signals work together to keep access in the right hands.' : state.decision === 'challenge' ? 'An unfamiliar device requires additional verification before protected access can continue.' : currentRevoked ? 'This session is no longer authorized. Start a new demo session to continue.' : 'Unusual behavior and context have triggered the simulated access policy.'}</p>
            <div className="trust-pipeline"><span className="pipeline-step"><Fingerprint />Identity checked</span><span className="pipeline-connector" /><span className="pipeline-step"><Monitor />Device assessed</span><span className="pipeline-connector" /><span className="pipeline-step"><Activity />Risk evaluated</span><span className="pipeline-connector" /><span className="pipeline-step"><ShieldCheck />Policy applied</span></div>
          </div>
        </section>
        <section className="panel" aria-labelledby="sessions-preview-title">
          <div className="panel-header"><div><h2 id="sessions-preview-title">Session activity</h2><p className="panel-subtitle">Your connected devices, at a glance.</p></div><button className="text-button" onClick={() => navigate('sessions')}>View all <ChevronRight size={13} /></button></div>
          <div className="table-wrap"><table><thead><tr><th scope="col">DEVICE</th><th scope="col">LOCATION</th><th scope="col">STATUS</th></tr></thead><tbody>{state.sessions.map(session => <tr key={session.id}><td><div className="device-cell"><DeviceIcon session={session} /><div className="device-copy"><strong>{session.device}</strong><span>{session.browser} · {session.isCurrent ? 'This demo session' : session.lastActive}</span></div></div></td><td>{session.location}</td><td><SessionBadge session={session} /></td></tr>)}</tbody></table></div>
          <div className="table-footer"><LockKeyhole size={11} />Synthetic sessions · No device information is collected</div>
        </section>
        <section className="panel" aria-labelledby="resources-preview-title"><div className="panel-header"><h2 id="resources-preview-title">Your learning workspace</h2><button className="text-button" onClick={() => navigate('resources')}>All resources <ChevronRight size={13} /></button></div><div className="resource-mini-grid">{RESOURCES.slice(0, 3).map(resource => <button className="resource-mini" key={resource.id} onClick={() => openResource(resource)}><ResourceIcon resource={resource} /><strong>{resource.name}</strong><span><LockKeyhole size={10} />{getResourceDecision(state, resource).decision === 'allow' ? 'Available' : 'Protected'}</span></button>)}</div></section>
      </div>
      <div className="stack overview-right">
        <RiskPanel state={state} />
        <section className="panel" aria-labelledby="activity-title"><div className="panel-header"><h2 id="activity-title">Recent activity</h2><button className="text-button" onClick={() => navigate('audit')}>View log <ChevronRight size={13} /></button></div><ActivityList entries={state.auditLogs.slice(0, 4)} /></section>
      </div>
    </div>
  </>;
}

function Resources({ state, openResource }: { state: DemoState; openResource: (resource: ProtectedResource) => void }) {
  return <><p className="workspace-summary">Previewing access as <strong>{USERS[state.role].title}</strong>. Each request is checked against the selected role and demo risk scenario.</p><div className="resource-grid">{RESOURCES.map(resource => {
    const access = getResourceDecision(state, resource);
    return <article key={resource.id} className="resource-card"><div className="resource-card-head"><ResourceIcon resource={resource} size={23} /><span className="eyebrow" style={{ color: '#91a0a6', fontSize: 9 }}>{resource.category}</span></div><h2>{resource.name}</h2><p>{resource.description}</p><div className="resource-meta"><Users size={13} />{resource.accessLabel}</div><div className="resource-card-bottom"><Badge tone={decisionTone[access.decision]}>{access.decision === 'allow' ? 'Available' : access.decision === 'challenge' ? 'Verification required' : 'Restricted'}</Badge><button className="button button-small" onClick={() => openResource(resource)}>{access.decision === 'allow' ? 'Open resource' : access.decision === 'challenge' ? 'Verify to open' : 'View access details'}{access.decision === 'allow' && <ArrowUpRight size={14} />}</button></div></article>;
  })}</div></>;
}
function Sessions({ state, onRevoke }: { state: DemoState; onRevoke: (session: DemoSession) => void }) {
  return <div className="session-grid">{state.sessions.map(session => <article key={session.id} className={`session-card ${session.status === 'revoked' ? 'revoked-session' : ''}`}><div className="session-card-head"><DeviceIcon session={session} /><div><h2>{session.device}</h2><p>{session.browser} · {session.platform}</p></div><SessionBadge session={session} /></div><dl className="session-facts"><div><dt>Location</dt><dd>{session.location}</dd></div><div><dt>Demo IP address</dt><dd>{session.ipAddress}</dd></div><div><dt>Last activity</dt><dd>{session.lastActive}</dd></div><div><dt>Risk score</dt><dd>{session.riskScore} / 100</dd></div></dl><div className="session-card-foot"><span>{session.isCurrent ? 'This demo session' : 'Remote demo session'}</span><button className="button button-small" disabled={session.status === 'revoked'} onClick={() => onRevoke(session)}><LogOut size={13} />{session.status === 'revoked' ? 'Session revoked' : 'Revoke session'}</button></div></article>)}</div>;
}
function Audit({ state }: { state: DemoState }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const entries = state.auditLogs.filter(event => (filter === 'all' || event.decision === filter) && `${event.action} ${event.detail} ${event.actor}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="panel" aria-labelledby="audit-title"><div className="panel-header"><div><h2 id="audit-title">Access & security events</h2><p className="panel-subtitle">Demo event history · 8 October 2026 · Times in IST</p></div><Badge tone="neutral">{entries.length} events</Badge></div><div className="filters"><label className="search-box"><Search size={16} /><input aria-label="Search audit events" placeholder="Search events, people, or resources..." value={query} onChange={event => setQuery(event.target.value)} /></label><select className="filter-select" aria-label="Filter by access decision" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All decisions</option><option value="allow">Allowed</option><option value="challenge">Challenged</option><option value="deny">Denied</option></select></div>{entries.length ? <div className="table-wrap"><table className="audit-table"><thead><tr><th scope="col">TIME (IST)</th><th scope="col">EVENT</th><th scope="col">ACTOR</th><th scope="col">DECISION</th></tr></thead><tbody>{entries.map(event => <tr key={event.id}><td>{formatTime(event.timestamp)}</td><td><strong>{event.action}</strong><small>{event.detail}</small></td><td>{event.actor}</td><td><Badge tone={decisionTone[event.decision]}>{event.decision === 'allow' ? 'Allowed' : event.decision === 'challenge' ? 'Challenged' : 'Denied'}</Badge></td></tr>)}</tbody></table></div> : <div className="empty-state"><Search size={30} /><h3>No matching events</h3><p>Try another search or show all access decisions.</p><button className="button" onClick={() => { setQuery(''); setFilter('all'); }}>Clear filters</button></div>}<div className="table-footer"><FlaskConical size={12} />Simulated events only. History resets when the page is reloaded.</div></section>;
}

function MfaForm({ onVerified }: { onVerified: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  function submit(event: FormEvent) { event.preventDefault(); if (code !== '123456') { setError('Enter the demo verification code: 123456.'); return; } onVerified(); }
  return <form onSubmit={submit}><div className="modal-emblem amber"><Fingerprint size={29} /></div><p>Your demo session was detected on an unfamiliar device. Complete this extra verification step to continue.</p><label className="modal-label" htmlFor="verification-code">Verification code</label><input id="verification-code" className="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={event => { setCode(event.target.value.replace(/\D/g, '')); setError(''); }} placeholder="000000" aria-invalid={!!error} aria-describedby="code-hint code-error" required /><p id="code-error" className="form-error" role="alert">{error}</p><div id="code-hint" className="inline-note">Use <strong>123456</strong> for this demo. No code is sent and no real identity verification takes place.</div><div className="modal-actions"><button className="button button-primary" type="submit"><ShieldCheck size={15} />Verify demo session</button></div></form>;
}
function ResourcePreview({ resource, state }: { resource: ProtectedResource; state: DemoState }) {
  const access = getResourceDecision(state, resource);
  if (access.decision !== 'allow') return <><div className="modal-emblem red"><ShieldX size={28} /></div><p>{access.reason}</p><div className="inline-note">The demo checks both your role and session risk. Changing roles does not bypass a high-risk or revoked session.</div></>;
  const details: Record<string, { title: string; detail: string }[]> = {
    'course-materials': [{ title: 'Network Security', detail: 'Unit 04 · Zero Trust architecture' }, { title: 'Machine Learning', detail: 'Unit 06 · Anomaly detection' }, { title: 'Final-year project', detail: 'GhostNet · Research and implementation' }],
    'academic-records': [{ title: 'Semester 7', detail: 'Demonstration academic record' }, { title: 'Project assessment', detail: 'Evaluation pending · No real student data' }],
    'research-cloud': [{ title: 'Behavioral data workspace', detail: 'Dataset integration planned' }, { title: 'Experiment results', detail: 'No project experiments have been run yet' }],
    'admin-console': [{ title: 'Adaptive access policy', detail: 'Low risk: allow · Medium: verify · High: deny' }, { title: 'Role policy', detail: 'Student, faculty, and administrator previews' }],
  };
  return <><Badge>Demo access granted</Badge><p style={{ marginTop: 15 }}>Your current role and session satisfy the demo access policy.</p>{details[resource.id].map(item => <div className="resource-content" key={item.title}><FileText size={20} /><div><strong>{item.title}</strong><span>{item.detail}</span></div></div>)}<div className="inline-note">This is a preview of a protected resource. Real learning materials and backend services will be connected in a later phase.</div></>;
}

export default function App() {
  const [state, setState] = useState<DemoState>(() => createDemoState('admin'));
  const [page, setPage] = useState<Page>(readPage);
  const [signedIn, setSignedIn] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<ActiveModal>(null);
  const [toast, setToast] = useState('');
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  const user = USERS[state.role];
  const currentRevoked = state.sessions.some(session => session.isCurrent && session.status === 'revoked');
  useEffect(() => { const listener = () => { setPage(readPage()); setMenuOpen(false); }; window.addEventListener('hashchange', listener); return () => window.removeEventListener('hashchange', listener); }, []);
  useEffect(() => { document.title = signedIn ? `GhostNet · ${pages[page].label}` : 'GhostNet · Sign in'; }, [page, signedIn]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 6500); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => { const query = window.matchMedia('(max-width: 760px)'); const listener = () => { setCompact(query.matches); setMenuOpen(false); }; query.addEventListener('change', listener); return () => query.removeEventListener('change', listener); }, []);
  useEffect(() => {
    if (!menuOpen || !compact) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebarRef.current?.querySelector<HTMLElement>('a')?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
      if (event.key !== 'Tab') return;
      const controls = sidebarRef.current?.querySelectorAll<HTMLElement>('a, button, select');
      if (!controls?.length) return;
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', trapFocus);
    return () => { document.body.style.overflow = before; window.removeEventListener('keydown', trapFocus); menuButtonRef.current?.focus(); };
  }, [menuOpen, compact]);
  function navigate(nextPage: Page) { window.location.hash = nextPage; setPage(nextPage); setMenuOpen(false); window.scrollTo({ top: 0, behavior: 'instant' }); }
  function update(next: DemoState) { setState(next); setToast(next.lastEvent); }
  function resetDemo() { update(createDemoState(state.role)); setModal(null); }
  function openResource(resource: ProtectedResource) { const next = requestResource(state, resource.id); setState(next); if (next.resourceAccess?.decision === 'challenge') setModal({ kind: 'mfa', resourceId: resource.id }); else setModal({ kind: 'resource', resource }); }
  function completeMfa(resourceId?: string) { const next = verifyMfa(state); update(next); const resource = RESOURCES.find(item => item.id === resourceId); if (resource) { setState(requestResource(next, resource.id)); setModal({ kind: 'resource', resource }); } else setModal(null); }
  function signOut() { setModal(null); setMenuOpen(false); setToast(''); setSignedIn(false); }
  if (!signedIn) return <AuthScreen onSignIn={role => { setState(createDemoState(role)); setSignedIn(true); navigate('overview'); setToast('Demo session started. All signals and decisions are simulated.'); }} />;
  const activeCount = state.sessions.filter(session => session.status === 'active').length;
  return <div className="app">
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>Skip to content</a>
    {menuOpen && <button className="mobile-shade" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <aside ref={sidebarRef} className={`sidebar ${menuOpen ? 'open' : ''}`} aria-label="Workspace navigation" inert={compact && !menuOpen}>
      <button className="icon-button mobile-sidebar-close" aria-label="Close navigation" onClick={() => setMenuOpen(false)}><X size={19} /></button>
      <a className="brand" href="#overview" onClick={() => navigate('overview')}><span className="brand-mark"><ShieldCheck size={37} strokeWidth={1.65} /></span><span className="brand-name">ghost<span>net</span><span style={{ color: '#68e2b9' }}>.</span></span></a>
      <div className="brand-sub">TRUST. CONTINUOUSLY.</div>
      <div className="nav-label">WORKSPACE</div>
      <nav className="nav">{(Object.keys(pages) as Page[]).map(key => { const Icon = pages[key].icon; return <a key={key} href={`#${key}`} onClick={() => navigate(key)} className={`nav-link ${page === key ? 'active' : ''}`} aria-current={page === key ? 'page' : undefined}><Icon size={18} strokeWidth={1.6} />{pages[key].label}{key === 'sessions' && <span className="nav-count">{activeCount}</span>}</a>; })}</nav>
      <div className="sidebar-bottom"><div className="sidebar-note"><ShieldCheck size={21} strokeWidth={1.5} /><strong>Never trust. Always verify.</strong>Access is earned through identity, context, and behavior.</div><div className="profile"><div className="avatar">{user.initials}</div><div className="profile-info"><strong>{user.name}</strong><select className="role-select" aria-label="Demo role" value={state.role} onChange={event => update(switchRole(state, event.target.value as Role))}><option value="admin">Administrator demo</option><option value="faculty">Faculty demo</option><option value="student">Student demo</option></select></div><button className="icon-button" title="Sign out of demo" aria-label="Sign out of demo" onClick={signOut}><LogOut size={16} /></button></div><div className="sidebar-divider" /><button className="text-button" style={{ color: '#8ba5ac', fontSize: 11, paddingLeft: 8 }} onClick={() => setModal({ kind: 'help' })}><FlaskConical size={12} />Frontend prototype · v0.1</button></div>
    </aside>
    <div className="main-shell"><header className="topbar"><button ref={menuButtonRef} className="icon-button menu-toggle" aria-label="Open navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={21} /></button><div className="breadcrumb"><PanelTop size={16} /><span>Workspace</span><span className="breadcrumb-separator">/</span><strong>{pages[page].label}</strong></div><div className="topbar-right"><span className="prototype-label"><span />Research prototype</span><span className="topbar-rule" /><button className="icon-button" aria-label="About this demo" onClick={() => setModal({ kind: 'help' })}><CircleHelp size={19} /></button><div className="avatar" aria-label={user.name}>{user.initials}</div></div></header>
      <main className="content" id="main-content" tabIndex={-1}><div className="page-heading"><div><h1>{pages[page].title}</h1><p>{pages[page].description}</p></div><div className="heading-actions"><span className="date-label"><CalendarDays size={14} />Demo · 08 Oct, 2026</span><button className="button" onClick={resetDemo} aria-label="Reset demo"><RotateCcw size={14} />Reset demo</button></div></div>
        <div className="demo-bar"><FlaskConical className="demo-bar-icon" size={16} /><div className="demo-bar-copy"><strong>Demo workspace</strong>Explore how access changes with risk.</div><label className="scenario-select">Scenario<select aria-label="Risk scenario" value={state.scenario} onChange={event => update(simulateScenario(state, event.target.value as Scenario))}>{(Object.keys(SCENARIOS) as Scenario[]).map(key => <option key={key} value={key}>{SCENARIOS[key].label}</option>)}</select></label></div>
        {state.decision !== 'allow' && <div className={`notice-banner ${decisionTone[state.decision]}`} role="status">{state.decision === 'challenge' ? <Fingerprint size={21} /> : <ShieldAlert size={21} />}<span><strong>{currentRevoked ? 'This session has been revoked.' : decisionLabels[state.decision] + '.'}</strong> {currentRevoked ? 'Reset the demo to begin a new session.' : state.decision === 'challenge' ? 'Complete the demo MFA challenge to resume protected access.' : 'The selected scenario has triggered a high-risk policy decision.'}</span>{state.decision === 'challenge' && <button className="button button-small" onClick={() => setModal({ kind: 'mfa' })}>Verify session</button>}{currentRevoked && <button className="button button-small" onClick={resetDemo}>Start new demo</button>}</div>}
        {page === 'overview' && <Overview state={state} navigate={navigate} openResource={openResource} />}
        {page === 'resources' && <Resources state={state} openResource={openResource} />}
        {page === 'sessions' && <Sessions state={state} onRevoke={session => setModal({ kind: 'revoke', session })} />}
        {page === 'audit' && <Audit state={state} />}
        <footer className="footer"><span><ShieldCheck size={12} />GhostNet · Zero Trust for learning networks</span><span>Simulated data & decisions · No backend connected</span></footer>
      </main>
    </div>
    {toast && <div className="toast" role="status"><CheckCircle2 size={17} /><span>{toast}</span><button className="icon-button" aria-label="Dismiss notification" onClick={() => setToast('')}><X size={16} /></button></div>}
    {modal && <Modal key={modal.kind} title={modal.kind === 'help' ? 'Inside this prototype' : modal.kind === 'mfa' ? 'Verify your session' : modal.kind === 'revoke' ? 'Revoke this session?' : getResourceDecision(state, modal.resource).decision === 'allow' ? modal.resource.name : 'Access restricted'} onClose={() => setModal(null)}>
      {modal.kind === 'help' && <><div className="modal-emblem"><ShieldCheck size={30} /></div><p>GhostNet explores adaptive Zero Trust authentication for learning networks. This frontend demonstrates the experience before backend development.</p><ul className="help-steps"><li><Fingerprint size={18} /><div><strong>Try a different risk scenario</strong><p>Normal activity allows access. A new device requires demo MFA. Suspicious activity blocks access.</p></div></li><li><Users size={18} /><div><strong>Explore role-based access</strong><p>Change the demo role below your profile in the sidebar to compare student, faculty, and administrator access.</p></div></li><li><ShieldAlert size={18} /><div><strong>Frontend demonstration only</strong><p>Scores, devices, locations, and people are synthetic. No telemetry, real authentication, or trained model is connected. Changes reset on reload.</p></div></li></ul></>}
      {modal.kind === 'mfa' && <MfaForm onVerified={() => completeMfa(modal.resourceId)} />}
      {modal.kind === 'revoke' && <><div className="modal-emblem red"><LogOut size={27} /></div><p>The <strong>{modal.session.device}</strong> demo session will be marked as revoked.{modal.session.isCurrent ? ' Protected access in this demo will be blocked until you start a new demo session.' : ' Your current demo session will stay active.'}</p><div className="modal-actions"><button className="button" onClick={() => setModal(null)}>Keep session</button><button className="button button-danger" onClick={() => { update(revokeSession(state, modal.session.id)); setModal(null); }}>Revoke session</button></div></>}
      {modal.kind === 'resource' && <ResourcePreview resource={modal.resource} state={state} />}
    </Modal>}
  </div>;
}
