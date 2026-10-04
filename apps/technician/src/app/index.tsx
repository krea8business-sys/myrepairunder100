import { Redirect } from 'expo-router';
import { useSession } from '@/lib/session';

export default function Index() {
  const { status, me } = useSession();
  if (status === 'signedOut') return <Redirect href="/login" />;
  if (status === 'needsRegistration') return <Redirect href="/register" />;
  if (me && me.status !== 'APPROVED') return <Redirect href="/pending" />;
  return <Redirect href="/(tabs)" />;
}
