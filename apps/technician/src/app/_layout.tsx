import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans';
import { ApiError, colors } from '@kit';
import { SessionProvider, useSession } from '@/lib/session';
import { registerForPush } from '@/lib/push';

SplashScreen.preventAutoHideAsync().catch(() => undefined);
const qc = new QueryClient({ defaultOptions: { queries: { retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2, staleTime: 10_000, refetchOnWindowFocus: false } } });

function Gate() {
  const { status } = useSession();
  useEffect(() => { if (status !== 'loading') SplashScreen.hideAsync().catch(() => undefined); if (status === 'signedIn') void registerForPush(); }, [status]);
  if (status === 'loading') return null;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }} />;
}

export default function Root() {
  const [loaded] = useFonts({ PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold });
  if (!loaded) return null;
  return <SafeAreaProvider><QueryClientProvider client={qc}><SessionProvider><StatusBar style="dark" /><Gate /></SessionProvider></QueryClientProvider></SafeAreaProvider>;
}
