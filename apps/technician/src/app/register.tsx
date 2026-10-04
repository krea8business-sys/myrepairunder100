import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Banner, Button, Chip, Field, Gap, Header, Loading, Screen, StickyFooter, T, api, auth, colors, errorMessage } from '@kit';
import { useSession } from '@/lib/session';
import { useFeatures } from '@/lib/features';

/** Self-onboarding. Account stays PENDING until an admin approves it. */
export default function Register() {
  const { reload, signOut } = useSession();
  const feat = useFeatures();
  const opts = useQuery({ queryKey: ['onboarding'], queryFn: () => api<{ categories: { id: string; name: string }[]; pincodes: { pincode: string; area: string | null }[] }>('/technician/onboarding-options') });
  const [name, setName] = useState(''); const [exp, setExp] = useState('');
  const [cats, setCats] = useState<string[]>([]); const [pins, setPins] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const toggle = (arr: string[], set: (v: string[]) => void, v: string) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ accessToken: string; refreshToken: string }>('/technician/register', { body: { name: name.trim(), experienceYears: exp ? Number(exp) : undefined, categoryIds: cats, pincodes: pins } });
      await auth.save(r); await reload(); router.replace('/pending');
    } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Screen padded={false} scroll={false} keyboard>
      <Header title="Join as a technician" right={<Button title="Log out" kind="ghost" size="sm" full={false} onPress={signOut} />} />
      {!feat.selfSignup ? <Screen edges={[]}><Banner tone="info" title="Sign-ups are by invitation" body="Please contact the MyRepairUnder100 team. Once they add your number, log in again." /></Screen> : opts.isLoading ? <Loading /> : <Screen edges={[]}>
        <Field label="Full name (as on ID proof)" value={name} onChangeText={setName} />
        <Field label="Years of experience" value={exp} onChangeText={(t) => setExp(t.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" />
        <T v="h3" color={colors.ink}>Appliances you repair</T>
        <Gap h={8} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{opts.data?.categories.map((c) => <Chip key={c.id} label={c.name} active={cats.includes(c.id)} onPress={() => toggle(cats, setCats, c.id)} />)}</View>
        <Gap h={16} />
        <T v="h3" color={colors.ink}>Areas you can cover</T>
        <Gap h={8} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{opts.data?.pincodes.map((p) => <Chip key={p.pincode} label={`${p.pincode}${p.area ? ' · ' + p.area : ''}`} active={pins.includes(p.pincode)} onPress={() => toggle(pins, setPins, p.pincode)} />)}</View>
        {err ? <><Gap /><Banner tone="danger" title={err} /></> : null}
        <Gap h={30} />
      </Screen>}
      {feat.selfSignup ? <StickyFooter><Button title="Submit for approval" onPress={submit} loading={busy} disabled={name.trim().length < 2 || !cats.length || !pins.length} /></StickyFooter> : null}
    </Screen>
  );
}
