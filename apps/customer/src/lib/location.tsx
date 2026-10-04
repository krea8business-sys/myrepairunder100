import React, { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import * as Location from 'expo-location';
import { api, secure } from '@kit';

export type Place = { label: string; sublabel: string; pincode: string | null; lat?: number; lng?: number; serviceable: boolean | null; city?: string | null; state?: string | null; locality?: string | null; formatted?: string };
type Ctx = { place: Place | null; detecting: boolean; error: string | null; detect: () => Promise<Place | null>; setPlace: (p: Place) => Promise<void>; permission: Location.PermissionStatus | null };
const C = createContext<Ctx | null>(null);

/** GPS (with permission) → server reverse-geocode → serviceability. Falls back to manual selection. */
export function LocationProvider({ children }: { children: ReactNode }) {
  const [place, setP] = useState<Place | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<Location.PermissionStatus | null>(null);

  useEffect(() => { secure.get('mru.place').then((r) => r && setP(JSON.parse(r))); Location.getForegroundPermissionsAsync().then((p) => setPermission(p.status)).catch(() => undefined); }, []);
  const setPlace = useCallback(async (p: Place) => { setP(p); await secure.set('mru.place', JSON.stringify(p)); }, []);

  const detect = useCallback(async () => {
    setDetecting(true); setError(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      setPermission(perm.status);
      if (perm.status !== 'granted') { setError('Location permission denied. Choose your location manually.'); return null; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lng } = pos.coords;
      const r = await api<{ address: { formatted: string; locality?: string; city?: string; state?: string; pincode?: string } | null; serviceability: { serviceable: boolean } | null }>(`/location/reverse-geocode?lat=${lat}&lng=${lng}`, { auth: false });
      const a = r.address;
      const p: Place = {
        label: a?.locality ?? a?.city ?? 'Current location', sublabel: [a?.city, a?.pincode].filter(Boolean).join(' '), pincode: a?.pincode ?? null,
        lat, lng, serviceable: r.serviceability?.serviceable ?? null, city: a?.city ?? null, state: a?.state ?? null, locality: a?.locality ?? null, formatted: a?.formatted,
      };
      await setPlace(p); return p;
    } catch { setError('Unable to detect location. Please choose it manually.'); return null; }
    finally { setDetecting(false); }
  }, [setPlace]);

  return <C.Provider value={{ place, detecting, error, detect, setPlace, permission }}>{children}</C.Provider>;
}
export const useLocation = () => { const c = useContext(C); if (!c) throw new Error('LocationProvider missing'); return c; };
