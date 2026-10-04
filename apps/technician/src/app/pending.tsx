import React from 'react';
import { router } from 'expo-router';
import { Banner, Button, Card, Gap, Icon, Row, Screen, T, colors } from '@kit';
import { View } from 'react-native';
import { useSession } from '@/lib/session';
import { DocumentsCard } from '@/components/DocumentsCard';

export default function Pending() {
  const { me, reload, signOut } = useSession();
  return (
    <Screen onRefresh={async () => { await reload(); if (me?.status === 'APPROVED') router.replace('/'); }}>
      <Gap h={20} />
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: colors.warningTint, alignItems: 'center', justifyContent: 'center' }}><Icon name="hourglass-outline" size={42} color={colors.warning} /></View>
        <Gap />
        <T v="h1" center color={colors.ink}>{me?.status === 'SUSPENDED' ? 'Account suspended' : me?.status === 'REJECTED' ? 'Application not approved' : 'Profile under review'}</T>
        <T center color={colors.slate} style={{ marginTop: 6 }}>{me?.status === 'PENDING' ? 'Upload your documents below. You can accept jobs once an admin approves your profile.' : 'Please contact the admin for details.'}</T>
      </View>
      <Gap h={20} />
      <Card><Row justify="space-between"><T color={colors.muted}>Technician ID</T><T v="bodyStrong">{me?.code}</T></Row></Card>
      <Gap />
      {me?.status === 'PENDING' ? <DocumentsCard /> : null}
      <Gap />
      <Banner tone="info" title="Pull down to refresh your status." />
      <Gap />
      <Button title="Check status" onPress={async () => { await reload(); router.replace('/'); }} />
      <Gap h={8} />
      <Button title="Log out" kind="ghost" onPress={signOut} />
    </Screen>
  );
}
