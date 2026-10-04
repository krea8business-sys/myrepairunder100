import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Banner, Button, Field, Gap, Header, Icon, Row, Screen, T, api, colors, errorMessage, radius } from '@kit';
import { useLocation, type Place } from '@/lib/location';
import { useAddresses } from '@/lib/queries';
import { useSession } from '@/lib/session';

type Sv = { serviceable: boolean; message: string; area: string | null; city: string | null };

/** Location permission + manual fallback (search, pincode or saved address). */
export default function LocationScreen() {
  const { detect, detecting, error, setPlace, place } = useLocation();
  const { status } = useSession();
  const addrs = useAddresses();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ placeId: string; description: string }[]>([]);
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const first = !place;

  useEffect(() => {
    if (q.trim().length < 3) return setResults([]);
    const t = setTimeout(() => api<{ placeId: string; description: string }[]>(`/location/autocomplete?q=${encodeURIComponent(q.trim())}`, { auth: false }).then(setResults).catch(() => setResults([])), 300);
    return () => clearTimeout(t);
  }, [q]);

  const done = () => (router.canGoBack() && !first ? router.back() : router.replace('/(tabs)'));
  const useGps = async () => { const p = await detect(); if (p) { setMsg(p.serviceable ? { tone: 'success', text: 'Service available at your location' } : { tone: 'danger', text: "Sorry, we currently don't service this location." }); if (p.serviceable) setTimeout(done, 600); } };
  const choosePlace = async (placeId: string) => {
    setBusy(true);
    try {
      const r = await api<{ address: { formatted: string; locality?: string; city?: string; state?: string; pincode?: string; lat: number; lng: number } | null; serviceability: Sv | null }>(`/location/place?placeId=${encodeURIComponent(placeId)}`, { auth: false });
      if (!r.address) return;
      const p: Place = { label: r.address.locality ?? r.address.city ?? 'Selected location', sublabel: [r.address.city, r.address.pincode].filter(Boolean).join(' '), pincode: r.address.pincode ?? null, lat: r.address.lat, lng: r.address.lng, serviceable: r.serviceability?.serviceable ?? null, city: r.address.city, state: r.address.state, locality: r.address.locality, formatted: r.address.formatted };
      await setPlace(p); done();
    } catch (e) { setMsg({ tone: 'danger', text: errorMessage(e) }); } finally { setBusy(false); }
  };
  const checkPin = async () => {
    setBusy(true);
    try {
      const r = await api<Sv>(`/location/serviceability?pincode=${pin}`, { auth: false });
      setMsg({ tone: r.serviceable ? 'success' : 'danger', text: r.message });
      if (r.serviceable) { await setPlace({ label: r.area ?? `Pincode ${pin}`, sublabel: [r.city, pin].filter(Boolean).join(' '), pincode: pin, serviceable: true, city: r.city }); setTimeout(done, 500); }
    } catch (e) { setMsg({ tone: 'danger', text: errorMessage(e) }); } finally { setBusy(false); }
  };

  return (
    <Screen keyboard padded={false} edges={['top', 'bottom']} bg={colors.white}>
      {first ? null : <Header title="Choose location" onBack={() => router.back()} />}
      <Screen edges={[]} bg={colors.white}>
        {first ? <>
          <View style={{ height: 150, borderRadius: radius.xl, backgroundColor: colors.blueTint, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}><Icon name="location" size={56} color={colors.blue} /></View>
          <T v="display" color={colors.ink}>Where should we come?</T>
          <T color={colors.slate} style={{ marginTop: 6 }}>Allow location to see services and prices available in your area. We only use it while you use the app.</T>
          <Gap h={20} />
        </> : null}
        <Button title={detecting ? 'Detecting…' : 'Use my current location'} icon="navigate" onPress={useGps} loading={detecting} />
        {error ? <><Gap /><Banner tone="warn" title={error} /></> : null}
        {msg ? <><Gap /><Banner tone={msg.tone} title={msg.text} /></> : null}
        <Gap h={24} />
        <T v="h3" color={colors.ink}>Or search your area</T>
        <Gap h={8} />
        <Field value={q} onChangeText={setQ} placeholder="e.g. Sant Nagar, Burari" left={<Icon name="search" />} />
        {results.map((r) => (
          <Pressable key={r.placeId} onPress={() => choosePlace(r.placeId)} disabled={busy} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line }}>
            <Row gap={10}><Icon name="location-outline" /><T style={{ flex: 1 }}>{r.description}</T></Row>
          </Pressable>
        ))}
        <Gap h={16} />
        <T v="h3" color={colors.ink}>Or enter your pincode</T>
        <Gap h={8} />
        <Row gap={10} align="flex-start">
          <Field style={{ flex: 1 }} value={pin} onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" placeholder="110084" maxLength={6} />
          <Button title="Check" full={false} size="lg" kind="secondary" disabled={pin.length !== 6} loading={busy} onPress={checkPin} />
        </Row>
        {status === 'signedIn' && addrs.data?.length ? <>
          <Gap h={8} />
          <T v="h3" color={colors.ink}>Saved addresses</T>
          {addrs.data.map((a) => (
            <Pressable key={a.id} onPress={async () => { await setPlace({ label: a.locality ?? a.city, sublabel: `${a.city} ${a.pincode}`, pincode: a.pincode, lat: a.lat ?? undefined, lng: a.lng ?? undefined, serviceable: a.serviceability.serviceable, city: a.city }); done(); }}
              style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line }}>
              <Row gap={10}><Icon name={a.label === 'WORK' ? 'briefcase-outline' : 'home-outline'} /><View style={{ flex: 1 }}><T v="bodyStrong">{a.label.charAt(0) + a.label.slice(1).toLowerCase()}</T><T v="small" color={colors.muted}>{a.houseNo}, {a.locality ?? a.city} {a.pincode}</T></View></Row>
            </Pressable>
          ))}
        </> : null}
        {first ? <><Gap h={16} /><Button title="Skip for now" kind="ghost" onPress={async () => { await setPlace({ label: 'Delhi NCR', sublabel: 'Select your area', pincode: null, serviceable: null }); router.replace('/(tabs)'); }} /></> : null}
      </Screen>
    </Screen>
  );
}
