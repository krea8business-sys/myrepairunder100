import React from 'react';
import { View } from 'react-native';
import { Banner, Card, EmptyState, ErrorState, Gap, Icon, Row, Screen, Skeleton, SkeletonList, T, colors, dateTime, inr, radius } from '@kit';
import { useWallet, useWalletTx } from '@/lib/queries';

const SRC: Record<string, string> = { REFERRAL_REWARD: 'Referral reward', REFERRAL_WELCOME: 'Welcome reward', PROMO: 'Promotional credit', CASHBACK: 'Cashback', REFUND: 'Refund', BOOKING: 'Used on booking', ADMIN_CREDIT: 'Credit', ADMIN_DEBIT: 'Adjustment', EXPIRY: 'Expired', REVERSAL: 'Reversal' };

export default function Wallet() {
  const w = useWallet();
  const tx = useWalletTx();
  const s = w.data?.summary;
  return (
    <Screen onRefresh={() => { w.refetch(); tx.refetch(); }} refreshing={w.isRefetching}>
      <T v="h1" color={colors.ink} accessibilityRole="header">Wallet</T>
      <Gap />
      {w.isError ? <ErrorState message="Unable to load wallet." onRetry={() => w.refetch()} /> : (
        <View style={{ borderRadius: radius.xl, backgroundColor: colors.navy, padding: 20, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', right: -40, top: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(242,90,12,0.25)' }} />
          <T v="small" color="#C9D6FF">Available balance</T>
          {w.isLoading ? <Skeleton h={40} w={140} style={{ marginTop: 6 }} /> : <T v="display" color={colors.white} style={{ fontSize: 38, lineHeight: 46 }}>{inr(w.data?.balance)}</T>}
          <T v="small" color="#C9D6FF" style={{ marginTop: 6 }}>Use it at checkout — turn on “Use wallet balance”.</T>
        </View>
      )}
      {s ? <>
        <Gap />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {[['Earned', s.earned, 'trending-up'], ['Used', s.used, 'cart-outline'], ['Refunds', s.refunds, 'return-down-back'], ['Referral rewards', s.referralRewards, 'gift-outline'], ['Promotional', s.promotional, 'pricetag-outline']].map(([l, v, i]) => (
            <Card key={String(l)} style={{ width: '48%', padding: 14 }} padded={false}>
              <Row gap={6}><Icon name={i as 'gift-outline'} size={16} color={colors.blue} /><T v="small" color={colors.muted}>{l}</T></Row>
              <T v="h3" color={colors.ink} style={{ marginTop: 4 }}>{inr(Number(v))}</T>
            </Card>
          ))}
        </View>
      </> : null}
      {w.data?.expiringSoon ? <><Gap /><Banner tone="warn" title={`${inr(w.data.expiringSoon.amount)} expires on ${new Date(w.data.expiringSoon.expiresAt).toLocaleDateString('en-IN')}`} body="Use it on your next booking." /></> : null}
      {w.data ? <T v="small" color={colors.muted} style={{ marginTop: 12 }}>Up to {inr(w.data.rules.maxUsePerBooking)} per booking ({w.data.rules.maxUsePercentBps / 100}% of the bill) on bookings of {inr(w.data.rules.minBookingValue)} or more.</T> : null}
      <Gap h={20} />
      <T v="h2" color={colors.ink}>Transactions</T>
      <Gap />
      {tx.isLoading ? <SkeletonList rows={3} h={60} /> : !tx.data?.items.length ? <EmptyState icon="wallet-outline" title="No transactions yet" body="Rewards, refunds and wallet payments will show up here." /> : (
        <Card padded={false} style={{ paddingHorizontal: 16 }}>
          {tx.data.items.map((t, i) => (
            <View key={t.id} style={{ paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}>
              <Row justify="space-between" align="flex-start">
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <T v="bodyStrong" color={colors.ink}>{SRC[t.source] ?? t.source}</T>
                  <T v="small" color={colors.muted} numberOfLines={2}>{t.description}</T>
                  <T v="tiny" color={colors.muted} style={{ marginTop: 2 }}>{dateTime(t.createdAt)} · ID {t.id.slice(0, 8).toUpperCase()}{t.expiresAt && t.type === 'CREDIT' ? ` · expires ${new Date(t.expiresAt).toLocaleDateString('en-IN')}` : ''}</T>
                </View>
                <T v="h3" color={t.type === 'CREDIT' ? colors.success : colors.ink}>{t.type === 'CREDIT' ? '+' : '−'}{inr(t.amount)}</T>
              </Row>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
