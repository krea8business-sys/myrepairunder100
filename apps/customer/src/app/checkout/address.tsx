import React, { useEffect } from 'react';
import { router } from 'expo-router';
import { Banner, Button, Card, EmptyState, ErrorState, Gap, Header, Icon, Row, Screen, SkeletonList, StickyFooter, T, colors } from '@kit';
import { View, Pressable } from 'react-native';
import { useAddresses } from '@/lib/queries';
import { checkout, useCheckout } from '@/lib/checkout';

/** Step 1 of checkout: confirm where the technician should come. */
export default function CheckoutAddress() {
  const q = useAddresses();
  const d = useCheckout();
  useEffect(() => {
    if (!d.addressId && q.data?.length) { const def = q.data.find((a) => a.isDefault && a.serviceability.serviceable) ?? q.data.find((a) => a.serviceability.serviceable); if (def) checkout.set({ addressId: def.id }); }
  }, [q.data, d.addressId]);
  const sel = q.data?.find((a) => a.id === d.addressId);
  return (
    <Screen padded={false} scroll={false}>
      <Header title="Service address" subtitle="Step 1 of 3" onBack={() => router.back()} />
      <Screen edges={[]}>
        {q.isLoading ? <SkeletonList rows={2} /> : q.isError ? <ErrorState message="Unable to load addresses." onRetry={() => q.refetch()} /> : !q.data?.length ? (
          <EmptyState icon="home-outline" title="Add your address" body="Tell us where the technician should come." action="Add address" onAction={() => router.push('/address-form')} />
        ) : <>
          {q.data.map((a) => {
            const active = a.id === d.addressId; const ok = a.serviceability.serviceable;
            return (
              <Pressable key={a.id} disabled={!ok} onPress={() => checkout.set({ addressId: a.id })} accessibilityRole="radio" accessibilityState={{ selected: active, disabled: !ok }}>
                <Card style={[{ marginBottom: 12, borderWidth: 1.5, borderColor: active ? colors.blue : '#EEF1F7' }, !ok && { opacity: 0.6 }]}>
                  <Row align="flex-start" gap={12}>
                    <Icon name={active ? 'radio-button-on' : 'radio-button-off'} color={active ? colors.blue : colors.muted} size={22} />
                    <View style={{ flex: 1 }}>
                      <Row gap={8}><T v="bodyStrong" color={colors.ink}>{a.label.charAt(0) + a.label.slice(1).toLowerCase()}</T>{a.isDefault ? <T v="tiny" color={colors.blue}>DEFAULT</T> : null}</Row>
                      <T v="small" color={colors.slate} style={{ marginTop: 2 }}>{[a.houseNo, a.street, a.locality].filter(Boolean).join(', ')}</T>
                      <T v="small" color={colors.slate}>{a.landmark ? `Landmark: ${a.landmark} · ` : ''}{a.city} {a.pincode}</T>
                      <T v="small" color={colors.muted}>{a.contactName} · {a.contactPhone}</T>
                      {!ok ? <T v="small" color={colors.danger} style={{ marginTop: 4 }}>{a.serviceability.message}</T> : null}
                    </View>
                    <Pressable hitSlop={10} onPress={() => router.push({ pathname: '/address-form', params: { id: a.id } })} accessibilityLabel="Edit address"><Icon name="create-outline" color={colors.blue} /></Pressable>
                  </Row>
                </Card>
              </Pressable>
            );
          })}
          <Button title="Add new address" kind="ghost" icon="add" onPress={() => router.push('/address-form')} />
          {q.data.every((a) => !a.serviceability.serviceable) ? <><Gap /><Banner tone="danger" title="Sorry, we currently don't service these locations." /></> : null}
        </>}
      </Screen>
      {sel ? <StickyFooter><Button title="Continue" onPress={() => router.push('/checkout/slot')} disabled={!sel.serviceability.serviceable} /></StickyFooter> : null}
    </Screen>
  );
}
