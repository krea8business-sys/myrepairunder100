import React, { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Banner, Button, Gap, Header, OtpInput, Screen, T, api, colors, errorMessage, maskPhone } from '@kit';
import { useSession, type User } from '@/lib/session';

export default function Otp() {
  const p = useLocalSearchParams<{ phone: string; ref?: string; dev?: string; resendIn?: string; expiresIn?: string }>();
  const { signIn, deviceId } = useSession();
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState(p.dev || '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resend, setResend] = useState(Number(p.resendIn ?? 30));
  const [expires, setExpires] = useState(Number(p.expiresIn ?? 300));

  useEffect(() => { const t = setInterval(() => { setResend((s) => Math.max(0, s - 1)); setExpires((s) => Math.max(0, s - 1)); }, 1000); return () => clearInterval(t); }, []);

  const verify = async (code = otp) => {
    if (code.length !== 6) return;
    setLoading(true); setError(null);
    try {
      const r = await api<{ accessToken: string; refreshToken: string; user: User; isNew: boolean }>('/auth/verify-otp', { body: { phone: p.phone, otp: code, app: 'customer', referralCode: p.ref || undefined, deviceId: deviceId ?? undefined }, auth: false });
      await signIn(r);
      router.replace(r.isNew || !r.user.name ? '/profile-setup' : '/');
    } catch (e) { setError(errorMessage(e)); setOtp(''); } finally { setLoading(false); }
  };
  const again = async () => {
    setError(null);
    try { const r = await api<{ devOtp?: string; resendIn: number; expiresIn: number }>('/auth/send-otp', { body: { phone: p.phone }, auth: false }); setResend(r.resendIn); setExpires(r.expiresIn); setDevOtp(r.devOtp ?? ''); }
    catch (e) { setError(errorMessage(e)); }
  };
  const mm = `${Math.floor(expires / 60)}:${String(expires % 60).padStart(2, '0')}`;

  return (
    <Screen keyboard bg={colors.white} edges={['top', 'bottom']} padded={false}>
      <Header title="" onBack={() => router.back()} />
      <Screen scroll padded edges={[]} bg={colors.white}>
        <T v="display" color={colors.ink}>Enter OTP</T>
        <T color={colors.slate} style={{ marginTop: 6 }}>Sent to {maskPhone(p.phone)}</T>
        <Gap h={28} />
        <OtpInput value={otp} onChange={(v) => { setOtp(v); setError(null); if (v.length === 6) void verify(v); }} error={!!error} />
        <Gap h={12} />
        <T v="small" center color={expires ? colors.muted : colors.danger}>{expires ? `Code expires in ${mm}` : 'Code expired — request a new one'}</T>
        {devOtp ? <><Gap /><Banner tone="warn" title={`Development mode OTP: ${devOtp}`} body="Shown only with the mock SMS provider. Never enabled in production." /></> : null}
        {error ? <><Gap /><Banner tone="danger" title={error} /></> : null}
        <Gap h={24} />
        <Button title="Verify & continue" onPress={() => verify()} loading={loading} disabled={otp.length !== 6} />
        <Gap h={12} />
        <Button title={resend ? `Resend OTP in ${resend}s` : 'Resend OTP'} kind="ghost" disabled={resend > 0} onPress={again} />
      </Screen>
    </Screen>
  );
}
