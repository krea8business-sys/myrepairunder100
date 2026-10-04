import { env } from '../config/env.js';
import { haversineKm, roughEtaMins } from '../lib/geo.js';

export interface GeoAddress { formatted: string; locality?: string; city?: string; state?: string; pincode?: string; lat: number; lng: number }
export interface MapsProvider {
  name: string;
  reverseGeocode(lat: number, lng: number): Promise<GeoAddress | null>;
  autocomplete(q: string, near?: { lat: number; lng: number }): Promise<{ placeId: string; description: string }[]>;
  placeDetails(placeId: string): Promise<GeoAddress | null>;
  eta(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<{ km: number; mins: number }>;
}

const google: MapsProvider = {
  name: 'google',
  async reverseGeocode(lat, lng) {
    const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${env.GOOGLE_MAPS_SERVER_KEY}&region=in`);
    const j: any = await r.json(); const res = j.results?.[0];
    return res ? toGeo(res) : null;
  },
  async autocomplete(q, near) {
    const loc = near ? `&location=${near.lat},${near.lng}&radius=40000` : '';
    const r = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(q)}&components=country:in${loc}&key=${env.GOOGLE_MAPS_SERVER_KEY}`);
    const j: any = await r.json();
    return (j.predictions ?? []).slice(0, 6).map((p: any) => ({ placeId: p.place_id, description: p.description }));
  },
  async placeDetails(placeId) {
    const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?place_id=${encodeURIComponent(placeId)}&key=${env.GOOGLE_MAPS_SERVER_KEY}`);
    const j: any = await r.json(); const res = j.results?.[0];
    return res ? toGeo(res) : null;
  },
  async eta(from, to) {
    const r = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?origins=${from.lat},${from.lng}&destinations=${to.lat},${to.lng}&departure_time=now&key=${env.GOOGLE_MAPS_SERVER_KEY}`);
    const j: any = await r.json(); const el = j.rows?.[0]?.elements?.[0];
    if (el?.status === 'OK') return { km: el.distance.value / 1000, mins: Math.round((el.duration_in_traffic ?? el.duration).value / 60) };
    const km = haversineKm(from, to); return { km, mins: roughEtaMins(km) };
  },
};
function toGeo(res: any): GeoAddress {
  const c = (t: string) => res.address_components?.find((a: any) => a.types.includes(t))?.long_name;
  return { formatted: res.formatted_address, locality: c('sublocality_level_1') ?? c('sublocality') ?? c('neighborhood'), city: c('locality') ?? c('administrative_area_level_2'), state: c('administrative_area_level_1'), pincode: c('postal_code'), lat: res.geometry.location.lat, lng: res.geometry.location.lng };
}

/** MOCK — development only. Approximates Delhi NCR so flows work without an API key. */
const mock: MapsProvider = {
  name: 'mock',
  async reverseGeocode(lat, lng) { return { formatted: `Near ${lat.toFixed(4)}, ${lng.toFixed(4)} (mock geocoder)`, locality: 'Sant Nagar, Burari', city: 'Delhi', state: 'Delhi', pincode: '110084', lat, lng }; },
  async autocomplete(q) { return q.length < 2 ? [] : [{ placeId: 'mock:110084', description: `${q} — Burari, Delhi 110084 (mock)` }, { placeId: 'mock:110042', description: `${q} — Badli, Delhi 110042 (mock)` }]; },
  async placeDetails(id) { const pin = id.split(':')[1] ?? '110084'; return { formatted: `Delhi ${pin} (mock)`, city: 'Delhi', state: 'Delhi', pincode: pin, lat: 28.7375, lng: 77.1966 }; },
  async eta(from, to) { const km = haversineKm(from, to); return { km, mins: roughEtaMins(km) }; },
};

export const maps: MapsProvider = env.MAPS_PROVIDER === 'google' ? google : mock;
