import React, { useEffect, useState } from 'react';
import { Image, Linking, Platform, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge, Banner, BillRow, Button, Card, Chip, Confirm, Divider, ErrorState, Field, Gap, Header, Icon, IconButton, Loading, OtpInput, Row, Screen, Sheet, StatusBadge, StickyFooter, T,
  api, colors, errorMessage, inr, radius, shortDate, useSocketEvents,
} from '@kit';
import type { CatalogService, Job } from '@/lib/types';
import { isSharing, startSharing, stopSharing } from '@/lib/tracking';
import { uploadImage } from '@/components/DocumentsCard';
import { useFeatures } from '@/lib/features';

export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['job', id], queryFn: () => api<Job>(`/technician/jobs/${id}`), refetchInterval: 20_000 });
  const j = q.data;
  const feat = useFeatures();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | 'start' | 'service' | 'part' | 'complete' | 'release'>(null);
  const [sharing, setSharing] = useState(isSharing());
  const refresh = () => qc.invalidateQueries({ queryKey: ['job', id] });
  useSocketEvents({ 'booking:update': refresh, 'addon:decided': refresh, 'payment:update': refresh, 'job:cancelled': refresh }, String(id));

  // location is shared only while travelling / arrived — stop automatically otherwise
  useEffect(() => {
    if (!j) return;
    const travelling = j.status === 'TECHNICIAN_ON_THE_WAY' || j.status === 'TECHNICIAN_ARRIVED';
    if (travelling && feat.liveTracking && !isSharing()) startSharing().then(setSharing);
    if (!travelling && isSharing()) { stopSharing(); setSharing(false); }
  }, [j?.status, feat.liveTracking]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (key: string, path: string, body: object = {}) => {
    setBusy(key); setErr(null);
    try { const r = await api<Job>(`/technician/jobs/${id}/${path}`, { body }); qc.setQueryData(['job', id], { ...r, isOffer: false }); qc.invalidateQueries({ queryKey: ['jobs'] }); qc.invalidateQueries({ queryKey: ['dash'] }); setSheet(null); return true; }
    catch (e) { setErr(errorMessage(e)); return false; } finally { setBusy(null); }
  };
  const navigate = () => {
    if (!j) return;
    const dest = j.location ? `${j.location.lat},${j.location.lng}` : encodeURIComponent([j.address.houseNo, j.address.street, j.address.locality, j.address.city, j.address.pincode].filter(Boolean).join(', '));
    Linking.openURL(Platform.OS === 'ios' ? `maps://?daddr=${dest}` : `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`).catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${dest}`));
  };
  const photo = async (kind: 'BEFORE' | 'AFTER') => {
    setBusy('photo'); setErr(null);
    try { if (await uploadImage(`/technician/jobs/${id}/photos`, 'photo', { kind }, Platform.OS !== 'web')) refresh(); }
    catch (e) { setErr(errorMessage(e)); } finally { setBusy(null); }
  };

  if (q.isLoading) return <Screen padded={false}><Header title="Job" onBack={() => router.back()} /><Loading /></Screen>;
  if (q.isError || !j) return <Screen padded={false}><Header title="Job" onBack={() => router.back()} /><ErrorState message="This job is no longer available." onRetry={() => q.refetch()} /></Screen>;

  const pendingAddons = j.addons.filter((a) => a.status === 'PENDING');
  const active = !j.isOffer && !['COMPLETED', 'CANCELLED'].includes(j.status);
  const a = j.address;

  return (
    <Screen padded={false} scroll={false}>
      <Header title={j.code} subtitle={j.isAsap ? 'ASAP' : `${shortDate(j.scheduledDate)}, ${j.slotLabel}`} onBack={() => router.back()}
        right={active && feat.chat ? <IconButton icon="chatbubble-ellipses-outline" label="Chat with customer" color={colors.blue} onPress={() => router.push({ pathname: '/job/[id]/chat', params: { id: j.id } })} /> : null} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
        <Row justify="space-between"><StatusBadge status={j.status} />{sharing ? <Badge label="Sharing live location" icon="radio" fg={colors.orangeDark} bg={colors.orangeTint} /> : null}</Row>
        <Gap />
        {err ? <><Banner tone="danger" title={err} /><Gap /></> : null}
        {j.status === 'CANCELLED' ? <><Banner tone="danger" title="This job was cancelled." /><Gap /></> : null}

        {/* Customer */}
        <Card>
          <T v="small" color={colors.muted}>Customer</T>
          <T v="h3" color={colors.ink}>{a.contactName ?? 'Shown after you accept'}</T>
          <Gap h={6} />
          <Row gap={8} align="flex-start"><Icon name="location-outline" color={colors.blue} /><T style={{ flex: 1 }}>{a.houseNo ? [a.houseNo, a.street, a.locality, a.city, a.pincode].filter(Boolean).join(', ') : `${a.locality ?? ''} ${a.city} ${a.pincode}`}</T></Row>
          {a.landmark ? <T v="small" color={colors.slate} style={{ marginLeft: 28 }}>Landmark: {a.landmark}</T> : null}
          {!j.isOffer && active ? <Row gap={8} style={{ marginTop: 12 }}>
            <Button title="Navigate" icon="navigate" kind="secondary" full={false} style={{ flex: 1 }} onPress={navigate} />
            {j.customerPhone ? <Button title="Call" icon="call" kind="success" full={false} style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${j.customerPhone}`)} /> : null}
          </Row> : null}
        </Card>
        <Gap />
        <Card>
          <T v="small" color={colors.muted}>Services</T>
          {j.items.map((i) => <Row key={i.id} justify="space-between" style={{ marginTop: 6 }}><T v="bodyStrong" style={{ flex: 1 }}>{i.name}{i.quantity > 1 ? ` × ${i.quantity}` : ''}</T><T>{inr(i.unitPrice * i.quantity)}</T></Row>)}
          {j.problemDescription ? <><Divider /><T v="small" color={colors.muted}>Problem described by customer</T><T style={{ marginTop: 4 }}>“{j.problemDescription}”</T></> : null}
        </Card>

        {j.addons.length ? <>
          <Gap />
          <Card>
            <T v="h3" color={colors.ink} style={{ marginBottom: 6 }}>Additional work</T>
            {j.addons.map((x) => (
              <Row key={x.id} justify="space-between" style={{ paddingVertical: 6 }}>
                <T style={{ flex: 1 }}>{x.kind === 'PART' ? 'Part: ' : ''}{x.name}{x.quantity > 1 ? ` × ${x.quantity}` : ''}</T>
                <Badge label={x.status === 'PENDING' ? 'Waiting for customer' : x.status} fg={x.status === 'APPROVED' ? colors.success : x.status === 'REJECTED' ? colors.danger : colors.warning} bg={x.status === 'APPROVED' ? colors.successTint : x.status === 'REJECTED' ? colors.dangerTint : colors.warningTint} />
                <T v="bodyStrong" style={{ marginLeft: 8 }}>{inr(x.lineTotal)}</T>
              </Row>
            ))}
          </Card>
        </> : null}

        {/* Photos */}
        {['TECHNICIAN_ARRIVED', 'SERVICE_STARTED', 'SERVICE_COMPLETED', 'PAYMENT_PENDING', 'COMPLETED'].includes(j.status) ? <>
          <Gap />
          <Card>
            <Row justify="space-between"><T v="h3" color={colors.ink}>Photos</T><T v="small" color={colors.muted}>{j.photos.length}/20</T></Row>
            {j.photos.length ? <ScrollView horizontal contentContainerStyle={{ gap: 8, marginTop: 10 }}>{j.photos.map((p) => <View key={p.id}><Image source={{ uri: p.url }} style={{ width: 88, height: 88, borderRadius: radius.md }} /><T v="tiny" color={colors.muted}>{p.kind}</T></View>)}</ScrollView> : null}
            {j.status !== 'COMPLETED' ? <Row gap={8} style={{ marginTop: 10 }}>
              <Button title="Before photo" icon="camera-outline" size="md" kind="ghost" full={false} style={{ flex: 1 }} onPress={() => photo('BEFORE')} loading={busy === 'photo'} />
              <Button title="After photo" icon="camera-outline" size="md" kind="ghost" full={false} style={{ flex: 1 }} onPress={() => photo('AFTER')} disabled={busy === 'photo'} />
            </Row> : null}
          </Card>
        </> : null}

        {/* Bill */}
        <Gap />
        <Card>
          <T v="h3" color={colors.ink} style={{ marginBottom: 4 }}>Bill</T>
          <BillRow label="Services" value={inr(j.bill.itemsTotal)} />
          {j.bill.addonsTotal ? <BillRow label="Approved additions" value={inr(j.bill.addonsTotal)} /> : null}
          {j.bill.couponDiscount ? <BillRow label="Coupon" value={`−${inr(j.bill.couponDiscount)}`} /> : null}
          {j.bill.walletUsed ? <BillRow label="Wallet" value={`−${inr(j.bill.walletUsed)}`} /> : null}
          <Divider />
          <BillRow label="Customer pays" value={inr(j.bill.grandTotal)} strong />
          <BillRow label="Already paid online" value={inr(j.bill.amountPaid)} />
          {j.bill.amountDue > 0 ? <BillRow label="To collect" value={inr(j.bill.amountDue)} strong color={colors.orangeDark} /> : null}
        </Card>
        {active && ['TECHNICIAN_ASSIGNED', 'TECHNICIAN_ON_THE_WAY'].includes(j.status) ? <><Gap /><Button title="I can’t make this job" kind="ghost" onPress={() => setSheet('release')} /></> : null}
      </ScrollView>

      {/* Primary action for the current step */}
      <StickyFooter>
        {j.isOffer ? <Row gap={10}>
          <Button title="Reject" kind="danger" full={false} style={{ flex: 1 }} onPress={async () => { try { await api(`/technician/jobs/${id}/reject`, { body: {} }); router.back(); } catch (e) { setErr(errorMessage(e)); } }} />
          <Button title="Accept job" kind="success" full={false} style={{ flex: 1.5 }} loading={busy === 'accept'} onPress={() => act('accept', 'accept')} />
        </Row>
        : j.status === 'TECHNICIAN_ASSIGNED' ? <Button title="Start travelling" icon="navigate" loading={busy === 'otw'} onPress={async () => { if (await act('otw', 'on-the-way')) navigate(); }} />
        : j.status === 'TECHNICIAN_ON_THE_WAY' ? <Button title="I have arrived" icon="location" kind="accent" loading={busy === 'arr'} onPress={() => act('arr', 'arrived')} />
        : j.status === 'TECHNICIAN_ARRIVED' ? <Button title="Start job" icon="play" onPress={() => setSheet('start')} />
        : j.status === 'SERVICE_STARTED' ? <View style={{ gap: 8 }}>
            <Row gap={8}>
              <Button title="Add service" icon="add-circle-outline" kind="secondary" full={false} style={{ flex: 1 }} onPress={() => setSheet('service')} />
              <Button title="Add spare part" icon="construct-outline" kind="secondary" full={false} style={{ flex: 1 }} onPress={() => setSheet('part')} />
            </Row>
            <Button title={pendingAddons.length ? 'Waiting for customer approval…' : 'Complete job'} kind="success" icon="checkmark-done" disabled={pendingAddons.length > 0} onPress={() => setSheet('complete')} />
          </View>
        : j.status === 'PAYMENT_PENDING' ? <View style={{ gap: 8 }}>
            <Banner tone="warn" title={`Collect ${inr(j.bill.amountDue)}`} body={feat.cash ? 'The customer can pay in their app (UPI/card), or pay you in cash.' : 'Ask the customer to pay in their app (UPI/card).'} />
            {feat.cash ? <Button title={`Cash received · ${inr(j.bill.amountDue)}`} icon="cash-outline" kind="success" loading={busy === 'cash'} onPress={() => act('cash', 'collect-cash')} /> : null}
          </View>
        : j.status === 'COMPLETED' ? <Banner tone="success" title="Job completed and paid. Great work!" />
        : <Button title="Back to jobs" kind="ghost" onPress={() => router.back()} />}
      </StickyFooter>

      <StartSheet open={sheet === 'start'} onClose={() => setSheet(null)} loading={busy === 'start'} onSubmit={(code) => act('start', 'start', { code })} />
      <AddServiceSheet open={sheet === 'service'} onClose={() => setSheet(null)} onSubmit={(serviceId, note) => act('addon', 'addons', { kind: 'SERVICE', serviceId, quantity: 1, note }).then(refresh)} loading={busy === 'addon'} />
      <AddPartSheet open={sheet === 'part'} onClose={() => setSheet(null)} onSubmit={(b) => act('addon', 'addons', { kind: 'PART', ...b }).then(refresh)} loading={busy === 'addon'} />
      <Confirm visible={sheet === 'complete'} title="Complete this job?" body={`The customer will receive the final bill${j.bill.amountDue > 0 ? '' : ''}. Make sure you’ve uploaded after-photos.`} confirm="Complete job" loading={busy === 'complete'} onConfirm={() => act('complete', 'complete')} onCancel={() => setSheet(null)} />
      <ReleaseSheet open={sheet === 'release'} onClose={() => setSheet(null)} loading={busy === 'release'} onSubmit={async (reason) => { setBusy('release'); try { await api(`/technician/jobs/${id}/release`, { body: { reason } }); qc.invalidateQueries({ queryKey: ['jobs'] }); router.back(); } catch (e) { setErr(errorMessage(e)); setSheet(null); } finally { setBusy(null); } }} />
    </Screen>
  );
}

