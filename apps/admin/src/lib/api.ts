'use client';
/** Empty = same server that hosts this dashboard (production). Set NEXT_PUBLIC_API_URL for local dev. */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';
const KEY = 'mru.admin.session';

export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'SUPPORT';
export type Session = { accessToken: string; admin: { id: string; name: string; email: string; role: AdminRole; mustChangePassword: boolean } };

/** Admin token lives in sessionStorage (cleared when the tab closes). Bearer tokens → no CSRF surface. */
export const session = {
  get(): Session | null { if (typeof window === 'undefined') return null; try { return JSON.parse(sessionStorage.getItem(KEY) ?? 'null'); } catch { return null; } },
  set(s: Session) { sessionStorage.setItem(KEY, JSON.stringify(s)); },
  clear() { sessionStorage.removeItem(KEY); },
};

export class ApiError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const s = session.get();
  const res = await fetch(`${API_URL}/v1${path}`, {
    method: opts.method ?? (opts.body || opts.form ? 'POST' : 'GET'),
    headers: { ...(opts.form ? {} : { 'content-type': 'application/json' }), ...(s ? { authorization: `Bearer ${s.accessToken}` } : {}) },
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  }).catch(() => { throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection.'); });
  if (res.status === 401 && !path.startsWith('/auth/')) { session.clear(); if (typeof window !== 'undefined') window.location.href = '/admin/login/'; }
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, json?.error?.code ?? 'ERROR', json?.error?.message ?? 'Request failed');
  return json as T;
}

/** Opens an authenticated PDF in a new tab. */
export async function openPdf(path: string) {
  const s = session.get();
  const r = await fetch(`${API_URL}/v1${path}`, { headers: { authorization: `Bearer ${s?.accessToken}` } });
  if (!r.ok) throw new Error('Could not load PDF');
  window.open(URL.createObjectURL(await r.blob()), '_blank', 'noopener');
}

export const inr = (p: number | null | undefined) => (p == null ? '—' : '₹' + (p / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 }));
export const dt = (s: string | null | undefined) => (s ? new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: '2-digit', hour: 'numeric', minute: '2-digit' }) : '—');
export const d = (s: string | null | undefined) => (s ? new Date(s.length === 10 ? s + 'T00:00:00' : s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const label = (s: string) => s.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/** Mirrors server RBAC (server/src/lib/auth.ts) so the UI hides what a role can't do. The server still enforces. */
const P: Record<string, AdminRole[]> = {
  'bookings.cancel': ['SUPER_ADMIN', 'ADMIN'], 'customers.manage': ['SUPER_ADMIN', 'ADMIN'], 'technicians.manage': ['SUPER_ADMIN', 'ADMIN'],
  'catalog.manage': ['SUPER_ADMIN', 'ADMIN'], 'areas.manage': ['SUPER_ADMIN', 'ADMIN'], 'coupons.manage': ['SUPER_ADMIN', 'ADMIN'], 'wallet.adjust': ['SUPER_ADMIN', 'ADMIN'],
  'payments.view': ['SUPER_ADMIN', 'ADMIN'], 'payments.refund': ['SUPER_ADMIN', 'ADMIN'], 'referrals.manage': ['SUPER_ADMIN', 'ADMIN'], 'notifications.send': ['SUPER_ADMIN', 'ADMIN'],
  'settings.manage': ['SUPER_ADMIN'], 'admins.manage': ['SUPER_ADMIN'], 'audit.view': ['SUPER_ADMIN', 'ADMIN'], 'reports.view': ['SUPER_ADMIN', 'ADMIN'],
};
export const can = (perm: string) => { const r = session.get()?.admin.role; return !!r && (P[perm] ? P[perm].includes(r) : true); };
