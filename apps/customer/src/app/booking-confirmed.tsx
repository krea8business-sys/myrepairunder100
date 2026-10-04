import React from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, Gap, Icon, Row, Screen, T, colors, shortDate } from '@kit';
import { useBooking } from '@/lib/queries';

export default function BookingConfirmed() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const b = useBooking(String(id));
  return (
    <Screen bg={colors.white} edges={['top', 'bottom']}>
      <Gap h={40} />
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.successTint, alignItems: 'center', justifyContent: 'center' }}><Icon name="checkmark-circle" size={64} color={colors.success} /></View>
        <Gap h={20} />
        <T v="display" center color={colors.ink}>Booking confirmed!</T>
        <T center color={colors.slate} style={{ marginTop: 6 }}>We’re assigning the best available technician near you. You’ll get a notification once assigned.</T>
      </View>
      <Gap h={28} />
      {b.data ? (
        <Card>
          <Row justify="space-between"><T v="small" color={colors.muted}>Booking ID</T><T v="bodyStrong">{b.data.code}</T></Row>
          <Gap h={8} />
          <Row justify="space-between"><T v="small" color={colors.muted}>When</T><T v="bodyStrong">{b.data.isAsap ? 'ASAP' : `${shortDate(b.data.scheduledDate)}, ${b.data.slotLabel}`}</T></Row>
          <Gap h={8} />
          <Row justify="space-between" align="flex-start"><T v="small" color={colors.muted}>Services</T><T v="bodyStrong" style={{ flex: 1, textAlign: 'right', marginLeft: 16 }}>{b.data.items.map((i) => i.name).join(', ')}</T></Row>
        </Card>
      ) : null}
      <Gap h={28} />
      <Button title="Track booking" icon="navigate-outline" onPress={() => router.replace({ pathname: '/booking/[id]', params: { id: String(id) } })} />
      <Gap h={10} />
      <Button title="Back to home" kind="ghost" onPress={() => router.replace('/(tabs)')} />
    </Screen>
  );
}
