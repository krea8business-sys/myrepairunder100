import React, { useEffect } from 'react';
import { FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { EmptyState, Header, Screen, T, api, colors, relative } from '@kit';

export default function Notifications() {
  const q = useQuery({ queryKey: ['notes'], queryFn: () => api<{ items: { id: string; title: string; body: string; createdAt: string; readAt: string | null; data: { bookingId?: string } }[] }>('/technician/notifications') });
  useEffect(() => { api('/technician/notifications/read', { body: {} }).catch(() => undefined); }, []);
  return (
    <Screen padded={false} scroll={false}>
      <Header title="Notifications" onBack={() => router.back()} />
      <FlatList data={q.data?.items ?? []} keyExtractor={(n) => n.id} contentContainerStyle={{ padding: 16, flexGrow: 1 }} ListEmptyComponent={<EmptyState icon="notifications-off-outline" title="No notifications" />}
        renderItem={({ item: n }) => (
          <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line }}>
            <T v="bodyStrong" color={colors.ink} onPress={n.data?.bookingId ? () => router.push({ pathname: '/job/[id]', params: { id: n.data?.bookingId ?? '' } }) : undefined}>{n.title}</T>
            <T v="small" color={colors.slate}>{n.body}</T><T v="tiny" color={colors.muted}>{relative(n.createdAt)}</T>
          </View>
        )} />
    </Screen>
  );
}
