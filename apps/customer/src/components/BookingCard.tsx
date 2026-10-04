import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Card, Icon, Row, StatusBadge, T, colors, inr, shortDate } from '@kit';
import type { BookingSummary } from '@/lib/types';

export function BookingCard({ b }: { b: BookingSummary }) {
  return (
    <Card onPress={() => router.push({ pathname: '/booking/[id]', params: { id: b.id } })} accessibilityLabel={`Booking ${b.code}, ${b.services}`} style={{ marginBottom: 12 }}>
      <Row justify="space-between">
        <T v="tiny" color={colors.muted}>{b.code}</T>
        <StatusBadge status={b.status} />
      </Row>
      <T v="h3" color={colors.ink} style={{ marginTop: 8 }} numberOfLines={2}>{b.services}</T>
      <Row gap={14} style={{ marginTop: 8, flexWrap: 'wrap' }}>
        <Row gap={4}><Icon name="calendar-outline" size={15} /><T v="small" color={colors.slate}>{b.isAsap ? 'ASAP' : `${shortDate(b.scheduledDate)}, ${b.slotLabel}`}</T></Row>
        {b.technicianName ? <Row gap={4}><Icon name="person-outline" size={15} /><T v="small" color={colors.slate}>{b.technicianName}</T></Row> : null}
      </Row>
      <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 10 }} />
      <Row justify="space-between">
        <T v="bodyStrong" color={colors.ink}>{inr(b.grandTotal)}</T>
        {b.amountDue > 0 && b.status === 'PAYMENT_PENDING' ? <T v="small" color={colors.warning}>Pay {inr(b.amountDue)}</T>
          : b.warrantyUntil && b.status === 'COMPLETED' ? <T v="small" color={colors.success}>Warranty till {shortDate(b.warrantyUntil)}</T>
          : <T v="small" color={colors.muted}>{b.paymentStatus === 'PAID' ? 'Paid' : b.paymentStatus === 'PENDING' ? 'Pay after service' : b.paymentStatus.replaceAll('_', ' ').toLowerCase()}</T>}
      </Row>
    </Card>
  );
}
