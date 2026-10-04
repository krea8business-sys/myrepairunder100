import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Banner, Card, EmptyState, Gap, Row, Screen, SkeletonList, T, api, colors, errorMessage, inr, radius, useSocketEvents } from '@kit';
import { Pressable } from 'react-native';
import { Logo } from '@/components/Logo';
import { JobCard } from '@/components/JobCard';
import { useSession } from '@/lib/session';
import type { JobSummary } from '@/lib/types';

type Dash = { availability: 'AVAILABLE' | 'BUSY' | 'OFFLINE'; counts: { jobRequests: number; today: number; assigned: number }; earnings: { today: { jobs: number; earning: number }; week: { earning: number } } };
const AV = [['AVAILABLE', 'Available', colors.success], ['BUSY', 'Busy', colors.warning], ['OFFLINE', 'Offline', colors.muted]] as const;

export default function Home() {
  const { me } = useSession();
  const qc = useQueryClient();
  const dash = useQuery({ queryKey: ['dash'], queryFn: () => api<Dash>('/technician/dashboard'), refetchInterval: 30_000 });
  const reqs = useQuery({ queryKey: ['jobs', 'requests'], queryFn: () => api<JobSummary[]>('/technician/jobs?tab=requests'), refetchInterval: 20_000 });
  const [busy, setBusy] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['dash'] }); qc.invalidateQueries({ queryKey: ['jobs'] }); };
  useSocketEvents({ 'job:offer': refresh, 'job:taken': refresh, 'job:expired': refresh, 'job:assigned': refresh, 'job:cancelled': refresh });

  const setAv = async (a: string) => { setErr(null); try { await api('/technician/availability', { body: { availability: a } }); refresh(); } catch (e) { setErr(errorMessage(e)); } };
  const respond = async (id: string, accept: boolean) => {
    setBusy(id); setErr(null);
    try { await api(`/technician/jobs/${id}/${accept ? 'accept' : 'reject'}`, { body: {} }); refresh(); if (accept) router.push({ pathname: '/job/[id]', params: { id } }); }
    catch (e) { setErr(errorMessage(e)); refresh(); } finally { setBusy(null); }
  };
  const d = dash.data;
  return (
    <Screen onRefresh={refresh} refreshing={dash.isRefetching}>
      <Row justify="space-between"><Logo size={28} /><T v="small" color={colors.muted}>{me?.code}</T></Row>
      <Gap h={16} />
      <T v="h1" color={colors.ink}>Hi {me?.name?.split(' ')[0] ?? 'there'} 👋</T>
      <Gap h={12} />
      <View style={{ flexDirection: 'row', backgroundColor: colors.white, borderRadius: radius.lg, padding: 4, borderWidth: 1, borderColor: colors.line }}>
        {AV.map(([k, l, c]) => {
          const on = d?.availability === k;
          return <Pressable key={k} onPress={() => setAv(k)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={{ flex: 1, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c : 'transparent' }}>
            <T v="bodyStrong" color={on ? colors.white : colors.slate}>{l}</T>
          </Pressable>;
        })}
      </View>
      <T v="small" color={colors.muted} style={{ marginTop: 6 }}>{d?.availability === 'AVAILABLE' ? 'You will receive new job requests.' : d?.availability === 'BUSY' ? 'New requests are paused.' : 'You are offline. Your location is never shared while offline.'}</T>
      {err ? <><Gap /><Banner tone="danger" title={err} /></> : null}
      <Gap h={16} />
      <Row gap={10}>
        {[['Requests', d?.counts.jobRequests], ['Today', d?.counts.today], ['Assigned', d?.counts.assigned]].map(([l, v]) => (
          <Card key={String(l)} style={{ flex: 1, alignItems: 'center' }} onPress={() => router.push('/(tabs)/jobs')}><T v="h1" color={colors.navy}>{v ?? '–'}</T><T v="small" color={colors.muted}>{l}</T></Card>
        ))}
      </Row>
      <Gap />
      <Card style={{ backgroundColor: colors.navy, borderColor: colors.navy }} onPress={() => router.push('/(tabs)/earnings')}>
        <Row justify="space-between">
          <View><T v="small" color="#C9D6FF">Today’s earnings</T><T v="h1" color={colors.white}>{inr(d?.earnings.today.earning ?? 0)}</T></View>
          <View style={{ alignItems: 'flex-end' }}><T v="small" color="#C9D6FF">This week</T><T v="h3" color={colors.white}>{inr(d?.earnings.week.earning ?? 0)}</T></View>
        </Row>
      </Card>
      <Gap h={20} />
      <T v="h2" color={colors.ink}>New job requests</T>
      <Gap h={10} />
      {reqs.isLoading ? <SkeletonList rows={2} h={150} /> : !reqs.data?.length ? <EmptyState icon="notifications-outline" title="No new requests" body={d?.availability === 'AVAILABLE' ? 'New jobs near you will appear here.' : 'Go Available to receive job requests.'} />
        : reqs.data.map((j) => <JobCard key={j.id} j={j} busy={busy === j.id} onAccept={() => respond(j.id, true)} onReject={() => respond(j.id, false)} />)}
    </Screen>
  );
}
