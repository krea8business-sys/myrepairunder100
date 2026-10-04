import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { api, auth, closeSocket, secure } from '@kit';

export type User = { id: string; phone: string; name: string | null; referralCode: string };
type Status = 'loading' | 'signedOut' | 'signedIn';
type Ctx = {
  status: Status; user: User | null; onboarded: boolean;
  setOnboarded: () => Promise<void>;
  signIn: (r: { accessToken: string; refreshToken: string; user: User }) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  deviceId: string | null;
};
const SessionContext = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [onboarded, setOb] = useState(true);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  const signOut = useCallback(async () => {
    const rt = auth.refresh;
    if (rt) api('/auth/logout', { body: { refreshToken: rt }, auth: false }).catch(() => undefined);
    await auth.clear(); closeSocket(); qc.clear(); setUser(null); setStatus('signedOut');
  }, [qc]);

  useEffect(() => {
    auth.configure('mru.customer.tokens', () => { closeSocket(); setUser(null); setStatus('signedOut'); });
    (async () => {
      setOb((await secure.get('mru.onboarded')) === '1');
      let id = await secure.get('mru.deviceId');
      if (!id) { id = Crypto.randomUUID(); await secure.set('mru.deviceId', id); }
      setDeviceId(id);
      const t = await auth.load();
      if (!t) return setStatus('signedOut');
      try { setUser(await api<User>('/me')); setStatus('signedIn'); } catch { setStatus(auth.access ? 'signedIn' : 'signedOut'); }
    })();
  }, []);

  const value = useMemo<Ctx>(() => ({
    status, user, onboarded, deviceId,
    setOnboarded: async () => { await secure.set('mru.onboarded', '1'); setOb(true); },
    signIn: async (r) => { await auth.save({ accessToken: r.accessToken, refreshToken: r.refreshToken }); setUser(r.user); setStatus('signedIn'); },
    signOut,
    refreshUser: async () => { setUser(await api<User>('/me')); },
  }), [status, user, onboarded, deviceId, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
export const useSession = () => { const c = useContext(SessionContext); if (!c) throw new Error('SessionProvider missing'); return c; };
