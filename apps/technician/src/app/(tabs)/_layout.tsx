import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, font } from '@kit';

const icon = (n: keyof typeof Ionicons.glyphMap, a: keyof typeof Ionicons.glyphMap) => ({ color, focused }: { color: unknown; focused: boolean }) => <Ionicons name={focused ? a : n} size={23} color={color as string} />;
export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.navy, tabBarInactiveTintColor: colors.muted, tabBarStyle: { height: 64, paddingTop: 6, paddingBottom: 8, borderTopColor: colors.line }, tabBarLabelStyle: { fontFamily: font.semibold, fontSize: 11 } }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('speedometer-outline', 'speedometer') }} />
      <Tabs.Screen name="jobs" options={{ title: 'My jobs', tabBarIcon: icon('briefcase-outline', 'briefcase') }} />
      <Tabs.Screen name="earnings" options={{ title: 'Earnings', tabBarIcon: icon('cash-outline', 'cash') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('person-circle-outline', 'person-circle') }} />
    </Tabs>
  );
}
