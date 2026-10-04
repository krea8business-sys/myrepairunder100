import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { colors, radius } from '@kit';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { TrackingFallback } from './TrackingFallback';

/** Google Maps needs an API key on Android (set GOOGLE_MAPS_ANDROID_KEY when building). Without it, show the map-free card instead of crashing. */
const hasMapsKey = Platform.OS !== 'android' || !!(Constants.expoConfig?.android?.config?.googleMaps?.apiKey);

type P = { lat: number; lng: number };
/** Native map: customer pin + live technician pin. */
export function TrackingMap({ customer, technician, height = 260 }: { customer: P | null; technician: P | null; height?: number }) {
  if (!hasMapsKey) return <TrackingFallback customer={customer} technician={technician} />;
  const ref = useRef<MapView>(null);
  useEffect(() => {
    const pts = [customer, technician].filter(Boolean) as P[];
    if (pts.length > 1) ref.current?.fitToCoordinates(pts.map((p) => ({ latitude: p.lat, longitude: p.lng })), { edgePadding: { top: 60, bottom: 60, left: 60, right: 60 }, animated: true });
  }, [customer, technician]);
  const center = technician ?? customer ?? { lat: 28.6139, lng: 77.209 };
  return (
    <View style={{ height, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.line }}>
      <MapView ref={ref} style={{ flex: 1 }} provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={{ latitude: center.lat, longitude: center.lng, latitudeDelta: 0.04, longitudeDelta: 0.04 }} toolbarEnabled={false}>
        {customer ? <Marker coordinate={{ latitude: customer.lat, longitude: customer.lng }} title="Your location" pinColor={colors.blue} /> : null}
        {technician ? <Marker coordinate={{ latitude: technician.lat, longitude: technician.lng }} title="Technician" pinColor={colors.orange} /> : null}
      </MapView>
    </View>
  );
}
