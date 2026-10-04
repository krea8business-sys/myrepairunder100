import Constants from 'expo-constants';
import { secure } from './storage';

export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ?? (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

type Tokens = { accessToken: string; refreshToken: string };
let tokens: Tokens | null = null;
let onLogout: (() => void) | null = null;
let storageKey = 'mru.tokens';

export const auth = {
  configure(key: string, logoutHandler: () => void) { storageKey = key; onLogout = logoutHandler; },
  async load() { const raw = await secure.get(storageKey); tokens = raw ? JSON.parse(raw) : null; return tokens; },
  async save(t: Tokens) { tokens = t; await secure.set(storageKey, JSON.stringify(t)); },
  async clear() { tokens = null; await secure.del(storageKey); },
  get access() { return tokens?.accessToken ?? null; },
  get refresh() { return tokens?.refreshToken ?? null; },
};

let refreshing: Promise<boolean> | null = null;
async function refreshTokens(): Promise<boolean> {
  if (!tokens?.refreshToken) return false;
  refreshing ??= (async () => {
    try {
      const r = await fetch(`${API_URL}/v1/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: tokens!.refreshToken }) });
      if (!r.ok) return false;
      await auth.save(await r.json());
      return true;
    } catch { return false; } finally { setTimeout(() => { refreshing = null; }, 0); }
  })();
  return refreshing;
}

/** Fetch wrapper: JSON, auth header, one transparent refresh on 401, friendly errors, timeout for slow networks. */
export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData; auth?: boolean; timeoutMs?: number } = {}): Promise<T> {
  const doFetch = async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20_000);
    try {
      return await fetch(`${API_URL}/v1${path}`, {
        method: opts.method ?? (opts.body || opts.form ? 'POST' : 'GET'),
        headers: { ...(opts.form ? {} : { 'content-type': 'application/json' }), ...(opts.auth !== false && tokens?.accessToken ? { authorization: `Bearer ${tokens.accessToken}` } : {}) },
        body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
        signal: ctrl.signal,
      });
    } finally { clearTimeout(timer); }
  };
  let res: Response;
  try { res = await doFetch(); }
  catch (e) { throw new ApiError(0, 'NETWORK', (e as Error).name === 'AbortError' ? 'The network is slow. Please try again.' : 'No internet connection. Please check your network and retry.'); }
  if (res.status === 401 && opts.auth !== false && tokens?.refreshToken) {
    if (await refreshTokens()) res = await doFetch();
    else { await auth.clear(); onLogout?.(); }
  }
  const text = await res.text();
  const json = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;
  if (!res.ok) throw new ApiError(res.status, json?.error?.code ?? 'ERROR', json?.error?.message ?? 'Something went wrong. Please try again.');
  return json as T;
}

export const errorMessage = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
