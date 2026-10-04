import { Redirect } from 'expo-router';
import { useSession } from '@/lib/session';
import { useLocation } from '@/lib/location';

/** Splash → onboarding (first run) → login → location permission → home. */
export default function Index() {
  const { status, onboarded } = useSession();
  const { place } = useLocation();
  if (!onboarded) return <Redirect href="/onboarding" />;
  if (status !== 'signedIn') return <Redirect href="/login" />;
  if (!place) return <Redirect href="/location" />;
  return <Redirect href="/(tabs)" />;
}
