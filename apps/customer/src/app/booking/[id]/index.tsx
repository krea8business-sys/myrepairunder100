import React, { useEffect, useState } from 'react';
import { Image, Linking, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banner, BillRow, Button, Card, Confirm, Divider, ErrorState, Field, Gap, Header, Icon, Row, Screen, Sheet, SkeletonList, StatusBadge, T, Timeline,
  api, colors, dateTime, errorMessage, inr, radius, shortDate, useSocketEvents,
} from '@kit';
import { useBooking, useFeatures, qk } from '@/lib/queries';
import { TrackingMap } from '@/components/TrackingMap';
import type { Addon } from '@/lib/types';

const FLOW = ['CONFIRMED', 'TECHNICIAN_ASSIGNED', 'TECHNICIAN_ON_THE_WAY', 'TECHNICIAN_ARRIVED', 'SERVICE_STARTED', 'SERVICE_COMPLETED', 'COMPLETED'];
const LABEL: Record<string, string> = { CONFIRMED: 'Booking confirmed', TECHNICIAN_ASSIGNED: 'Technician assigned', TECHNICIAN_ON_THE_WAY: 'Technician on the way', TECHNICIAN_ARRIVED: 'Technician arrived', SERVICE_STARTED: 'Service started', SERVICE_COMPLETED: 'Service completed', COMPLETED: 'Paid & closed' };

