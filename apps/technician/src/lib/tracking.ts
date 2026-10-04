import * as Location from 'expo-location';
import { api, getSocket } from '@kit';

/**
 * Location sharing runs ONLY while a job is in "on the way" / "arrived" state and the app is open.
 * The server also ignores updates when the technician has no such active job (privacy by design).
 */
let sub: Location.LocationSubscription | null = null;
export async function startSharing(): Promise<boolean> {
  if (sub) return true;
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') return false;
  const push = (lat: number, lng: number) => {
    const s = getSocket();
    if (s?.connected) s.emit('tech:location', { lat, lng });
    else api('/technician/location', { body: { lat, lng } }).catch(() => undefined);
  };
  const first = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null);
  if (first) push(first.coords.latitude, first.coords.longitude);
  sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 10_000, distanceInterval: 25 }, (p) => push(p.coords.latitude, p.coords.longitude));
  return true;
}
export function stopSharing() { sub?.remove(); sub = null; }
export const isSharing = () => !!sub;
