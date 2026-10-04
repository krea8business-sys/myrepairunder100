import React, { useEffect, useRef, useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState, Header, IconButton, Row, Screen, StickyFooter, T, api, colors, font, radius, relative, useSocketEvents } from '@kit';

type Msg = { id: string; senderType: string; message: string; createdAt: string };

/** In-app chat with the assigned technician (no phone numbers exchanged; active jobs only). */
export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['chat', id], queryFn: () => api<Msg[]>(`/bookings/${id}/messages`) });
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const list = useRef<FlatList>(null);
  useSocketEvents({ 'chat:message': (m: Msg) => qc.setQueryData<Msg[]>(['chat', id], (old) => (old?.some((x) => x.id === m.id) ? old : [...(old ?? []), m])) }, String(id));
  useEffect(() => { setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50); }, [q.data?.length]);
  const send = async () => {
    const m = text.trim(); if (!m) return;
    setText(''); setErr(null);
    try { const r = await api<Msg>(`/bookings/${id}/messages`, { body: { message: m } }); qc.setQueryData<Msg[]>(['chat', id], (old) => (old?.some((x) => x.id === r.id) ? old : [...(old ?? []), r])); }
    catch (e) { setErr((e as Error).message); setText(m); }
  };
  return (
    <Screen padded={false} scroll={false} keyboard edges={['top']}>
      <Header title="Chat with technician" onBack={() => router.back()} />
      <FlatList ref={list} data={q.data ?? []} keyExtractor={(m) => m.id} contentContainerStyle={{ padding: 16, gap: 8, flexGrow: 1 }}
        ListEmptyComponent={<EmptyState icon="chatbubbles-outline" title="Say hello" body="Share directions or details about the problem." />}
        renderItem={({ item }) => {
          const mine = item.senderType === 'CUSTOMER';
          return (
            <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%', backgroundColor: mine ? colors.blue : colors.white, borderRadius: radius.lg, borderBottomRightRadius: mine ? 4 : radius.lg, borderBottomLeftRadius: mine ? radius.lg : 4, padding: 12, borderWidth: mine ? 0 : 1, borderColor: colors.line }}>
              <T color={mine ? colors.white : colors.ink}>{item.message}</T>
              <T v="tiny" color={mine ? '#C9D6FF' : colors.muted} style={{ marginTop: 4 }}>{relative(item.createdAt)}</T>
            </View>
          );
        }} />
      {err ? <T v="small" color={colors.danger} style={{ paddingHorizontal: 16 }}>{err}</T> : null}
      <StickyFooter>
        <Row gap={8}>
          <TextInput value={text} onChangeText={setText} placeholder="Type a message" placeholderTextColor={colors.muted} accessibilityLabel="Message" onSubmitEditing={send} returnKeyType="send"
            style={{ flex: 1, height: 46, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 16, fontFamily: font.medium, fontSize: 15, color: colors.ink, backgroundColor: colors.bg }} />
          <IconButton icon="send" label="Send" onPress={send} color={colors.white} bg={colors.blue} />
        </Row>
      </StickyFooter>
    </Screen>
  );
}
