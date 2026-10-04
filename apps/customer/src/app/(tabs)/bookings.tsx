import React, { useState } from 'react';
import { FlatList, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Chip, EmptyState, ErrorState, Screen, SkeletonList, T, colors } from '@kit';
import { BookingCard } from '@/components/BookingCard';
import { useBookings } from '@/lib/queries';

const TABS = [['upcoming', 'Upcoming'], ['active', 'Active'], ['completed', 'Completed'], ['cancelled', 'Cancelled']] as const;
const EMPTY: Record<string, string> = { upcoming: 'No upcoming bookings', active: 'Nothing in progress', completed: 'No completed bookings yet', cancelled: 'No cancelled bookings' };

export default function Bookings() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('upcoming');
  const q = useBookings(tab);
  return (
    <Screen padded={false} scroll={false}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}><T v="h1" color={colors.ink} accessibilityRole="header">My bookings</T></View>
      <View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, padding: 16, paddingBottom: 8 }}>
        {TABS.map(([k, l]) => <Chip key={k} label={l} active={tab === k} onPress={() => setTab(k)} />)}
      </ScrollView></View>
      {q.isLoading ? <View style={{ padding: 16 }}><SkeletonList /></View> : q.isError ? <ErrorState message="Unable to load bookings." onRetry={() => q.refetch()} /> : (
        <FlatList data={q.data?.items ?? []} keyExtractor={(b) => b.id} renderItem={({ item }) => <BookingCard b={item} />} contentContainerStyle={{ padding: 16, paddingTop: 8, flexGrow: 1 }}
          onRefresh={() => q.refetch()} refreshing={q.isRefetching}
          ListEmptyComponent={<EmptyState icon="calendar-outline" title={EMPTY[tab]} body={tab === 'upcoming' ? 'Book a repair in under a minute.' : undefined} action={tab === 'upcoming' ? 'Book a service' : undefined} onAction={() => router.push('/(tabs)')} />} />
      )}
    </Screen>
  );
}
