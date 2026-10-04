import React, { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, Gap, Header, Icon, ListRow, Row, Screen, SkeletonList, T, api, colors, relative } from '@kit';

type Info = { phone: string | null; whatsapp: string | null; email: string | null; faq: { q: string; a: string }[] };
type Ticket = { id: string; code: string; subject: string; category: string; status: string; updatedAt: string };

export default function Support() {
  const info = useQuery({ queryKey: ['supportInfo'], queryFn: () => api<Info>('/support/info') });
  const tickets = useQuery({ queryKey: ['tickets'], queryFn: () => api<Ticket[]>('/support/tickets') });
  const [open, setOpen] = useState<number | null>(0);
  const i = info.data;
  return (
    <Screen padded={false} scroll={false}>
      <Header title="Help & support" onBack={() => router.back()} />
      <Screen edges={[]} onRefresh={() => { info.refetch(); tickets.refetch(); }} refreshing={tickets.isRefetching}>
        <Row gap={10}>
          {i?.phone ? <Button title="Call" icon="call-outline" kind="secondary" full={false} style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${i.phone}`)} /> : null}
          {i?.whatsapp ? <Button title="WhatsApp" icon="logo-whatsapp" kind="success" full={false} style={{ flex: 1 }} onPress={() => Linking.openURL(`https://wa.me/${i.whatsapp?.replace(/\D/g, '')}`)} /> : null}
        </Row>
        {!i?.phone && !i?.whatsapp && info.data ? <T v="small" color={colors.muted}>Raise a ticket below and our team will get back to you.</T> : null}
        <Gap h={16} />
        <T v="h2" color={colors.ink}>Raise a ticket</T>
        <Gap h={8} />
        <Card padded={false} style={{ paddingHorizontal: 16 }}>
          {[['BOOKING', 'Booking issue', 'calendar-outline'], ['PAYMENT', 'Payment issue', 'card-outline'], ['TECHNICIAN', 'Technician issue', 'person-outline'], ['WARRANTY', 'Warranty issue', 'shield-checkmark-outline'], ['REFUND', 'Refund issue', 'return-down-back-outline'], ['OTHER', 'Something else', 'help-circle-outline']].map(([k, l, ic]) => (
            <ListRow key={k} icon={ic as 'card-outline'} title={l} onPress={() => router.push({ pathname: '/support/new', params: { category: k } })} />
          ))}
        </Card>
        {tickets.data?.length ? <>
          <Gap h={20} />
          <T v="h2" color={colors.ink}>Your tickets</T>
          <Gap h={8} />
          {tickets.data.map((t) => (
            <Card key={t.id} style={{ marginBottom: 10 }} onPress={() => router.push({ pathname: '/support/[id]', params: { id: t.id } })}>
              <Row justify="space-between"><T v="tiny" color={colors.muted}>{t.code}</T><Badge label={t.status.replace('_', ' ')} fg={t.status === 'RESOLVED' || t.status === 'CLOSED' ? colors.success : colors.blue} bg={t.status === 'RESOLVED' || t.status === 'CLOSED' ? colors.successTint : colors.blueTint} /></Row>
              <T v="bodyStrong" style={{ marginTop: 6 }}>{t.subject}</T>
              <T v="small" color={colors.muted}>Updated {relative(t.updatedAt)}</T>
            </Card>
          ))}
        </> : tickets.isLoading ? <SkeletonList rows={1} /> : null}
        <Gap h={20} />
        <T v="h2" color={colors.ink}>FAQ</T>
        <Gap h={8} />
        <Card padded={false} style={{ paddingHorizontal: 16 }}>
          {i?.faq.map((f, k) => (
            <Pressable key={k} onPress={() => setOpen(open === k ? null : k)} accessibilityRole="button" accessibilityState={{ expanded: open === k }} style={{ paddingVertical: 14, borderTopWidth: k ? 1 : 0, borderTopColor: colors.line }}>
              <Row justify="space-between"><T v="bodyStrong" style={{ flex: 1 }}>{f.q}</T><Icon name={open === k ? 'chevron-up' : 'chevron-down'} /></Row>
              {open === k ? <T color={colors.slate} style={{ marginTop: 8 }}>{f.a}</T> : null}
            </Pressable>
          ))}
        </Card>
        <View style={{ height: 30 }} />
      </Screen>
    </Screen>
  );
}