export default function BookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useBooking(String(id));
  const b = q.data;
  const f = useFeatures();
  const track = useQuery({ queryKey: ['tracking', id], queryFn: () => api<{ trackable: boolean; customer: { lat: number; lng: number } | null; technician: { lat: number; lng: number } | null; eta: { km: number; mins: number } | null }>(`/bookings/${id}/tracking`), enabled: !!b?.canTrack, refetchInterval: 20_000 });
  const [techPos, setTechPos] = useState<{ lat: number; lng: number } | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [warrantyOpen, setWarrantyOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const preview = useQuery({ queryKey: ['cancel-preview', id], queryFn: () => api<{ fee: number; refund: number; refundTo: string }>(`/bookings/${id}/cancel-preview`), enabled: cancelOpen });

  useEffect(() => { if (track.data?.technician) setTechPos(track.data.technician); }, [track.data]);
  const refresh = () => { qc.invalidateQueries({ queryKey: qk.booking(String(id)) }); qc.invalidateQueries({ queryKey: ['tracking', id] }); };
  useSocketEvents({
    'booking:update': refresh, 'addon:requested': refresh, 'addon:decided': refresh, 'payment:update': refresh, 'booking:reassigned': refresh,
    'tech:location': (p: { lat: number; lng: number }) => setTechPos({ lat: p.lat, lng: p.lng }),
  }, String(id));

  const decide = async (a: Addon, approve: boolean) => {
    setBusy(a.id); setErr(null);
    try { qc.setQueryData(qk.booking(String(id)), await api(`/bookings/${id}/addons/${a.id}/decision`, { body: { approve } })); }
    catch (e) { setErr(errorMessage(e)); } finally { setBusy(null); }
  };
  const cancel = async (reason: string) => {
    setBusy('cancel');
    try { qc.setQueryData(qk.booking(String(id)), await api(`/bookings/${id}/cancel`, { body: { reason } })); qc.invalidateQueries({ queryKey: ['bookings'] }); qc.invalidateQueries({ queryKey: qk.wallet }); setCancelOpen(false); }
    catch (e) { setErr(errorMessage(e)); setCancelOpen(false); } finally { setBusy(null); }
  };
  const openInvoice = async () => {
    try { const r = await api<{ url: string }>(`/bookings/${id}/invoice-link`); await Linking.openURL(r.url); }
    catch (e) { setErr(errorMessage(e)); }
  };

  if (q.isLoading) return <Screen padded={false}><Header title="Booking" onBack={() => router.back()} /><View style={{ padding: 16 }}><SkeletonList rows={4} h={110} /></View></Screen>;
  if (q.isError || !b) return <Screen padded={false}><Header title="Booking" onBack={() => router.back()} /><ErrorState message="Unable to load this booking." onRetry={() => q.refetch()} /></Screen>;

  const idx = FLOW.indexOf(b.status === 'PAYMENT_PENDING' ? 'SERVICE_COMPLETED' : b.status);
  const pending = b.addons.filter((a) => a.status === 'PENDING');
  const travelling = ['TECHNICIAN_ON_THE_WAY', 'TECHNICIAN_ARRIVED'].includes(b.status);

  return (
    <Screen padded={false} scroll={false}>
      <Header title={b.code} subtitle={b.isAsap ? 'ASAP' : `${shortDate(b.scheduledDate)}, ${b.slotLabel}`} onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/bookings'))}
        right={f.chat && b.technician && b.canTrack ? <Pressable onPress={() => router.push({ pathname: '/booking/[id]/chat', params: { id: b.id } })} accessibilityLabel="Chat with technician" style={{ padding: 10 }}><Icon name="chatbubble-ellipses-outline" size={22} color={colors.blue} /></Pressable> : null} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={refresh} />}>
        <Row justify="space-between"><StatusBadge status={b.status} /><T v="small" color={colors.muted}>Booked {dateTime(b.createdAt)}</T></Row>
        <Gap />
        {err ? <><Banner tone="danger" title={err} /><Gap /></> : null}

        {b.status === 'PENDING' ? <><Banner tone="warn" title="Payment pending" body="Complete payment to confirm your booking." /><Gap /><Button title="Complete payment" onPress={() => router.push({ pathname: '/payment', params: { bookingId: b.id } })} /><Gap h={16} /></> : null}
        {b.status === 'CONFIRMED' ? <><Banner tone="info" icon="search" title="Finding your technician" body="We’re matching you with a verified technician near you. You’ll be notified once assigned." /><Gap h={16} /></> : null}

        {/* Add-on approvals */}
        {pending.map((a) => (
          <Card key={a.id} style={{ borderWidth: 2, borderColor: colors.orange, marginBottom: 12 }}>
            <Row gap={8}><Icon name="alert-circle" color={colors.orange} /><T v="h3" color={colors.ink}>Technician has requested an additional {a.kind === 'PART' ? 'spare part' : 'service'}.</T></Row>
            <Gap h={8} />
            <Row justify="space-between"><T v="bodyStrong">{a.name}{a.quantity > 1 ? ` × ${a.quantity}` : ''}</T><T v="h3" color={colors.ink}>{inr(a.lineTotal)}</T></Row>
            {a.note ? <T v="small" color={colors.slate} style={{ marginTop: 4 }}>“{a.note}”</T> : null}
            {a.warrantyDays ? <T v="small" color={colors.success}>{a.warrantyDays}-day warranty</T> : null}
            <Gap h={12} />
            <Row gap={10}>
              <Button title="Reject" kind="danger" full={false} style={{ flex: 1 }} onPress={() => decide(a, false)} disabled={!!busy} />
              <Button title="Approve" kind="success" full={false} style={{ flex: 1 }} onPress={() => decide(a, true)} loading={busy === a.id} />
            </Row>
          </Card>
        ))}

        {/* Start code */}
        {b.startCode ? (
          <Card style={{ backgroundColor: colors.navy, borderColor: colors.navy }}>
            <Row justify="space-between">
              <View style={{ flex: 1 }}><T v="small" color="#C9D6FF">Share this code with your technician to start the service</T></View>
              <T v="display" color={colors.white} style={{ letterSpacing: 6 }}>{b.startCode}</T>
            </Row>
          </Card>
        ) : null}

        {/* Technician + tracking */}
        {b.technician ? <>
          <Gap />
          <Card>
            <Row gap={12}>
              {b.technician.photoUrl ? <Image source={{ uri: b.technician.photoUrl }} style={{ width: 56, height: 56, borderRadius: 28 }} /> : <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.blueTint, alignItems: 'center', justifyContent: 'center' }}><Icon name="person" size={28} color={colors.blue} /></View>}
              <View style={{ flex: 1 }}>
                <T v="h3" color={colors.ink}>{b.technician.name ?? 'Your technician'}</T>
                <Row gap={6}>
                  {b.technician.rating != null ? <Row gap={2}><Icon name="star" size={14} color="#F5A524" /><T v="small">{b.technician.rating.toFixed(1)} ({b.technician.ratingCount})</T></Row> : <T v="small" color={colors.muted}>New technician</T>}
                  <T v="small" color={colors.muted}>· ID {b.technician.code}</T>
                </Row>
                <T v="small" color={colors.success}><Icon name="shield-checkmark" size={12} color={colors.success} /> Verified technician</T>
              </View>
              {b.technician.phone ? <Pressable onPress={() => Linking.openURL(`tel:${b.technician?.phone}`)} accessibilityLabel="Call technician" style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.successTint, alignItems: 'center', justifyContent: 'center' }}><Icon name="call" color={colors.success} /></Pressable> : null}
            </Row>
            {b.canTrack ? <>
              <Gap />
              {travelling && f.liveTracking ? <>
                <TrackingMap customer={track.data?.customer ?? null} technician={techPos} />
                <Gap h={8} />
                {track.data?.eta && b.status === 'TECHNICIAN_ON_THE_WAY' ? <Row gap={6}><Icon name="time-outline" color={colors.orange} /><T v="bodyStrong">Arriving in about {track.data.eta.mins} min · {track.data.eta.km} km away</T></Row>
                  : b.status === 'TECHNICIAN_ARRIVED' ? <T v="bodyStrong" color={colors.success}>Your technician has arrived</T> : <T v="small" color={colors.muted}>Waiting for the technician’s live location…</T>}
              </> : <T v="small" color={colors.muted}>{b.status === 'TECHNICIAN_ASSIGNED' ? 'Live location will be shown when the technician starts travelling.' : 'Service in progress.'}</T>}
            </> : null}
          </Card>
        </> : null}

        {/* Timeline */}
        {b.status !== 'CANCELLED' ? <>
          <Gap h={16} />
          <Card>
            <T v="h3" color={colors.ink} style={{ marginBottom: 12 }}>Status</T>
            <Timeline steps={FLOW.map((s, i) => ({ label: LABEL[s], done: i < idx || b.status === 'COMPLETED', current: i === idx && b.status !== 'COMPLETED', at: (() => { const h = [...b.timeline].reverse().find((t) => t.status === s); return h ? dateTime(h.at) : null; })() }))} />
          </Card>
        </> : <><Gap /><Banner tone="danger" title={`Cancelled${b.cancelledBy === 'CUSTOMER' ? ' by you' : ''}`} body={b.cancelReason ?? undefined} /></>}

        {/* Bill */}
        <Gap h={16} />
        <Card>
          <T v="h3" color={colors.ink} style={{ marginBottom: 6 }}>Bill details</T>
          {b.items.map((i) => <BillRow key={i.id} label={`${i.name}${i.quantity > 1 ? ` × ${i.quantity}` : ''}`} value={inr(i.unitPrice * i.quantity)} />)}
          {b.addons.filter((a) => a.status === 'APPROVED').map((a) => <BillRow key={a.id} label={`${a.kind === 'PART' ? 'Part' : 'Add-on'}: ${a.name}`} value={inr(a.lineTotal)} />)}
          {b.bill.couponDiscount ? <BillRow label="Coupon" value={`−${inr(b.bill.couponDiscount)}`} color={colors.success} /> : null}
          {b.bill.taxTotal ? <BillRow label={b.bill.taxInclusive ? 'Taxes (included)' : 'Taxes'} value={inr(b.bill.taxTotal)} /> : null}
          {b.bill.walletUsed ? <BillRow label="Wallet" value={`−${inr(b.bill.walletUsed)}`} color={colors.success} /> : null}
          <Divider />
          <BillRow label="Total" value={inr(b.bill.grandTotal)} strong />
          {b.bill.amountPaid ? <BillRow label="Paid" value={inr(b.bill.amountPaid)} /> : null}
          {b.bill.cancellationFee ? <BillRow label="Cancellation fee" value={inr(b.bill.cancellationFee)} color={colors.danger} /> : null}
          {b.refunds.map((r) => <BillRow key={r.id} label={`Refund to ${r.destination === 'WALLET' ? 'wallet' : 'original method'} (${r.status.toLowerCase()})`} value={inr(r.amount)} color={colors.success} />)}
          {b.status === 'PAYMENT_PENDING' ? <><Gap /><Button title={`Pay ${inr(b.bill.amountDue)}`} icon="card-outline" onPress={() => router.push({ pathname: '/payment', params: { bookingId: b.id } })} /></> : null}
        </Card>

        {/* Photos */}
        {b.photos.length ? <>
          <Gap h={16} />
          <Card>
            <T v="h3" color={colors.ink} style={{ marginBottom: 10 }}>Service photos</T>
            <ScrollView horizontal contentContainerStyle={{ gap: 10 }}>
              {b.photos.map((p) => <View key={p.id}><Image source={{ uri: p.url }} style={{ width: 120, height: 120, borderRadius: radius.md }} accessibilityLabel={`${p.kind} photo`} /><T v="tiny" color={colors.muted} style={{ marginTop: 4 }}>{p.kind}</T></View>)}
            </ScrollView>
          </Card>
        </> : null}

        {/* Warranty */}
        {b.status === 'COMPLETED' ? <>
          <Gap h={16} />
          <Card>
            <Row gap={8}><Icon name="shield-checkmark" color={b.warranty.active ? colors.success : colors.muted} /><T v="h3" color={colors.ink}>{b.warranty.until ? `Warranty active until ${shortDate(b.warranty.until)}` : 'No warranty on this service'}</T></Row>
            {b.warranty.claims.map((c) => <View key={c.id} style={{ marginTop: 10 }}><T v="small" color={colors.slate}>Request {dateTime(c.createdAt)} · <T v="small" color={colors.blue}>{c.status}</T></T>{c.adminNote ? <T v="small" color={colors.muted}>{c.adminNote}</T> : null}</View>)}
            {f.warrantyClaims && b.warranty.active && !b.warranty.claims.some((c) => ['REQUESTED', 'APPROVED'].includes(c.status)) ? <><Gap h={10} /><Button title="Raise warranty request" kind="secondary" size="md" onPress={() => setWarrantyOpen(true)} /></> : null}
          </Card>
        </> : null}

        {/* Actions */}
        <Gap h={16} />
        {f.reviews && b.status === 'COMPLETED' && !b.review ? <><Button title="Rate your technician" icon="star-outline" kind="accent" onPress={() => setReviewOpen(true)} /><Gap h={10} /></> : null}
        {b.review ? <><Card><Row gap={4}>{Array.from({ length: 5 }).map((_, i) => <Icon key={i} name={i < (b.review?.technicianRating ?? 0) ? 'star' : 'star-outline'} color="#F5A524" />)}</Row>{b.review.comment ? <T v="small" color={colors.slate} style={{ marginTop: 6 }}>“{b.review.comment}”</T> : null}</Card><Gap h={10} /></> : null}
        {b.status !== 'CANCELLED' && b.status !== 'PENDING' ? <><Button title="Download invoice" kind="ghost" icon="document-text-outline" onPress={openInvoice} /><Gap h={10} /></> : null}
        {b.canReschedule ? <><Button title="Reschedule" kind="ghost" icon="calendar-outline" onPress={() => router.push({ pathname: '/booking/[id]/reschedule', params: { id: b.id } })} /><Gap h={10} /></> : null}
        {b.canCancel ? <Button title="Cancel booking" kind="danger" onPress={() => setCancelOpen(true)} /> : null}
        <Gap h={10} />
        <Button title="Need help with this booking?" kind="ghost" icon="help-circle-outline" onPress={() => router.push({ pathname: '/support/new', params: { bookingId: b.id } })} />
      </ScrollView>

      <CancelSheet open={cancelOpen} onClose={() => setCancelOpen(false)} onConfirm={cancel} loading={busy === 'cancel'} fee={preview.data?.fee} refund={preview.data?.refund} refundTo={preview.data?.refundTo} />
      <ReviewSheet open={reviewOpen} onClose={() => setReviewOpen(false)} bookingId={b.id} onDone={refresh} />
      <WarrantySheet open={warrantyOpen} onClose={() => setWarrantyOpen(false)} bookingId={b.id} onDone={refresh} />
    </Screen>
  );
}

