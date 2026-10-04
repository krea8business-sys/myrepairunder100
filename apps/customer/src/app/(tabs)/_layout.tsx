import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, font } from '@kit';
import { useFeatures } from '@/lib/queries';

const icon = (name: keyof typeof Ionicons.glyphMap, active: keyof typeof Ionicons.glyphMap) => ({ color, focused }: { color: unknown; focused: boolean }) =>
  <Ionicons name={focused ? active : name} size={23} color={color as string} />;

export default function TabsLayout() {
  const f = useFeatures();
  return (
    <Tabs screenOptions={{
      headerShown: false, tabBarActiveTintColor: colors.blue, tabBarInactiveTintColor: colors.muted,
      tabBarStyle: { borderTopColor: colors.line, height: 64, paddingTop: 6, paddingBottom: 8, backgroundColor: colors.white },
      tabBarLabelStyle: { fontFamily: font.semibold, fontSize: 11 },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home-outline', 'home') }} />
      <Tabs.Screen name="bookings" options={{ title: 'Bookings', tabBarIcon: icon('calendar-outline', 'calendar') }} />
      <Tabs.Screen name="wallet" options={{ title: 'Wallet', tabBarIcon: icon('wallet-outline', 'wallet'), href: f.wallet ? undefined : null }} />
      <Tabs.Screen name="refer" options={{ title: 'Refer & Earn', tabBarIcon: icon('gift-outline', 'gift'), href: f.referEarn ? undefined : null }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('person-circle-outline', 'person-circle') }} />
    </Tabs>
  );
}
