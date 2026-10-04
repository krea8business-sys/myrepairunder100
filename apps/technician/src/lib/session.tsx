import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, auth, closeSocket } from '@kit';

export type TechStatus = 'PENDING' | 'APPROVED' | 'SUSPENDED' | 'REJECTED';
type Status = 'loading' | 'signedOut' | 'needsRegistration' | 'signedIn';
type Me = { id: string; code: string; status: TechStatus; availability: 'AVAILABLE' | 'BUSY' | 'OFFLINE'; name: string | null; phone: string };
type Ctx = { status: Status; me: Me | null; reload: () => Promise<void>; signIn: (t: { accessToken: string; refreshToken: string }, needsRegistration: boolean) => Promise<void>; signOut: () => Promise<void> };
const C = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [me, setMe] = useState<Me | null>(null);

  const reload = useCallback(async () => {
    try { setMe(await api<Me>('/technician/me')); setStatus('signedIn'); }
    catch (e) { if ((e as { status?: number }).status === 403) setStatus('needsRegistration'); else if (!auth.access) setStatus('signedOut'); else setStatus('signedIn'); }
  }, []);

  useEffect(() => {
    auth.configure('mru.technician.tokens', () => { closeSocket(); setMe(null); setStatus('signedOut'); });
    auth.load().then((t) => (t ? reload() : setStatus('signedOut')));
  }, [reload]);

  const value = useMemo<Ctx>(() => ({
    status, me, reload,
    signIn: async (t, needsRegistration) => { await auth.save(t); if (needsRegistration) setStatus('needsRegistration'); else await reload(); },
    signOut: async () => {
      const rt = auth.refresh;
      if (rt) api('/auth/logout', { body: { refreshToken: rt }, auth: false }).catch(() => undefined);
      await auth.clear(); closeSocket(); qc.clear(); setMe(null); setStatus('signedOut');
    },
  }), [status, me, reload, qc]);
  return <C.Provider value={value}>{children}</C.Provider>;
}
export const useSession = () => { const c = useContext(C); if (!c) throw new Error('SessionProvider missing'); return c; };