const REASONS = ['Booked by mistake', 'Problem got fixed', 'Want a different time', 'Found another service', 'Other'];
function CancelSheet({ open, onClose, onConfirm, loading, fee, refund, refundTo }: { open: boolean; onClose: () => void; onConfirm: (r: string) => void; loading: boolean; fee?: number; refund?: number; refundTo?: string }) {
  const [reason, setReason] = useState(REASONS[0]);
  return (
    <Confirm visible={open} title="Cancel this booking?" confirm="Yes, cancel booking" danger onConfirm={() => onConfirm(reason)} onCancel={onClose} loading={loading}>
      {fee != null ? <Banner tone={fee ? 'warn' : 'success'} title={fee ? `A cancellation fee of ${inr(fee)} applies` : 'Free cancellation'} body={refund ? `${inr(refund)} will be refunded to your ${refundTo === 'WALLET' ? 'wallet' : 'original payment method'} (wallet amounts return to your wallet).` : undefined} /> : null}
      <Gap />
      {REASONS.map((r) => <Pressable key={r} onPress={() => setReason(r)} style={{ paddingVertical: 10, flexDirection: 'row', gap: 10, alignItems: 'center' }} accessibilityRole="radio" accessibilityState={{ selected: reason === r }}><Icon name={reason === r ? 'radio-button-on' : 'radio-button-off'} color={colors.blue} /><T>{r}</T></Pressable>)}
    </Confirm>
  );
}

