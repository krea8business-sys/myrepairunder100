import React, { useState } from 'react';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Button, Card, EmptyState, ErrorState, Gap, Header, Row, Screen, SkeletonList, T, Toast, colors, inr, radius } from '@kit';
import { View } from 'react-native';
import { useOffers } from '@/lib/queries';

export default function Offers() {
  const q = useOffers();
  const [toast, setToast] = useState<string | null>(null);
  return (
    <Screen padded={false} scroll={false}>
      <Header title="Offers & coupons" onBack={() => router.back()} />
      <Screen edges={[]} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
        {q.isLoading ? <SkeletonList /> : q.isError ? <ErrorState message="Unable to load offers." onRetry={() => q.refetch()} /> : !q.data?.coupons.length ? <EmptyState icon="pricetag-outline" title="No offers right now" body="Check back soon for seasonal offers." /> :
          q.data.coupons.map((c) => (
            <Card key={c.code} style={{ marginBottom: 12 }}>
              <Row justify="space-between" align="flex-start">
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <T v="h3" color={colors.ink}>{c.title}</T>
                  {c.description ? <T v="small" color={colors.muted} style={{ marginTop: 2 }}>{c.description}</T> : null}
                  <T v="small" color={colors.slate} style={{ marginTop: 6 }}>
                    {c.minOrder ? `Min. order ${inr(c.minOrder)}` : 'No minimum'}{c.maxDiscount ? ` · Up to ${inr(c.maxDiscount)} off` : ''}{c.newUsersOnly ? ' · First booking only' : ''}
                  </T>
                  {c.expiresAt ? <T v="small" color={colors.muted}>Valid till {new Date(c.expiresAt).toLocaleDateString('en-IN')}</T> : null}
                </View>
                <View style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.orange, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.orangeTint }}>
                  <T v="bodyStrong" color={colors.orangeDark}>{c.code}</T>
                </View>
              </Row>
              <Gap h={10} />
              <Button title="Copy code" kind="secondary" size="sm" full={false} icon="copy-outline" onPress={async () => { await Clipboard.setStringAsync(c.code); setToast(`${c.code} copied — apply it at checkout`); }} />
            </Card>
          ))}
      </Screen>
      <Toast message={toast} onHide={() => setToast(null)} />
    </Screen>
  );
}
