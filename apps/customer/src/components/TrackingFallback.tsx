import React from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Icon, Row, T, colors, radius } from '@kit';

type P = { lat: number; lng: number };
/** Map-free tracking card: used on web, and on Android until a Google Maps key is configured. */
export function TrackingFallback({ customer, technician, height = 200 }: { customer: P | null; technician: P | null; height?: number }) {
  const open = () => technician && customer && Linking.openURL(`https://www.google.com/maps/dir/?api=1&origin=${technician.lat},${technician.lng}&destination=${customer.lat},${customer.lng}`);
  return (
    <View style={{ height, borderRadius: radius.lg, backgroundColor: '#E9F0FF', borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', padding: 16, gap: 10 }}>
      <Row gap={18}>
        <View style={{ alignItems: 'center' }}><Icon name="construct" size={28} color={colors.orange} /><T v="tiny" color={colors.slate}>TECHNICIAN</T></View>
        <View style={{ width: 80, height: 2, backgroundColor: colors.orange, borderStyle: 'dashed' }} />
        <View style={{ alignItems: 'center' }}><Icon name="home" size={28} color={colors.blue} /><T v="tiny" color={colors.slate}>YOU</T></View>
      </Row>
      {technician ? <Pressable onPress={open}><T v="small" color={colors.blue}>Open live route in Google Maps</T></Pressable> : <T v="small" color={colors.muted}>Live location appears when the technician starts travelling.</T>}
    </View>
  );
}
