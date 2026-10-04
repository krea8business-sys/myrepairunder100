import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { secure } from '@kit';

/** Deep link https://<domain>/ref/<CODE> → remembered and pre-filled on the login screen. */
export default function RefLink() {
  const { code } = useLocalSearchParams<{ code: string }>();
  useEffect(() => { if (code) void secure.set('mru.pendingReferral', String(code).toUpperCase()); }, [code]);
  return <Redirect href="/" />;
}
