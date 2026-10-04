import React from 'react';
import { ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ApplianceGlyph, Badge, Button, Card, ErrorState, Gap, Header, Icon, PriceText, QtyStepper, Row, Screen, SkeletonList, StickyFooter, T, colors, inr, minutes } from '@kit';
import { useCart, useCartMutations, useService } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { ServiceCard } from '@/components/ServiceCard';

const List = ({ items, icon, color }: { items: string[]; icon: 'checkmark-circle' | 'close-circle'; color: string }) => (
  <View style={{ gap: 8 }}>{items.map((i) => <Row key={i} gap={8} align="flex-start"><Icon name={icon} size={18} color={color} /><T style={{ flex: 1 }}>{i}</T></Row>)}</View>
);

export default function ServiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useService(String(id));
  const { status } = useSession();
  const cart = useCart(status === 'signedIn');
  const m = useCartMutations();
  const s = q.data?.service;
  const inCart = cart.data?.items.find((i) => i.serviceId === s?.id);

  return (
    <Screen padded={false} scroll={false}>
      <Header title={q.data?.category.name ?? ''} onBack={() => router.back()} />
      {q.isLoading ? <View style={{ padding: 16 }}><SkeletonList rows={3} h={140} /></View> : q.isError || !s ? <ErrorState message="This service is unavailable." onRetry={() => q.refetch()} /> : <>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
          <Card>
            <Row gap={14} align="flex-start">
              <ApplianceGlyph kind={q.data?.category.slug.split('-')[0] === 'washing' ? 'washer' : q.data?.category.slug.startsWith('refrigerator') ? 'fridge' : q.data?.category.slug.startsWith('microwave') ? 'microwave' : 'ac'} box={60} />
              <View style={{ flex: 1 }}>
                <T v="h1" color={colors.ink}>{s.name}</T>
                <Gap h={6} />
                <PriceText price={s.price} mrp={s.mrp} starting={s.isStartingPrice} big />
              </View>
            </Row>
            <Gap h={12} />
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              <Badge label={minutes(s.durationMins)} icon="time-outline" fg={colors.slate} bg={colors.bg} />
              {s.warrantyDays ? <Badge label={`${s.warrantyDays}-day warranty`} icon="shield-checkmark" fg={colors.success} bg={colors.successTint} /> : <Badge label="No warranty" fg={colors.slate} bg={colors.bg} />}
            </Row>
            {s.description ? <T color={colors.slate} style={{ marginTop: 12 }}>{s.description}</T> : null}
          </Card>
          {s.includes.length ? <><Gap h={16} /><Card><T v="h3" color={colors.ink} style={{ marginBottom: 10 }}>What’s included</T><List items={s.includes} icon="checkmark-circle" color={colors.success} /></Card></> : null}
          {s.excludes.length ? <><Gap h={12} /><Card><T v="h3" color={colors.ink} style={{ marginBottom: 10 }}>Not included</T><List items={s.excludes} icon="close-circle" color={colors.muted} /></Card></> : null}
          {s.sparePartsPolicy ? <><Gap h={12} /><Card style={{ backgroundColor: colors.orangeTint, borderColor: '#FFE0CC' }}><Row gap={8}><Icon name="construct-outline" color={colors.orangeDark} /><T v="h3" color={colors.orangeDark}>Spare parts</T></Row><T style={{ marginTop: 6 }}>{s.sparePartsPolicy}</T></Card></> : null}
          {s.terms ? <><Gap h={12} /><Card><T v="h3" color={colors.ink} style={{ marginBottom: 6 }}>Terms</T><T v="small" color={colors.slate}>{s.terms}</T></Card></> : null}
          {q.data?.related.length ? <><Gap h={24} /><T v="h2" color={colors.ink} style={{ marginBottom: 12 }}>You may also need</T>{q.data?.related.map((r) => <ServiceCard key={r.id} s={r} compact />)}</> : null}
        </ScrollView>
        <StickyFooter>
          <Row gap={12}>
            <View style={{ flex: 1 }}><T v="small" color={colors.muted}>{s.isStartingPrice ? 'Starting at' : 'Price'}</T><T v="h2" color={colors.ink}>{inr(s.price)}</T></View>
            {inCart ? <>
              <QtyStepper value={inCart.quantity} max={s.maxQuantity} onChange={(n) => (n === 0 ? m.remove.mutate(s.id) : m.setQty.mutate({ serviceId: s.id, quantity: n }))} />
              <Button title="View cart" full={false} onPress={() => router.push('/cart')} />
            </> : <Button title="Add to cart" icon="cart-outline" full={false} style={{ paddingHorizontal: 28 }} loading={m.add.isPending}
              onPress={() => (status === 'signedIn' ? m.add.mutate(s.id) : router.push('/login'))} />}
          </Row>
        </StickyFooter>
      </>}
    </Screen>
  );
}
