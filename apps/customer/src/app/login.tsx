import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Banner, Button, Field, Gap, Screen, T, api, colors, errorMessage, secure } from '@kit';
import { Logo } from '@/components/Logo';
import { useFeatures } from '@/lib/queries';

export default function Login() {
  const feat = useFeatures();
  const [phone, setPhone] = useState('');
  const [ref, setRef] = useState('');
  const [showRef, setShowRef] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = /^[6-9]\d{9}$/.test(phone);
  useEffect(() => { secure.get('mru.pendingReferral').then((c) => { if (c) { setRef(c); setShowRef(true); } }); }, []);

  const send = async () => {
    setLoading(true); setError(null);
    try {
      const r = await api<{ phone: string; devOtp?: string; resendIn: number; expiresIn: number }>('/auth/send-otp', { body: { phone }, auth: false });
      router.push({ pathname: '/otp', params: { phone: r.phone, ref: ref.trim(), dev: r.devOtp ?? '', resendIn: String(r.resendIn), expiresIn: String(r.expiresIn) } });
    } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  };

  return (
    <Screen keyboard bg={colors.white} edges={['top', 'bottom']}>
      <Gap h={24} />
      <Logo size={40} />
      {feat.testMode ? <><Gap /><Banner tone="warn" title="Test mode" body="Your OTP will be shown on screen and payments are simulated. No real money is charged." /></> : null}
      <Gap h={36} />
      <T v="display" color={colors.ink}>Login or sign up</T>
      <T color={colors.slate} style={{ marginTop: 6 }}>We’ll send a one-time password to your mobile number. No password needed.</T>
      <Gap h={28} />
      <Field label="Mobile number" value={phone} onChangeText={(t) => setPhone(t.replace(/\D/g, '').slice(-10))} keyboardType="phone-pad" maxLength={10} placeholder="98765 43210" autoComplete="tel" textContentType="telephoneNumber"
        left={<View style={{ paddingRight: 10, borderRightWidth: 1, borderRightColor: colors.line }}><T v="bodyStrong" color={colors.ink}>🇮🇳 +91</T></View>} error={phone.length === 10 && !valid ? 'Enter a valid Indian mobile number' : null} />
      {showRef ? <Field label="Referral code (optional)" value={ref} onChangeText={(t) => setRef(t.toUpperCase())} autoCapitalize="characters" placeholder="MRUXXXXX" maxLength={16} /> : null}
      {!showRef ? <Button title="Have a referral code?" kind="ghost" size="sm" full={false} onPress={() => setShowRef(true)} /> : null}
      {error ? <><Gap /><Banner tone="danger" title={error} /></> : null}
      <Gap h={24} />
      <Button title="Get OTP" onPress={send} loading={loading} disabled={!valid} />
      <Gap h={16} />
      <T v="small" color={colors.muted} center>
        By continuing you agree to our{' '}
        <T v="small" color={colors.blue} accessibilityRole="link" style={{ textDecorationLine: 'underline' }}>Terms</T> and{' '}
        <T v="small" color={colors.blue} accessibilityRole="link" style={{ textDecorationLine: 'underline' }}>Privacy Policy</T>.
      </T>
      <Gap h={4} />
      <Button title="Read terms & privacy" kind="ghost" size="sm" full={false} style={{ alignSelf: 'center' }} onPress={() => router.push('/legal/terms')} />
    </Screen>
  );
}
