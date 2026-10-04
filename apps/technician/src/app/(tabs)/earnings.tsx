import React from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Card, EmptyState, ErrorState, Gap, Row, Screen, SkeletonList, T, api, colors, inr, shortDate } from '@kit';

type E = { days: { day: string; jobs: number; serviceValue: number; earning: number; cashCollected: number }[]; summary: { today: { jobs: number; earning: number; cash: number }; week: { jobs: number; earning: number; cash: number }; last60Days: { jobs: number; earning: number; cash: number }; payoutRateBps: number } };
export default function Earnings() {
  const q = useQuery({ queryKey: ['earnings'], queryFn: () => api<E>('/technician/earnings') });
  const s = q.data?.summary;
  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <T v="h1" color={colors.ink}>Earnings</T>
      <Gap />
      {q.isLoading ? <SkeletonList rows={3} /> : q.isError ? <ErrorState message="Unable to load earnings." onRetry={() => q.refetch()} /> : s ? <>
        <Row gap={10}>
          {[['Today', s.today], ['This week', s.week], ['60 days', s.last60Days]].map(([l, v]) => {
            const x = v as E['summary']['today'];
            return <Card key={String(l)} style={{ flex: 1 }}><T v="small" color={colors.muted}>{String(l)}</T><T v="h3" color={colors.ink}>{inr(Math.round(x.earning / 100) * 100)}</T><T v="tiny" color={colors.muted}>{x.jobs} JOBS</T></Card>;
          })}
        </Row>
        <Gap />
        <Card><Row justify="space-between"><T color={colors.slate}>Cash collected (to deposit)</T><T v="h3" color={colors.warning}>{inr(s.last60Days.cash)}</T></Row><T v="small" color={colors.muted} style={{ marginTop: 4 }}>Your share: {s.payoutRateBps / 100}% of service value (excl. spare parts at cost, as agreed with admin).</T></Card>
        <Gap h={20} />
        <T v="h2" color={colors.ink}>Daily breakdown</T>
        <Gap h={10} />
        {!q.data!.days.length ? <EmptyState icon="cash-outline" title="No completed jobs yet" /> : <Card padded={false} style={{ paddingHorizontal: 16 }}>
          {q.data!.days.map((d, i) => (
            <Row key={d.day} justify="space-between" style={{ paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}>
              <View><T v="bodyStrong">{shortDate(d.day)}</T><T v="small" color={colors.muted}>{d.jobs} job{d.jobs > 1 ? 's' : ''} · value {inr(d.serviceValue)}</T></View>
              <T v="h3" color={colors.success}>{inr(d.earning)}</T>
            </Row>
          ))}
        </Card>}
      </> : null}
    </Screen>
  );
}
