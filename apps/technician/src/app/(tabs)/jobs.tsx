import React, { useState } from 'react';
import { FlatList, ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Chip, EmptyState, ErrorState, Screen, SkeletonList, T, api, colors, useSocketEvents } from '@kit';
import { JobCard } from '@/components/JobCard';
import type { JobSummary } from '@/lib/types';

const TABS = [['assigned', 'Assigned'], ['today', 'Today'], ['history', 'History']] as const;
export default function Jobs() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('assigned');
  const q = useQuery({ queryKey: ['jobs', tab], queryFn: () => api<JobSummary[]>(`/technician/jobs?tab=${tab}`) });
  useSocketEvents({ 'job:assigned': () => q.refetch(), 'job:cancelled': () => q.refetch() });
  return (
    <Screen padded={false} scroll={false}>
      <View style={{ padding: 16, paddingBottom: 0 }}><T v="h1" color={colors.ink}>My jobs</T></View>
      <View><ScrollView horizontal contentContainerStyle={{ gap: 8, padding: 16, paddingBottom: 8 }}>{TABS.map(([k, l]) => <Chip key={k} label={l} active={tab === k} onPress={() => setTab(k)} />)}</ScrollView></View>
      {q.isLoading ? <View style={{ padding: 16 }}><SkeletonList /></View> : q.isError ? <ErrorState message="Unable to load jobs." onRetry={() => q.refetch()} /> :
        <FlatList data={q.data ?? []} keyExtractor={(j) => j.id} renderItem={({ item }) => <JobCard j={item} />} contentContainerStyle={{ padding: 16, paddingTop: 8, flexGrow: 1 }} onRefresh={() => q.refetch()} refreshing={q.isRefetching}
          ListEmptyComponent={<EmptyState icon="briefcase-outline" title={tab === 'history' ? 'No past jobs yet' : 'No jobs here'} />} />}
    </Screen>
  );
}
