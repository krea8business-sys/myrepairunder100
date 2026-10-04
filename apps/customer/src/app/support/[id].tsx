import React, { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, ErrorState, Field, Gap, Header, Loading, Row, Screen, StickyFooter, T, api, colors, dateTime, radius } from '@kit';

type Ticket = { id: string; code: string; subject: string; status: string; category: string; messages: { id: string; authorType: string; message: string; createdAt: string }[] };

export default function TicketDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['ticket', id], queryFn: () => api<Ticket>(`/support/tickets/${id}`), refetchInterval: 30_000 });
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const send = async () => { setBusy(true); try { await api(`/support/tickets/${id}/messages`, { body: { message: msg.trim() } }); setMsg(''); await q.refetch(); } finally { setBusy(false); } };
  const t = q.data;
  return (
    <Screen padded={false} scroll={false} keyboard>
      <Header title={t?.code ?? 'Ticket'} subtitle={t?.subject} onBack={() => router.back()} right={t ? <View style={{ paddingRight: 12 }}><Badge label={t.status.replace('_', ' ')} /></View> : null} />
      {q.isLoading ? <Loading /> : q.isError || !t ? <ErrorState message="Unable to load ticket." onRetry={() => q.refetch()} /> : (
        <Screen edges={[]}>
          {t.messages.map((m) => {
            const mine = m.authorType !== 'ADMIN';
            return (
              <View key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '85%', backgroundColor: mine ? colors.blueTint : colors.white, borderRadius: radius.lg, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: colors.line }}>
                <T v="tiny" color={mine ? colors.blue : colors.orangeDark}>{mine ? 'YOU' : 'SUPPORT TEAM'}</T>
                <T style={{ marginTop: 4 }}>{m.message}</T>
                <T v="tiny" color={colors.muted} style={{ marginTop: 4 }}>{dateTime(m.createdAt)}</T>
              </View>
            );
          })}
          <Gap h={30} />
        </Screen>
      )}
      <StickyFooter>
        <Row gap={8} align="flex-end"><Field style={{ flex: 1, marginBottom: 0 }} value={msg} onChangeText={setMsg} placeholder="Add a message" multiline /><Button title="Send" full={false} disabled={!msg.trim()} loading={busy} onPress={send} /></Row>
      </StickyFooter>
    </Screen>
  );
}
