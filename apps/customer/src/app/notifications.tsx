import React, { useEffect } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { EmptyState, ErrorState, Header, Icon, Row, Screen, SkeletonList, T, api, colors, relative, useSocketEvents } from '@kit';
import { qk, useNotifications } from '@/lib/queries';

const ICON: Record<string, 'checkmark-circle' | 'person' | 'navigate' | 'card' | 'gift' | 'pricetag' | 'construct' | 'notifications' | 'chatbubble'> = {
  BOOKING_CONFIRMED: 'checkmark-circle', TECHNICIAN_ASSIGNED: 'person', TECHNICIAN_ON_THE_WAY: 'navigate', PAYMENT_SUCCESS: 'card', PAYMENT_FAILED: 'card', REFUND_PROCESSED: 'card',
  REFERRAL_REWARD: 'gift', WALLET_CREDIT: 'gift', COUPON_AVAILABLE: 'pricetag', ADDON_REQUESTED: 'construct', CHAT_MESSAGE: 'chatbubble',
};

export default function Notifications() {
  const q = useNotifications();
  const qc = useQueryClient();
  useSocketEvents({ notification: () => qc.invalidateQueries({ queryKey: qk.notifications }) });
  useEffect(() => { if (q.data?.unread) api('/me/notifications/read', { body: {} }).then(() => setTimeout(() => qc.invalidateQueries({ queryKey: qk.notifications }), 2000)).catch(() => undefined); }, [q.data?.unread, qc]);
  return (
    <Screen padded={false} scroll={false}>
      <Header title="Notifications" onBack={() => router.back()} />
      {q.isLoading ? <View style={{ padding: 16 }}><SkeletonList rows={5} h={64} /></View> : q.isError ? <ErrorState message="Unable to load notifications." onRetry={() => q.refetch()} /> : (
        <FlatList data={q.data?.items ?? []} keyExtractor={(n) => n.id} contentContainerStyle={{ padding: 16, flexGrow: 1 }} onRefresh={() => q.refetch()} refreshing={q.isRefetching}
          ListEmptyComponent={<EmptyState icon="notifications-off-outline" title="You’re all caught up" body="Booking updates and offers will appear here." />}
          renderItem={({ item: n }) => (
            <Pressable onPress={() => n.data?.bookingId && router.push({ pathname: '/booking/[id]', params: { id: n.data.bookingId } })} style={{ flexDirection: 'row', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line, opacity: n.readAt ? 0.75 : 1 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.blueTint, alignItems: 'center', justifyContent: 'center' }}><Icon name={ICON[n.type] ?? 'notifications'} color={colors.blue} /></View>
              <View style={{ flex: 1 }}>
                <Row justify="space-between"><T v="bodyStrong" color={colors.ink} style={{ flex: 1 }}>{n.title}</T>{!n.readAt ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.orange }} /> : null}</Row>
                <T v="small" color={colors.slate}>{n.body}</T>
                <T v="tiny" color={colors.muted} style={{ marginTop: 4 }}>{relative(n.createdAt)}</T>
              </View>
            </Pressable>
          )} />
      )}
    </Screen>
  );
}