function StartSheet({ open, onClose, onSubmit, loading }: { open: boolean; onClose: () => void; onSubmit: (c: string) => void; loading: boolean }) {
  const [code, setCode] = useState('');
  return (
    <Sheet visible={open} onClose={onClose} title="Enter start code">
      <T color={colors.slate}>Ask the customer for the 4-digit code shown in their app.</T>
      <Gap />
      <OtpInput length={4} value={code} onChange={setCode} />
      <Gap h={20} />
      <Button title="Start job" onPress={() => onSubmit(code)} loading={loading} disabled={code.length !== 4} />
    </Sheet>
  );
}

function AddServiceSheet({ open, onClose, onSubmit, loading }: { open: boolean; onClose: () => void; onSubmit: (id: string, note?: string) => void; loading: boolean }) {
  const cat = useQuery({ queryKey: ['techCatalog'], queryFn: () => api<CatalogService[]>('/technician/catalog'), enabled: open });
  const [sel, setSel] = useState<string | null>(null); const [note, setNote] = useState('');
  return (
    <Sheet visible={open} onClose={onClose} title="Recommend a service">
      <T v="small" color={colors.muted}>Catalog prices apply. The customer must approve before it’s added to the bill.</T>
      <Gap />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{cat.data?.map((s) => <Chip key={s.id} label={`${s.name} · ${inr(s.price)}`} active={sel === s.id} onPress={() => setSel(s.id)} />)}</View>
      <Gap />
      <Field label="Reason (shown to customer)" value={note} onChangeText={setNote} placeholder="e.g. Coils are heavily clogged" />
      <Button title="Send for approval" disabled={!sel} loading={loading} onPress={() => sel && onSubmit(sel, note || undefined)} />
    </Sheet>
  );
}

