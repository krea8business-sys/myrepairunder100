import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Banner, Button, ErrorState, Gap, Header, Screen, SkeletonList, StickyFooter, T, api, colors, errorMessage, radius } from '@kit';
import { qk, useSlots } from '@/lib/queries';

export default function Reschedule() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useSlots();
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const day = q.data?.days.find((d) => d.date === (date ?? q.data?.days[0]?.date));
  const save = async () => {
    setBusy(true); setErr(null);
    try { qc.setQueryData(qk.booking(String(id)), await api(`/bookings/${id}/reschedule`, { body: { date: day?.date, slotId: slot } })); qc.invalidateQueries({ queryKey: ['bookings'] }); router.back(); }
    catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Screen padded={false} scroll={false}>
      <Header title="Reschedule" onBack={() => router.back()} />
      <Screen edges={[]}>
        <Banner tone="info" title="Rescheduling may change your technician" body="We’ll re-assign the best available technician for the new time." />
        <Gap h={16} />
        {q.isLoading ? <SkeletonList rows={2} h={60} /> : q.isError ? <ErrorState message="Unable to load slots." onRetry={() => q.refetch()} /> : <>
          <ScrollView horizontal contentContainerStyle={{ gap: 10 }} showsHorizontalScrollIndicator={false}>
            {q.data?.days.map((d) => { const on = d.date === day?.date; return (
              <Pressable key={d.date} onPress={() => { setDate(d.date); setSlot(null); }} style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1.5, borderColor: on ? colors.blue : colors.line, backgroundColor: on ? colors.blueTint : colors.white }}>
                <T v="bodyStrong" color={on ? colors.blue : colors.ink}>{d.label}</T>
              </Pressable>); })}
          </ScrollView>
          <Gap h={16} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {day?.slots.map((s) => { const on = slot === s.id; return (
              <Pressable key={s.id} disabled={!s.available} onPress={() => setSlot(s.id)} style={{ width: '47%', height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1.5, borderColor: on ? colors.blue : colors.line, backgroundColor: on ? colors.blue : colors.white, opacity: s.available ? 1 : 0.4 }}>
                <T v="bodyStrong" color={on ? colors.white : colors.ink}>{s.label}</T>
              </Pressable>); })}
          </View>
          {err ? <><Gap /><Banner tone="danger" title={err} /></> : null}
        </>}
      </Screen>
      <StickyFooter><Button title="Confirm new time" disabled={!slot} loading={busy} onPress={save} /></StickyFooter>
    </Screen>
  );
}
