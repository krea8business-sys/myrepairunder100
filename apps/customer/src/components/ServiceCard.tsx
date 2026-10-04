import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Badge, Button, Card, PriceText, QtyStepper, Row, T, colors, minutes } from '@kit';
import type { Service } from '@/lib/types';
import { useCart, useCartMutations } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { track } from '@/lib/analytics';

/** Large, scannable service card with an inline Add / quantity control bound to the server cart. */
export function ServiceCard({ s, compact }: { s: Service; compact?: boolean }) {
  const { status } = useSession();
  const cart = useCart(status === 'signedIn');
  const m = useCartMutations();
  const inCart = cart.data?.items.find((i) => i.serviceId === s.id);
  const busy = m.add.isPending || m.setQty.isPending;
  const add = () => {
    if (status !== 'signedIn') return router.push('/login');
    track('add_to_cart', { service: s.slug });
    m.add.mutate(s.id);
  };
  return (
    <Card onPress={() => router.push({ pathname: '/service/[id]', params: { id: s.id } })} accessibilityLabel={`${s.name}, ${s.isStartingPrice ? 'starting at' : ''} ${s.price / 100} rupees`} style={{ marginBottom: 12 }}>
      <Row align="flex-start" gap={12}>
        <View style={{ flex: 1 }}>
          <Row gap={6} style={{ marginBottom: 4, flexWrap: 'wrap' }}>
            {s.popular ? <Badge label="Popular" fg={colors.orangeDark} bg={colors.orangeTint} /> : null}
            {s.warrantyDays ? <Badge label={`${s.warrantyDays}-day warranty`} fg={colors.success} bg={colors.successTint} icon="shield-checkmark" /> : null}
          </Row>
          <T v="h3" color={colors.ink}>{s.name}</T>
          {!compact && s.shortDescription ? <T v="small" color={colors.muted} style={{ marginTop: 2 }} numberOfLines={2}>{s.shortDescription}</T> : null}
          <Row gap={10} style={{ marginTop: 8 }}>
            <PriceText price={s.price} mrp={s.mrp} starting={s.isStartingPrice} />
          </Row>
          <T v="small" color={colors.muted} style={{ marginTop: 2 }}>⏱ {minutes(s.durationMins)}{s.isStartingPrice ? ' · Parts extra if needed' : ''}</T>
        </View>
        <View style={{ alignItems: 'flex-end', justifyContent: 'flex-end', minWidth: 96 }}>
          {inCart ? <QtyStepper value={inCart.quantity} max={s.maxQuantity} onChange={(q) => (q === 0 ? m.remove.mutate(s.id) : m.setQty.mutate({ serviceId: s.id, quantity: q }))} />
            : <Button title="Add" icon="add" size="sm" kind="secondary" full={false} onPress={add} loading={busy && m.add.variables === s.id} />}
        </View>
      </Row>
    </Card>
  );
}
