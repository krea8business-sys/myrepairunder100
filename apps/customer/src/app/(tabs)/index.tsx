import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApplianceGlyph, Card, ErrorState, Gap, Icon, IconButton, Row, Section, Skeleton, T, colors, inr, radius, shadow } from '@kit';
import { Logo } from '@/components/Logo';
import { CartBar } from '@/components/CartBar';
import { useHome, useNotifications } from '@/lib/queries';
import { useLocation } from '@/lib/location';
import { useSession } from '@/lib/session';
import { track } from '@/lib/analytics';
import type { Offer } from '@/lib/types';

const THEMES: Record<string, [string, string, string]> = {
  orange: [colors.orange, '#FF8A3D', colors.white], blue: [colors.blue, '#3D6BEA', colors.white], navy: [colors.navy, colors.navy2, colors.white], green: [colors.success, '#2BA56A', colors.white],
};
const goOffer = (o: Offer) => {
  if (o.ctaTarget === 'referral') return router.push('/(tabs)/refer');
  if (o.ctaTarget?.startsWith('category:')) return router.push({ pathname: '/category/[slug]', params: { slug: o.ctaTarget.slice(9) } });
  router.push('/offers');
};

export default function Home() {
  const home = useHome();
  const { place } = useLocation();
  const { status } = useSession();
  const notes = useNotifications(status === 'signedIn');
  const d = home.data;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }} stickyHeaderIndices={[1]}>
        {/* Header */}
        <View style={{ paddingHorizontal: 16, paddingTop: 6, backgroundColor: colors.bg }}>
          <Row justify="space-between">
            <Logo size={30} />
            <Row gap={0}>
              <IconButton icon="notifications-outline" label="Notifications" badge={notes.data?.unread} onPress={() => router.push('/notifications')} />
              <IconButton icon="person-circle-outline" label="Profile" onPress={() => router.push('/(tabs)/profile')} />
            </Row>
          </Row>
          <Pressable onPress={() => router.push('/location')} accessibilityRole="button" accessibilityLabel={`Location ${place?.label ?? 'not set'}. Change location`} style={{ marginTop: 6 }}>
            <Row gap={6}>
              <Icon name="location" size={18} color={colors.orange} />
              <T v="h3" color={colors.ink} numberOfLines={1} style={{ flexShrink: 1 }}>{place?.label ?? 'Select location'}</T>
              <Icon name="chevron-down" size={16} color={colors.ink} />
            </Row>
            <T v="small" color={colors.muted} style={{ marginLeft: 24 }}>{place?.sublabel}</T>
          </Pressable>
          {d?.testMode ? <View style={{ marginTop: 8, padding: 8, borderRadius: radius.md, backgroundColor: colors.warningTint }}><T v="small" color={colors.warning}>Test mode · OTP is shown on screen and payments are simulated.</T></View> : null}
          {d?.features.homeNotice ? <View style={{ marginTop: 8, padding: 10, borderRadius: radius.md, backgroundColor: colors.blueTint }}><T v="small" color={colors.blueDark}>{d.features.homeNotice}</T></View> : null}
          {place?.serviceable === false ? <View style={{ marginTop: 8, padding: 10, borderRadius: radius.md, backgroundColor: colors.dangerTint }}><T v="small" color={colors.danger}>Sorry, we currently don't service this location. Try another address.</T></View> : null}
        </View>
        {/* Sticky search (Admin → Features → Search bar) */}
        <View style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.bg, display: d && !d.features.search ? 'none' : 'flex' }}>
          <Pressable onPress={() => router.push('/search')} accessibilityRole="search" accessibilityLabel="Search: what do you need repaired?"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 54, borderRadius: radius.lg, backgroundColor: colors.white, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.line, ...shadow.card }}>
            <Icon name="search" size={20} color={colors.blue} />
            <T color={colors.muted}>{d?.features.searchPlaceholder ?? 'What do you need repaired?'}</T>
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          {home.isError ? <ErrorState message="Unable to load services right now." onRetry={() => home.refetch()} /> : null}

          {/* Categories */}
          <Gap h={8} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {(d?.categories ?? Array.from({ length: 4 })).map((c, i) => c ? (
              <Card key={c.id} style={{ width: '47.5%', minHeight: 176 }} accessibilityLabel={`${c.name}, starting at ${inr(c.startingPrice)}`}
                onPress={() => { track('category_click', { category: c.slug }); router.push({ pathname: '/category/[slug]', params: { slug: c.slug } }); }}>
                <ApplianceGlyph kind={c.icon} />
                <T v="h3" color={colors.ink} style={{ marginTop: 10 }}>{c.name}</T>
                <T v="small" color={colors.muted} numberOfLines={2} style={{ marginTop: 2 }}>{c.shortDescription}</T>
                <View style={{ flex: 1 }} />
                <Row justify="space-between" style={{ marginTop: 10 }}>
                  <T v="small" color={colors.ink}>from <T v="bodyStrong" color={colors.orangeDark}>{inr(c.startingPrice)}</T></T>
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' }}><Icon name="arrow-forward" size={16} color={colors.white} /></View>
                </Row>
              </Card>
            ) : <Skeleton key={i} h={176} w="47.5%" r={radius.lg} />)}
          </View>

          {/* Offers */}
          {d?.offers.length ? (
            <Section title="Offers for you" action="See all" onAction={() => router.push('/offers')}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 16 }}>
                {d.offers.map((o) => {
                  const [bg, , fg] = THEMES[o.theme] ?? THEMES.blue;
                  return (
                    <Pressable key={o.id} onPress={() => goOffer(o)} accessibilityRole="button" style={{ width: 280, minHeight: 128, borderRadius: radius.lg, padding: 16, backgroundColor: bg, overflow: 'hidden' }}>
                      <View style={{ position: 'absolute', right: -30, top: -30, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.12)' }} />
                      <T v="h2" color={fg}>{o.title}</T>
                      {o.subtitle ? <T v="small" color={fg} style={{ opacity: 0.9, marginTop: 4 }}>{o.subtitle}</T> : null}
                      <View style={{ flex: 1 }} />
                      {o.ctaLabel ? <View style={{ alignSelf: 'flex-start', marginTop: 12, backgroundColor: colors.white, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}><T v="small" color={bg}>{o.ctaLabel}</T></View> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Section>
          ) : null}

          {/* Popular */}
          <Section title="Popular services">
            {home.isLoading ? <Skeleton h={120} r={radius.lg} /> : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 16 }}>
                {d?.popular.map((s) => (
                  <Card key={s.id} style={{ width: 168 }} onPress={() => router.push({ pathname: '/service/[id]', params: { id: s.id } })} accessibilityLabel={s.name}>
                    <ApplianceGlyph kind={d.categories.find((c) => c.id === s.categoryId)?.icon ?? 'wrench'} size={22} box={40} bg={colors.orangeTint} color={colors.orange} />
                    <T v="bodyStrong" color={colors.ink} style={{ marginTop: 10, minHeight: 44 }} numberOfLines={2}>{s.name}</T>
                    <T v="small" color={colors.muted}>{s.isStartingPrice ? 'from ' : ''}<T v="bodyStrong" color={colors.ink}>{inr(s.price)}</T></T>
                  </Card>
                ))}
              </ScrollView>
            )}
          </Section>

          {/* Refer banner */}
          {d?.referral ? (
            <Pressable onPress={() => router.push('/(tabs)/refer')} accessibilityRole="button" style={{ marginTop: 24, borderRadius: radius.lg, backgroundColor: colors.navy, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center' }}><Icon name="gift" size={26} color={colors.white} /></View>
              <View style={{ flex: 1 }}>
                <T v="h3" color={colors.white}>{d.features.referBannerTitle}</T>
                <T v="small" color="#C9D6FF">Get {inr(d.referral.referrerReward)} when they complete their first service</T>
              </View>
              <View style={{ backgroundColor: colors.white, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 }}><T v="small" color={colors.navy}>Refer Now</T></View>
            </Pressable>
          ) : null}

          {/* Why choose us — admin-entered stats only */}
          {d && (d.whyChooseUs.length || d.company.publicStats.length) ? (
            <Section title="Why choose us">
              <Card>
                {d.company.publicStats.length ? <Row justify="space-around" style={{ marginBottom: 14 }}>
                  {d.company.publicStats.slice(0, 3).map((st) => <View key={st.label} style={{ alignItems: 'center' }}><T v="h1" color={colors.navy}>{st.value}</T><T v="small" color={colors.muted}>{st.label}</T></View>)}
                </Row> : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 }}>
                  {d.whyChooseUs.map((w) => (
                    <Row key={w} gap={8} style={{ width: '50%', paddingRight: 8 }} align="flex-start">
                      <Icon name="checkmark-circle" size={18} color={colors.success} />
                      <T v="small" color={colors.text} style={{ flex: 1 }}>{w}</T>
                    </Row>
                  ))}
                </View>
              </Card>
            </Section>
          ) : null}
          <Gap h={24} />
          <T v="small" color={colors.muted} center>{d?.company.tagline}</T>
        </View>
      </ScrollView>
      <CartBar />
    </SafeAreaView>
  );
}
