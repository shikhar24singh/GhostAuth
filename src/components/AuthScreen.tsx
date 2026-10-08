import { useId, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Fingerprint,
  GraduationCap,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { USERS } from '../lib/demo-data';
import './AuthScreen.css';

type Role = 'student' | 'faculty' | 'admin';
type AuthScreenProps = { onSignIn: (role: Role) => void };

const roles: { value: Role; label: string; description: string }[] = [
  { value: 'student', label: 'Student', description: 'Your learning workspace' },
  { value: 'faculty', label: 'Faculty', description: 'Your teaching workspace' },
  { value: 'admin', label: 'Administrator', description: 'Your security workspace' },
];

export default function AuthScreen({ onSignIn }: AuthScreenProps) {
  const id = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('admin');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [notice, setNotice] = useState('');

  function fillDemoCredentials() {
    setEmail(USERS[role].email);
    setPassword('GhostNet2026!');
    setErrors({});
    setNotice('Demo details added. You can now enter the workspace.');
  }

  function selectRole(nextRole: Role) {
    if (Object.values(USERS).some((user) => user.email === email)) {
      setEmail(USERS[nextRole].email);
    }
    setRole(nextRole);
    setNotice('');
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      nextErrors.email = 'Enter a valid email address, or use Fill demo details.';
    }
    if (password.length < 8) {
      nextErrors.password = 'Use at least 8 characters for this demo password.';
    }
    setErrors(nextErrors);
    setNotice('');
    if (Object.keys(nextErrors).length > 0) {
      document.getElementById(`${id}-${nextErrors.email ? 'email' : 'password'}`)?.focus();
      return;
    }
    setPassword('');
    onSignIn(role);
  }

  return (
    <main className="auth-screen">
      <section className="auth-story" aria-label="About GhostNet">
        <div className="auth-brand" aria-label="GhostNet">
          <span className="auth-brand-icon"><ShieldCheck size={24} strokeWidth={1.7} /></span>
          <span>ghostnet<span className="auth-brand-dot">.</span></span>
        </div>

        <div className="auth-story-content">
          <span className="auth-eyebrow auth-eyebrow-light"><span /> A SAFER SPACE TO LEARN</span>
          <h1>Great learning.<br />{' '}Quietly protected.</h1>
          <p className="auth-story-description">A learning network built around trust. Every identity, every session, every step of the way.</p>

          <div className="auth-journey" aria-label="How adaptive access works">
            <div className="auth-journey-row">
              <span className="auth-journey-icon"><Fingerprint size={23} strokeWidth={1.6} /></span>
              <div><span className="auth-step-number">01 / IDENTITY</span><h2>Start with you</h2><p>Your role defines your workspace.</p></div>
              <Check className="auth-journey-check" size={18} aria-hidden="true" />
            </div>
            <div className="auth-journey-row">
              <span className="auth-journey-icon"><ShieldCheck size={23} strokeWidth={1.6} /></span>
              <div><span className="auth-step-number">02 / CONTEXT</span><h2>Understand the session</h2><p>Device and behavior inform access.</p></div>
              <Check className="auth-journey-check" size={18} aria-hidden="true" />
            </div>
            <div className="auth-journey-row">
              <span className="auth-journey-icon"><GraduationCap size={23} strokeWidth={1.6} /></span>
              <div><span className="auth-step-number">03 / ACCESS</span><h2>Keep learning</h2><p>Protection adapts as sessions change.</p></div>
              <Check className="auth-journey-check" size={18} aria-hidden="true" />
            </div>
          </div>
        </div>

        <footer className="auth-story-footer"><span>GHOSTNET RESEARCH PROJECT</span><span>Adaptive trust. Continuous care.</span></footer>
      </section>

      <section className="auth-entry" aria-labelledby={`${id}-heading`}>
        <div className="auth-entry-top"><span className="auth-demo-pill"><span /> FRONTEND DEMO</span><span className="auth-version">PROJECT PREVIEW / 01</span></div>

        <div className="auth-form-container">
          <div className="auth-form-symbol"><LockKeyhole size={25} strokeWidth={1.6} aria-hidden="true" /></div>
          <span className="auth-eyebrow">LEARNING NETWORK SECURITY</span>
          <h2 id={`${id}-heading`}>Your next session.<br /><span>Verified.</span></h2>
          <p className="auth-intro">Welcome to GhostNet. Step into your workspace and explore adaptive access in action.</p>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <fieldset className="auth-roles">
              <legend>Choose your workspace</legend>
              <div className="auth-role-options">
                {roles.map((option) => (
                  <label key={option.value} className={`auth-role-option${role === option.value ? ' auth-role-selected' : ''}`}>
                    <input type="radio" name={`${id}-role`} value={option.value} checked={role === option.value} onChange={() => selectRole(option.value)} />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="auth-field">
              <label htmlFor={`${id}-email`}>Email address</label>
              <input id={`${id}-email`} type="email" autoComplete="off" placeholder="you@ghostnet.example" value={email} onChange={(event) => { setEmail(event.target.value); setNotice(''); }} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? `${id}-email-error` : undefined} />
              {errors.email && <p className="auth-error" id={`${id}-email-error`} role="alert">{errors.email}</p>}
            </div>

            <div className="auth-field">
              <label htmlFor={`${id}-password`}>Demo password</label>
              <div className="auth-password-wrap">
                <input id={`${id}-password`} type={showPassword ? 'text' : 'password'} autoComplete="off" placeholder="At least 8 characters" value={password} onChange={(event) => { setPassword(event.target.value); setNotice(''); }} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? `${id}-password-error` : `${id}-demo-note`} />
                <button className="auth-password-toggle" type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </div>
              {errors.password && <p className="auth-error" id={`${id}-password-error`} role="alert">{errors.password}</p>}
            </div>

            <button className="auth-submit" type="submit"><span>Enter workspace</span><ArrowRight size={18} /></button>
            <button className="auth-demo-fill" type="button" onClick={fillDemoCredentials}><Sparkles size={16} /> Fill demo details</button>
            <p className="auth-status" aria-live="polite">{notice || roles.find((option) => option.value === role)?.description}</p>
          </form>

          <div className="auth-demo-note" id={`${id}-demo-note`}><ShieldCheck size={19} aria-hidden="true" /><p><strong>A safe place to explore.</strong> This is a frontend simulation. Any valid email and a password of 8+ characters will work. Please use demo details, never real credentials.</p></div>
        </div>

        <footer className="auth-entry-footer"><span>Built for learning. Designed for trust.</span><span><LockKeyhole size={12} /> Demo environment</span></footer>
      </section>
    </main>
  );
}
