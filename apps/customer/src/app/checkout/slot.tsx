import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Button, ErrorState, Field, Gap, Header, Icon, Row, Screen, SkeletonList, StickyFooter, T, colors, radius } from '@kit';
import { useSlots } from '@/lib/queries';
import { checkout, useCheckout } from '@/lib/checkout';

/** Step 2: date (Today / Tomorrow / pick) and time slot, or ASAP. Slots are configured in Admin. */
export default function CheckoutSlot() {
  const q = useSlots();
  const d = useCheckout();
  const [day, setDay] = useState<string | null>(d.date ?? null);
  useEffect(() => { if (!day && q.data?.days.length) setDay(q.data.days.find((x) => x.slots.some((s) => s.available))?.date ?? q.data.days[0].date); }, [q.data, day]);
  const current = q.data?.days.find((x) => x.date === day);
  const ready = d.asap || (d.date && d.slotId);

  return (
    <Screen padded={false} scroll={false}>
      <Header title="Date & time" subtitle="Step 2 of 3" onBack={() => router.back()} />
      <Screen edges={[]}>
        {q.isLoading ? <SkeletonList rows={3} h={60} /> : q.isError ? <ErrorState message="Unable to load available slots." onRetry={() => q.refetch()} /> : q.data ? <>
          {q.data.asap.available ? (
            <Pressable onPress={() => checkout.set({ asap: true, date: undefined, slotId: undefined, slotLabel: 'ASAP' })} accessibilityRole="radio" accessibilityState={{ selected: !!d.asap }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: radius.lg, borderWidth: 1.5, borderColor: d.asap ? colors.orange : colors.line, backgroundColor: d.asap ? colors.orangeTint : colors.white, marginBottom: 16 }}>
              <Icon name="flash" color={colors.orange} size={24} />
              <View style={{ flex: 1 }}><T v="bodyStrong" color={colors.ink}>ASAP</T><T v="small" color={colors.muted}>{q.data.asap.label} · subject to technician availability</T></View>
              <Icon name={d.asap ? 'radio-button-on' : 'radio-button-off'} color={d.asap ? colors.orange : colors.muted} />
            </Pressable>
          ) : null}
          <T v="h3" color={colors.ink}>Choose a date</T>
          <Gap h={10} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {q.data.days.map((x) => {
              const on = day === x.date; const any = x.slots.some((s) => s.available);
              return (
                <Pressable key={x.date} onPress={() => setDay(x.date)} disabled={!any} accessibilityRole="button" accessibilityState={{ selected: on, disabled: !any }}
                  style={{ width: 84, paddingVertical: 12, alignItems: 'center', borderRadius: radius.md, borderWidth: 1.5, borderColor: on ? colors.blue : colors.line, backgroundColor: on ? colors.blueTint : colors.white, opacity: any ? 1 : 0.4 }}>
                  <T v="small" color={on ? colors.blue : colors.slate}>{x.label.split(',')[0].split(' ')[0]}</T>
                  <T v="h3" color={on ? colors.blue : colors.ink}>{new Date(x.date + 'T00:00:00').getDate()}</T>
                  <T v="tiny" color={colors.muted}>{new Date(x.date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short' }).toUpperCase()}</T>
                </Pressable>
              );
            })}
          </ScrollView>
          <Gap h={20} />
          <T v="h3" color={colors.ink}>Choose a time</T>
          <Gap h={10} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {current?.slots.map((s) => {
              const on = !d.asap && d.date === current.date && d.slotId === s.id;
              return (
                <Pressable key={s.id} disabled={!s.available} onPress={() => checkout.set({ asap: false, date: current.date, slotId: s.id, slotLabel: s.label })} accessibilityRole="radio" accessibilityState={{ selected: on, disabled: !s.available }}
                  style={{ width: '47%', height: 54, borderRadius: radius.md, borderWidth: 1.5, borderColor: on ? colors.blue : colors.line, backgroundColor: on ? colors.blue : colors.white, alignItems: 'center', justifyContent: 'center', opacity: s.available ? 1 : 0.4 }}>
                  <T v="bodyStrong" color={on ? colors.white : colors.ink}>{s.label}</T>
                  {!s.available ? <T v="tiny" color={colors.muted}>{(s.reason ?? 'Unavailable').toUpperCase()}</T> : null}
                </Pressable>
              );
            })}
          </View>
          <Gap h={20} />
          <Field label="Describe the problem (optional)" value={d.problem ?? ''} onChangeText={(t) => checkout.set({ problem: t })} multiline numberOfLines={3} placeholder="e.g. AC is running but not cooling since yesterday" style={{ marginBottom: 0 }} />
          <Gap h={40} />
        </> : null}
      </Screen>
      <StickyFooter>
        <Button title={ready ? `Continue · ${d.asap ? 'ASAP' : d.slotLabel}` : 'Select a slot'} disabled={!ready} onPress={() => router.push('/checkout/review')} />
      </StickyFooter>
    </Screen>
  );
}
