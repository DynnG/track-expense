import { useEffect, useState } from 'react';
import { api } from './api';

export default function GoogleConnection() {
  const [status, setStatus] = useState<{ enabled: boolean; connected: boolean } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; api<{ enabled: boolean; connected: boolean }>('/auth/google/status').then(s => { if (active) setStatus(s); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
  return <div className="google-connection"><h3>Google sign-in</h3><p className="muted">{status?.connected ? 'Connected. You can sign in with your Google account.' : 'Connect your Google account to sign in without entering your app password.'}</p>{!status?.connected && <button className="button google-button" disabled={!status?.enabled || busy} onClick={async () => { setBusy(true); setError(''); try { const result = await api<{ url: string }>('/auth/google/link', { method: 'POST', body: '{}' }); const target = new URL(result.url); if (target.origin !== 'https://accounts.google.com') throw new Error('Unable to connect Google.'); location.assign(target.href); } catch (e) { setError((e as Error).message); setBusy(false); } }}><span aria-hidden="true" className="google-letter">G</span>{busy ? 'Connecting…' : 'Connect Google'}</button>}{status && !status.enabled && <p className="field-hint">Google sign-in needs to be enabled by the administrator.</p>}{error && <p className="form-error" role="alert">{error}</p>}</div>;
}
