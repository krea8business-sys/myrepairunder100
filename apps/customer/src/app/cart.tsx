import React from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Banner, BillRow, Button, Card, Divider, EmptyState, ErrorState, Gap, Header, QtyStepper, Row, Screen, SkeletonList, StickyFooter, T, colors, inr, minutes } from '@kit';
import { useCart, useCartMutations } from '@/lib/queries';
import { track } from '@/lib/analytics';

export default function Cart() {
  const cart = useCart();
  const m = useCartMutations();
  const c = cart.data;
  const totalMins = c?.items.reduce((a, i) => a + i.durationMins * i.quantity, 0) ?? 0;
  return (
    <Screen padded={false} scroll={false}>
      <Header title="Your cart" onBack={() => router.back()} />
      {cart.isLoading ? <View style={{ padding: 16 }}><SkeletonList rows={3} /></View> : cart.isError ? <ErrorState message="Unable to load your cart." onRetry={() => cart.refetch()} /> : !c?.items.length ? (
        <EmptyState icon="cart-outline" title="Your cart is empty" body="Add a service to book a technician." action="Browse services" onAction={() => router.replace('/(tabs)')} />
      ) : <>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
          {c.removedUnavailable.length ? <><Banner tone="warn" title="Some services were removed" body={`${c.removedUnavailable.join(', ')} ${c.removedUnavailable.length > 1 ? 'are' : 'is'} no longer available.`} /><Gap /></> : null}
          <Card>
            {c.items.map((i, idx) => (
              <View key={i.id}>
                {idx ? <Divider /> : null}
                <Row align="flex-start" gap={12}>
                  <View style={{ flex: 1 }}>
                    <T v="bodyStrong" color={colors.ink}>{i.name}</T>
                    <T v="small" color={colors.muted}>{i.isStartingPrice ? 'Starting price · ' : ''}{inr(i.unitPrice)} each</T>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <QtyStepper small value={i.quantity} max={i.maxQuantity} onChange={(n) => (n === 0 ? m.remove.mutate(i.serviceId) : m.setQty.mutate({ serviceId: i.serviceId, quantity: n }))} />
                    <T v="bodyStrong" color={colors.ink}>{inr(i.unitPrice * i.quantity)}</T>
                  </View>
                </Row>
              </View>
            ))}
            <Divider />
            <Button title="Add another service" kind="ghost" size="md" icon="add" onPress={() => router.replace('/(tabs)')} />
          </Card>
          <Gap h={16} />
          <Card>
            <T v="h3" color={colors.ink} style={{ marginBottom: 6 }}>Price summary</T>
            <BillRow label="Services" value={inr(c.quote.itemsTotal)} />
            {c.quote.taxTotal ? <BillRow label={c.quote.taxInclusive ? 'Taxes (included)' : 'Taxes'} value={inr(c.quote.taxTotal)} /> : null}
            <Divider />
            <BillRow label="Estimated total" value={inr(c.quote.totalBeforeWallet)} strong sub="Apply coupons and wallet at the last step" />
          </Card>
          <Gap h={12} />
          <Banner tone="info" icon="construct-outline" title="Spare parts are extra, only with your approval" body="If something else is needed, your technician will send the price in the app. Nothing is added unless you approve it." />
          <Gap h={8} />
          <T v="small" color={colors.muted} center>Estimated time on site: {minutes(totalMins)}</T>
        </ScrollView>
        <StickyFooter>
          <Button title="Proceed to book" onPress={() => { track('checkout_started'); router.push('/checkout/address'); }} />
          <Button title="Continue shopping" kind="ghost" size="sm" style={{ marginTop: 6, borderWidth: 0 }} onPress={() => router.replace('/(tabs)')} />
        </StickyFooter>
      </>}
    </Screen>
  );
}
