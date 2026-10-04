import React, { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Button, Card, Icon, Row, StatusBadge, T, colors, inr, shortDate } from '@kit';
import type { JobSummary } from '@/lib/types';

export function JobCard({ j, onAccept, onReject, busy }: { j: JobSummary; onAccept?: () => void; onReject?: () => void; busy?: boolean }) {
  const [left, setLeft] = useState(() => (j.offer ? Math.max(0, Math.floor((new Date(j.offer.expiresAt).getTime() - Date.now()) / 1000)) : 0));
  useEffect(() => { if (!j.offer) return; const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000); return () => clearInterval(t); }, [j.offer]);
  return (
    <Card style={{ marginBottom: 12, borderWidth: j.offer ? 1.5 : 1, borderColor: j.offer ? colors.orange : '#EEF1F7' }} onPress={() => router.push({ pathname: '/job/[id]', params: { id: j.id } })}>
      <Row justify="space-between">
        <T v="tiny" color={colors.muted}>{j.code}</T>
        {j.offer ? <T v="small" color={left < 60 ? colors.danger : colors.orangeDark}>⏱ {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} to respond</T> : <StatusBadge status={j.status} />}
      </Row>
      <T v="h3" color={colors.ink} style={{ marginTop: 6 }} numberOfLines={2}>{j.services}</T>
      <Row gap={14} style={{ marginTop: 6, flexWrap: 'wrap' }}>
        <Row gap={4}><Icon name="calendar-outline" size={15} /><T v="small" color={colors.slate}>{j.isAsap ? 'ASAP' : `${shortDate(j.scheduledDate)}, ${j.slotLabel}`}</T></Row>
        <Row gap={4}><Icon name="location-outline" size={15} /><T v="small" color={colors.slate}>{j.city} {j.pincode}{j.offer?.distanceKm != null ? ` · ${j.offer.distanceKm} km` : ''}</T></Row>
      </Row>
      <T v="small" color={colors.muted} style={{ marginTop: 6 }}>Job value {inr(j.grandTotal)}</T>
      {j.offer ? (
        <Row gap={10} style={{ marginTop: 12 }}>
          <Button title="Reject" kind="danger" full={false} style={{ flex: 1 }} onPress={onReject} disabled={busy} />
          <Button title="Accept" kind="success" full={false} style={{ flex: 1.4 }} onPress={onAccept} loading={busy} disabled={left === 0} />
        </Row>
      ) : null}
    </Card>
  );
}
