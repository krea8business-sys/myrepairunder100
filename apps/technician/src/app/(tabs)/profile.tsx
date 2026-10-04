import React from 'react';
import { View, Image } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Badge, Card, Gap, Icon, ListRow, Row, Screen, SkeletonList, T, api, colors, maskPhone } from '@kit';
import { useSession } from '@/lib/session';
import { DocumentsCard } from '@/components/DocumentsCard';

type Me = { code: string; name: string | null; phone: string; status: string; photoUrl: string | null; rating: number | null; ratingCount: number; completedJobs: number; experienceYears: number | null; skills: { id: string; name: string }[]; serviceAreas: { pincode: string; area: string | null }[] };
export default function Profile() {
  const { signOut } = useSession();
  const q = useQuery({ queryKey: ['techMe'], queryFn: () => api<Me>('/technician/me') });
  const m = q.data;
  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      {!m ? <SkeletonList rows={3} /> : <>
        <Row gap={14}>
          {m.photoUrl ? <Image source={{ uri: m.photoUrl }} style={{ width: 64, height: 64, borderRadius: 32 }} /> : <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.blueTint, alignItems: 'center', justifyContent: 'center' }}><Icon name="person" size={30} color={colors.blue} /></View>}
          <View style={{ flex: 1 }}>
            <T v="h1" color={colors.ink}>{m.name}</T>
            <T color={colors.muted}>{maskPhone(m.phone)} · {m.code}</T>
            <Badge label={m.status} fg={m.status === 'APPROVED' ? colors.success : colors.warning} bg={m.status === 'APPROVED' ? colors.successTint : colors.warningTint} />
          </View>
        </Row>
        <Gap />
        <Row gap={10}>
          <Card style={{ flex: 1, alignItems: 'center' }}><T v="h2" color={colors.navy}>{m.rating != null ? `★ ${m.rating}` : '—'}</T><T v="small" color={colors.muted}>{m.ratingCount} ratings</T></Card>
          <Card style={{ flex: 1, alignItems: 'center' }}><T v="h2" color={colors.navy}>{m.completedJobs}</T><T v="small" color={colors.muted}>Jobs done</T></Card>
          <Card style={{ flex: 1, alignItems: 'center' }}><T v="h2" color={colors.navy}>{m.experienceYears ?? '—'}</T><T v="small" color={colors.muted}>Years exp.</T></Card>
        </Row>
        <Gap />
        <Card>
          <T v="h3" color={colors.ink}>Skills</T>
          <Row gap={6} style={{ flexWrap: 'wrap', marginTop: 8 }}>{m.skills.map((s) => <Badge key={s.id} label={s.name} />)}</Row>
          <Gap h={14} />
          <T v="h3" color={colors.ink}>Service areas</T>
          <T v="small" color={colors.slate} style={{ marginTop: 6 }}>{m.serviceAreas.map((a) => `${a.pincode}${a.area ? ` (${a.area})` : ''}`).join(', ')}</T>
          <T v="small" color={colors.muted} style={{ marginTop: 6 }}>Skills and areas are managed by the admin.</T>
        </Card>
        <Gap />
        <DocumentsCard />
        <Gap />
        <Card padded={false} style={{ paddingHorizontal: 16 }}>
          <ListRow icon="notifications-outline" title="Notifications" onPress={() => router.push('/notifications')} />
          <ListRow icon="log-out-outline" title="Log out" danger onPress={async () => { await signOut(); router.replace('/login'); }} />
        </Card>
      </>}
    </Screen>
  );
}
