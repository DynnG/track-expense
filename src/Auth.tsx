import { useEffect, useState } from 'react';
import { Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { api } from './api';
import { Modal } from './components';
import type { Profile } from './types';
export default function Auth({ close, success, standalone = false }: { standalone?: boolean; close: () => void; success: (profile: Profile) => void }) {
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [google, setGoogle] = useState<boolean | null>(null);
  useEffect(() => { let active = true; api<{ google: boolean }>('/auth/providers').then(p => { if (active) setGoogle(p.google); }).catch(() => { if (active) setGoogle(false); }); return () => { active = false; }; }, []);
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [token, setToken] = useState('');
  const [visible, setVisible] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState('');
  function change(next: typeof mode) { setMode(next); setError(''); setNotice(''); setPassword(''); }
  const title = mode === 'register' ? 'Make room for better money habits' : mode === 'reset' ? 'Reset your password' : 'Welcome back';
  const content = <>
    <p className="muted">{mode === 'reset' ? 'Enter the recovery token supplied by your administrator.' : 'Sign in to access your personal workspace.'}</p>
    {mode !== 'reset' && <div className="segmented"><button aria-pressed={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => change('login')}>Sign in</button><button aria-pressed={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => change('register')}>Create account</button></div>}
    {mode !== 'reset' && <div className="social-auth"><button className="button google-button full-width" disabled={!google || busy} onClick={() => { setBusy(true); location.assign('/api/v1/auth/google/start'); }}><span aria-hidden="true" className="google-letter">G</span>Continue with Google</button><p className="field-hint">{google === null ? 'Checking sign-in options…' : google ? 'Google handles your password. Only your name and email are requested.' : 'Google sign-in needs to be enabled by the administrator.'}</p><div className="auth-divider">or use email</div></div>}
    <form onSubmit={async e => { e.preventDefault(); setError(''); setBusy(true); try {
      if (mode === 'reset') { const result = await api<{ message: string }>('/auth/reset', { method: 'POST', body: JSON.stringify({ token, password }) }); change('login'); setNotice(result.message); }
      else { const profile = await api<Profile>(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(mode === 'register' ? { name, email, password } : { email, password }) }); success(profile); close(); }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>
      {mode === 'register' && <label className="field">Your name<input required maxLength={60} autoComplete="given-name" value={name} onChange={e => setName(e.target.value)} /></label>}
      {mode !== 'reset' ? <label className="field">Email<input required type="email" maxLength={254} autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} /></label> : <label className="field">Recovery token<input required autoComplete="off" value={token} onChange={e => setToken(e.target.value)} /></label>}
      <label className="field">{mode === 'reset' ? 'New password' : 'Password'}<span className="password-field"><input required aria-label={mode === 'reset' ? 'New password' : 'Password'} type={visible ? 'text' : 'password'} minLength={mode === 'login' ? 1 : 10} maxLength={128} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} /><button type="button" className="icon-button" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></span>{mode !== 'login' && <span className="field-hint">Use at least 10 characters.</span>}</label>
      {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-success" role="status">{notice}</p>}
      <button className="button primary full-width" disabled={busy}>{busy ? 'Please wait…' : mode === 'register' ? 'Create account' : mode === 'reset' ? 'Update password' : 'Sign in'}</button>
      <button type="button" className="text-button recovery" onClick={() => change(mode === 'reset' ? 'login' : 'reset')}>{mode === 'reset' ? 'Back to sign in' : 'Have an account recovery token?'}</button>
    </form><p className="security-note"><LockKeyhole size={14} />Your password is hashed. Sessions stay in secure cookies.</p>
  </>;
  return standalone ? <section className="panel auth-card" aria-label={title}><h2>{title}</h2>{content}</section> : <Modal title={title} close={close}>{content}</Modal>;
}
