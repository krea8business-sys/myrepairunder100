'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, session, type Session } from '@/lib/api';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const s = await api<Session>('/auth/admin/login', { body: { email, password } }); session.set(s); router.replace(s.admin.mustChangePassword ? '/settings?tab=account' : '/'); }
    catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
  };
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'linear-gradient(160deg, #0B2559 0%, #13306E 55%, #F25A0C 140%)', padding: 16 }}>
      <form onSubmit={submit} className="card" style={{ width: 380, padding: 28 }}>
        <div className="row" style={{ marginBottom: 20 }}><img src="/admin/logo-mark.png" alt="" width={44} height={36} /><b style={{ fontSize: 17 }}>MyRepair<span style={{ color: 'var(--orange)' }}>Under100</span></b></div>
        <h1>Admin sign in</h1><p className="muted" style={{ marginTop: 4 }}>Operations dashboard</p>
        {err ? <div className="alert bad">{err}</div> : null}
        <label className="field"><span>Email</span><input className="in" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="field"><span>Password</span><input className="in" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        <button className="btn" style={{ width: '100%', height: 44 }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="muted small" style={{ marginTop: 14 }}>Accounts lock for 15 minutes after 5 failed attempts.</p>
      </form>
    </main>
  );
}
