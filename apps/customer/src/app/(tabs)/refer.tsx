import React, { useState } from 'react';
import { Linking, Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Banner, Button, Card, Divider, ErrorState, Field, Gap, Icon, Row, Screen, Skeleton, T, Toast, api, colors, errorMessage, inr, radius } from '@kit';
import { qk, useReferral } from '@/lib/queries';

export default function Refer() {
  const r = useReferral();
  const qc = useQueryClient();
  const hist = useQuery({ queryKey: ['refHistory'], queryFn: () => api<{ id: string; status: string; reward: number; name: string; createdAt: string }[]>('/me/referral/history') });
  const [toast, setToast] = useState<string | null>(null);
  const [code, setCode] = useState(''); const [applyMsg, setApplyMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const d = r.data;
  const apply = async () => {
    try { const x = await api<{ message: string }>('/me/referral/apply', { body: { code } }); setApplyMsg({ ok: true, text: x.message }); qc.invalidateQueries({ queryKey: qk.referral }); }
    catch (e) { setApplyMsg({ ok: false, text: errorMessage(e) }); }
  };
  if (r.isError) return <Screen><ErrorState message="Unable to load referral details." onRetry={() => r.refetch()} /></Screen>;
  return (
    <Screen onRefresh={() => r.refetch()} refreshing={r.isRefetching}>
      <T v="h1" color={colors.ink} accessibilityRole="header">Refer & Earn</T>
      <Gap />
      <View style={{ borderRadius: radius.xl, backgroundColor: colors.orange, padding: 20 }}>
        <Icon name="gift" size={34} color={colors.white} />
        <T v="h1" color={colors.white} style={{ marginTop: 8 }}>Refer friends and earn rewards.</T>
        {d ? <T color={colors.white} style={{ marginTop: 6, opacity: 0.95 }}>You get {inr(d.rules.referrerReward)}{d.rules.refereeReward ? `, your friend gets ${inr(d.rules.refereeReward)}` : ''} in the wallet after their first completed service of {inr(d.rules.minBookingValue)} or more.</T> : <Skeleton h={40} />}
      </View>
      <Gap />
      {!d?.enabled && d ? <Banner tone="info" title="Referral program is paused right now." /> : null}
      <Card>
        <T v="small" color={colors.muted}>Your referral code</T>
        <Row justify="space-between" style={{ marginTop: 6, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.orange, borderRadius: radius.md, padding: 14, backgroundColor: colors.orangeTint }}>
          <T v="h1" color={colors.orangeDark} style={{ letterSpacing: 2 }}>{d?.code ?? '•••••'}</T>
          <Button title="Copy" icon="copy-outline" size="sm" kind="secondary" full={false} onPress={async () => { await Clipboard.setStringAsync(d?.code ?? ""); setToast('Code copied'); }} />
        </Row>
        <Gap />
        <Button title="Share on WhatsApp" icon="logo-whatsapp" kind="success" onPress={() => Linking.openURL(`whatsapp://send?text=${encodeURIComponent(d?.shareText ?? "")}`).catch(() => Linking.openURL(`https://wa.me/?text=${encodeURIComponent(d?.shareText ?? "")}`))} />
        <Row gap={8} style={{ marginTop: 8 }}>
          <Button title="SMS" icon="chatbox-outline" kind="secondary" full={false} style={{ flex: 1 }} onPress={() => Linking.openURL(`sms:?body=${encodeURIComponent(d?.shareText ?? "")}`)} />
          <Button title="Share" icon="share-social-outline" kind="secondary" full={false} style={{ flex: 1 }} onPress={() => Share.share({ message: d?.shareText ?? "" })} />
        </Row>
        <T v="small" color={colors.muted} style={{ marginTop: 10 }} numberOfLines={1}>{d?.link}</T>
      </Card>
      <Gap />
      {d ? <Card>
        <Row justify="space-around">
          {[['Invited', d.stats.invited], ['Pending', d.stats.pending], ['Rewarded', d.stats.rewarded]].map(([l, v]) => <View key={String(l)} style={{ alignItems: 'center' }}><T v="h1" color={colors.navy}>{v}</T><T v="small" color={colors.muted}>{l}</T></View>)}
        </Row>
        <Divider />
        <Row justify="space-between"><T color={colors.slate}>Total earned</T><T v="h3" color={colors.success}>{inr(d.stats.earned)}</T></Row>
      </Card> : null}
      {hist.data?.length ? <>
        <Gap />
        <T v="h2" color={colors.ink}>Your referrals</T>
        <Gap h={8} />
        <Card>{hist.data.map((h, i) => (
          <Row key={h.id} justify="space-between" style={{ paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}>
            <View><T v="bodyStrong">{h.name}</T><T v="small" color={colors.muted}>{new Date(h.createdAt).toLocaleDateString('en-IN')}</T></View>
            <T v="small" color={h.status === 'REWARDED' ? colors.success : h.status === 'BLOCKED' ? colors.danger : colors.warning}>{h.status === 'REWARDED' ? `+${inr(h.reward)}` : h.status === 'PENDING' ? 'Awaiting first service' : 'Not eligible'}</T>
          </Row>
        ))}</Card>
      </> : null}
      {d && !d.appliedCode ? <>
        <Gap h={20} />
        <T v="h3" color={colors.ink}>Were you referred by a friend?</T>
        <Gap h={8} />
        <Row gap={8} align="flex-start"><Field style={{ flex: 1, marginBottom: 0 }} value={code} onChangeText={(t) => setCode(t.toUpperCase())} placeholder="Enter their code" autoCapitalize="characters" /><Button title="Apply" full={false} kind="secondary" disabled={code.length < 4} onPress={apply} /></Row>
        {applyMsg ? <><Gap h={8} /><Banner tone={applyMsg.ok ? 'success' : 'danger'} title={applyMsg.text} /></> : null}
      </> : null}
      <Gap h={16} />
      <T v="small" color={colors.muted}>One reward per referred friend. Rewards are credited after the friend’s first completed service. Accounts created on the same device are not eligible. Up to {d?.rules.monthlyLimit ?? '—'} rewards per month.</T>
      <Toast message={toast} onHide={() => setToast(null)} />
    </Screen>
  );
}
