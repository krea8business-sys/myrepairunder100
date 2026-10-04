import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Badge, Banner, Button, Field, Gap, OtpInput, Screen, T, api, colors, errorMessage, maskPhone } from '@kit';
import { Logo } from '@/components/Logo';
import { useSession } from '@/lib/session';
import { useFeatures } from '@/lib/features';

/** Phone + OTP for technicians (separate account role from customers). */
export default function Login() {
  const { signIn } = useSession();
  const feat = useFeatures();
  const [phone, setPhone] = useState(''); const [sent, setSent] = useState<{ phone: string; dev?: string } | null>(null);
  const [otp, setOtp] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [resend, setResend] = useState(0);
  useEffect(() => { const t = setInterval(() => setResend((s) => Math.max(0, s - 1)), 1000); return () => clearInterval(t); }, []);
  const send = async () => {
    setBusy(true); setErr(null);
    try { const r = await api<{ phone: string; devOtp?: string; resendIn: number }>('/auth/send-otp', { body: { phone }, auth: false }); setSent({ phone: r.phone, dev: r.devOtp }); setResend(r.resendIn); }
    catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };
  const verify = async (code = otp) => {
    if (code.length !== 6 || !sent) return;
    setBusy(true); setErr(null);
    try {
      const r = await api<{ accessToken: string; refreshToken: string; needsTechnicianRegistration: boolean }>('/auth/verify-otp', { body: { phone: sent.phone, otp: code, app: 'technician' }, auth: false });
      await signIn(r, r.needsTechnicianRegistration); router.replace('/');
    } catch (e) { setErr(errorMessage(e)); setOtp(''); } finally { setBusy(false); }
  };
  return (
    <Screen keyboard bg={colors.white} edges={['top', 'bottom']}>
      <Gap h={24} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Logo size={36} /><Badge label="Partner" fg={colors.white} bg={colors.navy} /></View>
      {feat.testMode ? <><Gap /><Banner tone="warn" title="Test mode" body="OTP is shown on screen and payments are simulated." /></> : null}
      <Gap h={32} />
      <T v="display" color={colors.ink}>{sent ? 'Enter OTP' : 'Technician login'}</T>
      <T color={colors.slate} style={{ marginTop: 6 }}>{sent ? `Sent to ${maskPhone(sent.phone)}` : 'Log in with your registered mobile number.'}</T>
      <Gap h={24} />
      {!sent ? <>
        <Field label="Mobile number" value={phone} onChangeText={(t) => setPhone(t.replace(/\D/g, '').slice(-10))} keyboardType="phone-pad" maxLength={10} placeholder="98765 43210" left={<T v="bodyStrong">+91</T>} />
        <Button title="Get OTP" onPress={send} loading={busy} disabled={!/^[6-9]\d{9}$/.test(phone)} />
      </> : <>
        <OtpInput value={otp} onChange={(v) => { setOtp(v); if (v.length === 6) void verify(v); }} error={!!err} />
        {sent.dev ? <><Gap /><Banner tone="warn" title={`Development OTP: ${sent.dev}`} body="Mock SMS provider — never enabled in production." /></> : null}
        <Gap h={20} />
        <Button title="Verify" onPress={() => verify()} loading={busy} disabled={otp.length !== 6} />
        <Gap h={8} />
        <Button title={resend ? `Resend in ${resend}s` : 'Resend OTP'} kind="ghost" disabled={resend > 0} onPress={send} />
        <Button title="Change number" kind="ghost" onPress={() => { setSent(null); setOtp(''); }} />
      </>}
      {err ? <><Gap /><Banner tone="danger" title={err} /></> : null}
    </Screen>
  );
}
