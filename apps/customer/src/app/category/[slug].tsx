import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ApplianceGlyph, Chip, EmptyState, ErrorState, Gap, Header, Row, Screen, SkeletonList, T, colors, inr } from '@kit';
import { ServiceCard } from '@/components/ServiceCard';
import { CartBar } from '@/components/CartBar';
import { useCategory } from '@/lib/queries';

/** Category → (sub-category filter) → service listing. */
export default function CategoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const q = useCategory(String(slug));
  const [sub, setSub] = useState<string | null>(null);
  const services = useMemo(() => (q.data?.services ?? []).filter((s) => !sub || !s.subcategoryId || s.subcategoryId === sub), [q.data, sub]);
  const minPrice = q.data?.services.length ? Math.min(...q.data.services.map((s) => s.price)) : null;

  return (
    <Screen padded={false} scroll={false}>
      <Header title={q.data?.category.name ?? ''} onBack={() => router.back()} right={undefined} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        {q.isLoading ? <SkeletonList rows={5} h={120} /> : q.isError ? <ErrorState message="Unable to load services." onRetry={() => q.refetch()} /> : q.data ? <>
          <Row gap={14}>
            <ApplianceGlyph kind={q.data.category.icon} box={64} size={34} />
            <View style={{ flex: 1 }}>
              <T v="small" color={colors.muted}>{q.data.category.shortDescription}</T>
              {minPrice != null ? <T v="bodyStrong" color={colors.ink} style={{ marginTop: 4 }}>Services from <T v="bodyStrong" color={colors.orangeDark}>{inr(minPrice)}</T></T> : null}
            </View>
          </Row>
          {q.data.subcategories.length ? <>
            <Gap h={16} />
            <T v="small" color={colors.slate} style={{ marginBottom: 8 }}>Your appliance type</T>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Chip label="All" active={!sub} onPress={() => setSub(null)} />
              {q.data.subcategories.map((s) => <Chip key={s.id} label={s.name} active={sub === s.id} onPress={() => setSub(s.id)} />)}
            </ScrollView>
          </> : null}
          <Gap h={16} />
          {services.length ? services.map((s) => <ServiceCard key={s.id} s={s} />) : <EmptyState title="No services yet" body="Services for this appliance type are coming soon." />}
        </> : null}
      </ScrollView>
      <CartBar />
    </Screen>
  );
}
