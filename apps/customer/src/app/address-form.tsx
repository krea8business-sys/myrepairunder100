import React, { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Banner, Button, Chip, Field, Gap, Header, Row, Screen, StickyFooter, T, Toggle, api, colors, errorMessage } from '@kit';
import { qk, useAddresses } from '@/lib/queries';
import { useLocation } from '@/lib/location';
import { useSession } from '@/lib/session';
import { checkout } from '@/lib/checkout';
import type { Address } from '@/lib/types';

type Form = { label: 'HOME' | 'WORK' | 'OTHER'; contactName: string; contactPhone: string; houseNo: string; street: string; landmark: string; locality: string; city: string; state: string; pincode: string; lat: number | null; lng: number | null; isDefault: boolean };

export default function AddressForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const qc = useQueryClient();
  const addrs = useAddresses();
  const { place, detect, detecting } = useLocation();
  const { user } = useSession();
  const existing = addrs.data?.find((a) => a.id === id);
  const [f, setF] = useState<Form>({ label: 'HOME', contactName: user?.name ?? '', contactPhone: user?.phone?.replace('+91', '') ?? '', houseNo: '', street: '', landmark: '', locality: place?.locality ?? '', city: place?.city ?? 'Delhi', state: place?.state ?? 'Delhi', pincode: place?.pincode ?? '', lat: place?.lat ?? null, lng: place?.lng ?? null, isDefault: !addrs.data?.length });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (existing) setF({ ...existing, street: existing.street ?? '', landmark: existing.landmark ?? '', locality: existing.locality ?? '', contactPhone: existing.contactPhone.replace('+91', '') }); }, [existing]);
  const set = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }));

  const useGps = async () => { const p = await detect(); if (p) set({ locality: p.locality ?? '', city: p.city ?? f.city, state: p.state ?? f.state, pincode: p.pincode ?? '', lat: p.lat ?? null, lng: p.lng ?? null }); };
  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const body = { ...f, street: f.street || null, landmark: f.landmark || null, locality: f.locality || null };
      const a = await api<Address>(id ? `/me/addresses/${id}` : '/me/addresses', { method: id ? 'PUT' : 'POST', body });
      await qc.invalidateQueries({ queryKey: qk.addresses });
      if (!a.serviceability.serviceable) { setErr(a.serviceability.message); return; }
      checkout.set({ addressId: a.id });
      router.back();
    } catch (e) { setErr(errorMessage(e)); } finally { setSaving(false); }
  };
  const valid = f.contactName.trim().length > 1 && /^[6-9]\d{9}$/.test(f.contactPhone) && f.houseNo.trim() && /^\d{6}$/.test(f.pincode) && f.city.trim();

  return (
    <Screen padded={false} scroll={false} keyboard>
      <Header title={id ? 'Edit address' : 'Add address'} onBack={() => router.back()} />
      <Screen edges={[]}>
        <Button title={detecting ? 'Detecting…' : 'Use current location'} icon="navigate" kind="secondary" size="md" onPress={useGps} loading={detecting} />
        {f.lat ? <T v="small" color={colors.success} style={{ marginTop: 6 }}>📍 Location pinned — helps the technician find you</T> : null}
        <Gap h={16} />
        <Field label="House / flat no. & building *" value={f.houseNo} onChangeText={(t) => set({ houseNo: t })} placeholder="e.g. H-12, 2nd floor" />
        <Field label="Street / area" value={f.street} onChangeText={(t) => set({ street: t })} placeholder="e.g. Gali no. 4" />
        <Field label="Landmark" value={f.landmark} onChangeText={(t) => set({ landmark: t })} placeholder="e.g. Near metro station" />
        <Field label="Locality" value={f.locality} onChangeText={(t) => set({ locality: t })} placeholder="e.g. Sant Nagar, Burari" />
        <Row gap={10}>
          <Field style={{ flex: 1 }} label="Pincode *" value={f.pincode} onChangeText={(t) => set({ pincode: t.replace(/\D/g, '').slice(0, 6) })} keyboardType="number-pad" maxLength={6} />
          <Field style={{ flex: 1 }} label="City *" value={f.city} onChangeText={(t) => set({ city: t })} />
        </Row>
        <Field label="State *" value={f.state} onChangeText={(t) => set({ state: t })} />
        <Gap h={4} />
        <T v="h3" color={colors.ink}>Contact at this address</T>
        <Gap h={8} />
        <Field label="Name *" value={f.contactName} onChangeText={(t) => set({ contactName: t })} />
        <Field label="Mobile *" value={f.contactPhone} onChangeText={(t) => set({ contactPhone: t.replace(/\D/g, '').slice(-10) })} keyboardType="phone-pad" maxLength={10} />
        <T v="small" color={colors.slate} style={{ marginBottom: 8 }}>Save as</T>
        <Row gap={8}>{(['HOME', 'WORK', 'OTHER'] as const).map((l) => <Chip key={l} label={l.charAt(0) + l.slice(1).toLowerCase()} icon={l === 'HOME' ? 'home-outline' : l === 'WORK' ? 'briefcase-outline' : 'location-outline'} active={f.label === l} onPress={() => set({ label: l })} />)}</Row>
        <Gap h={16} />
        <Toggle value={f.isDefault} onChange={(v) => set({ isDefault: v })} label="Make this my default address" />
        {err ? <><Gap /><Banner tone="danger" title={err} /></> : null}
        <Gap h={40} />
      </Screen>
      <StickyFooter><Button title="Save address" onPress={save} loading={saving} disabled={!valid} /></StickyFooter>
    </Screen>
  );
}