function AddPartSheet({ open, onClose, onSubmit, loading }: { open: boolean; onClose: () => void; onSubmit: (b: { name: string; unitPrice: number; quantity: number; warrantyDays?: number; note?: string }) => void; loading: boolean }) {
  const [name, setName] = useState(''); const [price, setPrice] = useState(''); const [qty, setQty] = useState('1'); const [w, setW] = useState(''); const [note, setNote] = useState('');
  return (
    <Sheet visible={open} onClose={onClose} title="Add spare part">
      <Field label="Part name" value={name} onChangeText={setName} placeholder="e.g. Capacitor 35 µF" />
      <Row gap={10}>
        <Field style={{ flex: 1 }} label="Price per unit (₹)" value={price} onChangeText={(t) => setPrice(t.replace(/[^\d]/g, ''))} keyboardType="number-pad" />
        <Field style={{ width: 80 }} label="Qty" value={qty} onChangeText={(t) => setQty(t.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" />
      </Row>
      <Field label="Warranty on part (days, optional)" value={w} onChangeText={(t) => setW(t.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" />
      <Field label="Note to customer" value={note} onChangeText={setNote} placeholder="Why it’s needed" />
      <Button title="Send for approval" loading={loading} disabled={name.trim().length < 2 || !Number(price) || !Number(qty)}
        onPress={() => onSubmit({ name: name.trim(), unitPrice: Number(price) * 100, quantity: Number(qty), warrantyDays: w ? Number(w) : undefined, note: note || undefined })} />
    </Sheet>
  );
}

function ReleaseSheet({ open, onClose, onSubmit, loading }: { open: boolean; onClose: () => void; onSubmit: (r: string) => void; loading: boolean }) {
  const [reason, setReason] = useState('');
  return (
    <Sheet visible={open} onClose={onClose} title="Release this job?">
      <T color={colors.slate}>The job goes back to the queue and another technician will be assigned. Frequent releases affect your rating.</T>
      <Gap />
      <Field label="Reason" value={reason} onChangeText={setReason} placeholder="e.g. Vehicle breakdown" />
      <Button title="Release job" kind="danger" loading={loading} disabled={reason.trim().length < 3} onPress={() => onSubmit(reason.trim())} />
    </Sheet>
  );
}
