import React, { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Banner, Button, Chip, Field, Gap, Header, Row, Screen, StickyFooter, T, api, colors, errorMessage } from '@kit';

const CATS = [['BOOKING', 'Booking'], ['PAYMENT', 'Payment'], ['TECHNICIAN', 'Technician'], ['WARRANTY', 'Warranty'], ['REFUND', 'Refund'], ['OTHER', 'Other']] as const;

export default function NewTicket() {
  const p = useLocalSearchParams<{ category?: string; bookingId?: string }>();
  const qc = useQueryClient();
  const [cat, setCat] = useState(p.category ?? (p.bookingId ? 'BOOKING' : 'OTHER'));
  const [subject, setSubject] = useState(''); const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true); setErr(null);
    try { const t = await api<{ id: string }>('/support/tickets', { body: { category: cat, subject: subject.trim(), message: message.trim(), bookingId: p.bookingId || null } }); qc.invalidateQueries({ queryKey: ['tickets'] }); router.replace({ pathname: '/support/[id]', params: { id: t.id } }); }
    catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Screen padded={false} scroll={false} keyboard>
      <Header title="Raise a ticket" onBack={() => router.back()} />
      <Screen edges={[]}>
        {p.bookingId ? <><Banner tone="info" title="This ticket will be linked to your booking." /><Gap /></> : null}
        <T v="small" color={colors.slate}>Category</T>
        <Gap h={8} />
        <Row gap={8} style={{ flexWrap: 'wrap' }}>{CATS.map(([k, l]) => <Chip key={k} label={l} active={cat === k} onPress={() => setCat(k)} />)}</Row>
        <Gap h={16} />
        <Field label="Subject" value={subject} onChangeText={setSubject} placeholder="Short summary" maxLength={160} />
        <Field label="Describe the issue" value={message} onChangeText={setMessage} multiline numberOfLines={6} placeholder="Tell us what happened" style={{ minHeight: 140 }} />
        {err ? <Banner tone="danger" title={err} /> : null}
      </Screen>
      <StickyFooter><Button title="Submit ticket" onPress={submit} loading={busy} disabled={subject.trim().length < 3 || message.trim().length < 5} /></StickyFooter>
    </Screen>
  );
}
