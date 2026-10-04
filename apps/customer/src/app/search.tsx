import React, { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Banner, Chip, EmptyState, Gap, Icon, IconButton, Row, Screen, SkeletonList, T, api, colors, font, radius, webNoOutline } from '@kit';
import { ServiceCard } from '@/components/ServiceCard';
import { CartBar } from '@/components/CartBar';
import type { Service } from '@/lib/types';

const EXAMPLES = ['AC not cooling', 'Fridge not cooling', 'Washing machine not spinning', 'Microwave not heating', 'AC gas refill', 'AC installation'];

export default function Search() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<{ results: Service[]; categorySlug: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return; }
    setLoading(true); setErr(false);
    const t = setTimeout(() => api<{ results: Service[]; categorySlug: string | null }>(`/search?q=${encodeURIComponent(q.trim())}`, { auth: false })
      .then(setRes).catch(() => setErr(true)).finally(() => setLoading(false)), 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <Screen padded={false} scroll={false}>
      <View style={{ padding: 12, paddingBottom: 4 }}>
        <Row gap={4}>
          <IconButton icon="chevron-back" label="Back" onPress={() => router.back()} />
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 50, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.blue, backgroundColor: colors.white, paddingHorizontal: 14 }}>
            <Icon name="search" color={colors.blue} />
            <TextInput autoFocus value={q} onChangeText={setQ} placeholder="What do you need repaired?" placeholderTextColor={colors.muted} returnKeyType="search" accessibilityLabel="Search services"
              style={[{ flex: 1, fontFamily: font.medium, fontSize: 16, color: colors.ink }, webNoOutline]} />
            {q ? <Pressable onPress={() => setQ('')} accessibilityLabel="Clear search"><Icon name="close-circle" color={colors.muted} /></Pressable> : null}
          </View>
        </Row>
      </View>
      <Screen edges={[]}>
        {!res && !loading ? <>
          <T v="h3" color={colors.ink}>Try searching for</T>
          <Gap h={10} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{EXAMPLES.map((e) => <Chip key={e} label={e} icon="trending-up" onPress={() => setQ(e)} />)}</View>
        </> : null}
        {loading && !res ? <SkeletonList rows={3} h={110} /> : null}
        {err ? <Banner tone="danger" title="Search failed. Check your connection and try again." /> : null}
        {res && !res.results.length ? <EmptyState icon="search" title="No matching service" body="Try a simpler phrase like “AC repair” or browse categories from home." action="Browse categories" onAction={() => router.back()} /> : null}
        {res?.results.length ? <>
          <Banner tone="info" title="Not sure what’s wrong?" body="Start with a Checkup. The technician will diagnose the problem and share prices for anything else before doing it." />
          <Gap h={12} />
          {res.results.map((s) => <ServiceCard key={s.id} s={s} />)}
        </> : null}
        <Gap h={80} />
      </Screen>
      <CartBar />
    </Screen>
  );
}
