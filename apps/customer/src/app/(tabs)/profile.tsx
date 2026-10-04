import React, { useState } from 'react';
import { Linking, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Confirm, Divider, Field, Gap, ListRow, Row, Screen, Sheet, T, api, colors, errorMessage, inr, maskPhone } from '@kit';
import { useSession } from '@/lib/session';
import { useConfig, useFeatures, useWallet } from '@/lib/queries';
import { Logo } from '@/components/Logo';

export default function Profile() {
  const { user, signOut, refreshUser } = useSession();
  const w = useWallet();
  const cfg = useConfig();
  const f = useFeatures();
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(user?.name ?? '');
  const [del, setDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => { setBusy(true); try { await api('/me', { method: 'PATCH', body: { name } }); await refreshUser(); setEdit(false); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); } };
  const deleteAccount = async () => { setBusy(true); try { await api('/me', { method: 'DELETE' }); await signOut(); router.replace('/login'); } catch (e) { setErr(errorMessage(e)); setDel(false); } finally { setBusy(false); } };

  return (
    <Screen>
      <Row justify="space-between">
        <View style={{ flex: 1 }}>
          <T v="h1" color={colors.ink}>{user?.name ?? 'Your profile'}</T>
          <T color={colors.muted}>{maskPhone(user?.phone)}</T>
        </View>
        <Button title="Edit" kind="ghost" size="sm" full={false} icon="create-outline" onPress={() => { setName(user?.name ?? ''); setEdit(true); }} />
      </Row>
      <Gap />
      {err ? <T color={colors.danger}>{err}</T> : null}
      <Card padded={false} style={{ paddingHorizontal: 16 }}>
        <ListRow icon="calendar-outline" title="My bookings" onPress={() => router.push('/(tabs)/bookings')} />
        <ListRow icon="location-outline" title="Saved addresses" onPress={() => router.push('/addresses')} />
        {f.wallet ? <ListRow icon="wallet-outline" title="Wallet" sub={w.data ? `Balance ${inr(w.data.balance)}` : undefined} onPress={() => router.push('/(tabs)/wallet')} /> : null}
        {f.coupons ? <ListRow icon="pricetag-outline" title="Coupons & offers" onPress={() => router.push('/offers')} /> : null}
        {f.referEarn ? <ListRow icon="gift-outline" title="Refer & earn" onPress={() => router.push('/(tabs)/refer')} /> : null}
        <ListRow icon="notifications-outline" title="Notifications" onPress={() => router.push('/notifications')} />
      </Card>
      <Gap />
      <Card padded={false} style={{ paddingHorizontal: 16 }}>
        <ListRow icon="help-buoy-outline" title="Help & support" onPress={() => router.push('/support')} />
        {cfg.data?.company.supportPhone ? <ListRow icon="call-outline" title="Call support" sub={cfg.data.company.supportPhone} onPress={() => Linking.openURL(`tel:${cfg.data?.company.supportPhone}`)} /> : null}
        <ListRow icon="document-text-outline" title="Terms & conditions" onPress={() => router.push('/legal/terms')} />
        <ListRow icon="lock-closed-outline" title="Privacy policy" onPress={() => router.push('/legal/privacy')} />
        <ListRow icon="close-circle-outline" title="Cancellation & refund policy" onPress={() => router.push('/legal/cancellation')} />
      </Card>
      <Gap />
      <Card padded={false} style={{ paddingHorizontal: 16 }}>
        <ListRow icon="log-out-outline" title="Log out" onPress={async () => { await signOut(); router.replace('/login'); }} />
        <ListRow icon="trash-outline" title="Delete account" danger onPress={() => setDel(true)} />
      </Card>
      <Gap h={24} />
      <View style={{ alignItems: 'center', opacity: 0.8 }}><Logo size={24} /><T v="tiny" color={colors.muted} style={{ marginTop: 6 }}>VERSION 1.0.0</T></View>

      <Sheet visible={edit} onClose={() => setEdit(false)} title="Edit profile">
        <Field label="Full name" value={name} onChangeText={setName} />
        <Field label="Mobile number" value={maskPhone(user?.phone)} editable={false} hint="Mobile number is your login and can’t be changed here." />
        <Button title="Save" onPress={save} loading={busy} disabled={name.trim().length < 2} />
      </Sheet>
      <Confirm visible={del} title="Delete your account?" danger confirm="Delete permanently" loading={busy} onConfirm={deleteAccount} onCancel={() => setDel(false)}
        body="Your profile, saved addresses and wallet balance will be removed and you’ll be logged out. Invoices and payment records are retained as required by law. This cannot be undone." />
    </Screen>
  );
}