function ReviewSheet({ open, onClose, bookingId, onDone }: { open: boolean; onClose: () => void; bookingId: string; onDone: () => void }) {
  const [tech, setTech] = useState(5); const [svc, setSvc] = useState(5); const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const Stars = ({ v, set, label }: { v: number; set: (n: number) => void; label: string }) => (
    <View style={{ marginBottom: 14 }}><T v="bodyStrong">{label}</T><Row gap={6} style={{ marginTop: 6 }}>{[1, 2, 3, 4, 5].map((n) => <Pressable key={n} onPress={() => set(n)} accessibilityLabel={`${n} star`} hitSlop={6}><Icon name={n <= v ? 'star' : 'star-outline'} size={32} color="#F5A524" /></Pressable>)}</Row></View>
  );
  const submit = async () => { setBusy(true); setErr(null); try { await api(`/bookings/${bookingId}/review`, { body: { technicianRating: tech, serviceRating: svc, comment: comment.trim() || undefined } }); onDone(); onClose(); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); } };
  return (
    <Sheet visible={open} onClose={onClose} title="Rate your experience">
      <Stars v={tech} set={setTech} label="Technician" />
      <Stars v={svc} set={setSvc} label="Overall service" />
      <Field label="Tell us more (optional)" value={comment} onChangeText={setComment} multiline placeholder="What went well? What could be better?" />
      {err ? <Banner tone="danger" title={err} /> : null}
      <Gap />
      <Button title="Submit review" onPress={submit} loading={busy} />
    </Sheet>
  );
}

function WarrantySheet({ open, onClose, bookingId, onDone }: { open: boolean; onClose: () => void; bookingId: string; onDone: () => void }) {
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const submit = async () => { setBusy(true); setErr(null); try { await api(`/bookings/${bookingId}/warranty-claim`, { body: { description: text.trim() } }); onDone(); onClose(); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); } };
  return (
    <Sheet visible={open} onClose={onClose} title="Warranty request">
      <T color={colors.slate}>Describe the problem. Our team will review it and arrange a revisit if it’s covered.</T>
      <Gap />
      <Field value={text} onChangeText={setText} multiline numberOfLines={4} placeholder="e.g. Cooling dropped again after 10 days" />
      {err ? <Banner tone="danger" title={err} /> : null}
      <Gap />
      <Button title="Submit request" onPress={submit} loading={busy} disabled={text.trim().length < 10} />
    </Sheet>
  );
}
