import React, { useState } from 'react';
import { router } from 'expo-router';
import { Banner, Button, Field, Gap, Screen, T, api, colors, errorMessage } from '@kit';
import { useSession } from '@/lib/session';

export default function ProfileSetup() {
  const { user, refreshUser } = useSession();
  const [name, setName] = useState(user?.name ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setLoading(true); setError(null);
    try { await api('/me', { method: 'PATCH', body: { name: name.trim() } }); await refreshUser(); router.replace('/'); }
    catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  };
  return (
    <Screen keyboard bg={colors.white} edges={['top', 'bottom']}>
      <Gap h={40} />
      <T v="display" color={colors.ink}>What should we call you?</T>
      <T color={colors.slate} style={{ marginTop: 6 }}>Your technician will see this name.</T>
      <Gap h={24} />
      <Field label="Full name" value={name} onChangeText={setName} placeholder="Your name" autoComplete="name" textContentType="name" autoFocus />
      {error ? <Banner tone="danger" title={error} /> : null}
      <Gap h={16} />
      <Button title="Continue" onPress={save} loading={loading} disabled={name.trim().length < 2} />
    </Screen>
  );
}
