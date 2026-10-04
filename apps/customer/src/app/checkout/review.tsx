import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Banner, BillRow, Button, Card, Divider, Field, Gap, Header, Icon, Radio, Row, Screen, Sheet, StickyFooter, T, Toggle, api, colors, errorMessage, inr, radius, shortDate } from '@kit';
import { qk, useAddresses, useConfig, useFeatures, useOffers } from '@/lib/queries';
import { checkout, useCheckout } from '@/lib/checkout';
import type { Booking, Quote } from '@/lib/types';
import { track } from '@/lib/analytics';

/** Step 3: coupon, wallet, payment mode, final server-computed bill → book. */
export default function CheckoutReview() {
  const d = useCheckout();
  const qc = useQueryClient();
  const cfg = useConfig();
  const f = useFeatures();
  const addrs = useAddresses();
  const offers = useOffers();
  const [code, setCode] = useState(d.couponCode ?? '');
  const [sheet, setSheet] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const addr = addrs.data?.find((a) => a.id === d.addressId);
  const quote = useQuery({ queryKey: ['quote', d.couponCode, d.useWallet], queryFn: () => api<Quote>('/me/cart/quote', { body: { couponCode: d.couponCode || null, useWallet: d.useWallet } }) });
  const q = quote.data;
  const pay = cfg.data?.payments;

  useEffect(() => { if (pay && !d.paymentMode) checkout.set({ paymentMode: pay.payAfterServiceEnabled ? 'PAY_AFTER_SERVICE' : 'PAY_NOW' }); }, [pay, d.paymentMode]);
  useEffect(() => { if (q?.couponError && d.couponCode) setErr(q.couponError); }, [q?.couponError, d.couponCode]);

  const apply = (c: string) => { setErr(null); setCode(c); checkout.set({ couponCode: c.trim().toUpperCase() || null }); setSheet(false); };
  const place = async () => {
    if (!d.addressId) return router.replace('/checkout/address');
    setPlacing(true); setErr(null);
    try {
      const r = await api<{ booking: Booking; requiresPayment: boolean }>('/bookings', {
        body: { addressId: d.addressId, date: d.asap ? null : d.date, slotId: d.asap ? null : d.slotId, asap: !!d.asap, problemDescription: d.problem || null, couponCode: q?.coupon ? d.couponCode : null, useWallet: d.useWallet, paymentMode: d.paymentMode, clientRequestId: d.requestId },
      });
      qc.invalidateQueries({ queryKey: qk.cart }); qc.invalidateQueries({ queryKey: ['bookings'] }); qc.invalidateQueries({ queryKey: qk.wallet });
      track('booking_created', { mode: d.paymentMode ?? null });
      checkout.reset();
      if (r.requiresPayment) router.replace({ pathname: '/payment', params: { bookingId: r.booking.id } });
      else router.replace({ pathname: '/booking-confirmed', params: { id: r.booking.id } });
    } catch (e) {
      setErr(errorMessage(e));
      if ((e as { code?: string }).code === 'SLOT_FULL') qc.invalidateQueries({ queryKey: qk.slots });
    } finally { setPlacing(false); }
  };

  return (
    <Screen padded={false} scroll={false} keyboard>
      <Header title="Review & book" subtitle="Step 3 of 3" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Card>
          <Row gap={10} align="flex-start"><Icon name="location-outline" color={colors.blue} /><View style={{ flex: 1 }}><T v="small" color={colors.muted}>Service at</T><T v="bodyStrong">{addr ? `${addr.houseNo}, ${addr.locality ?? addr.city} ${addr.pincode}` : '—'}</T></View><T v="small" color={colors.blue} onPress={() => router.navigate('/checkout/address')}>Change</T></Row>
          <Divider />
          <Row gap={10} align="flex-start"><Icon name="calendar-outline" color={colors.blue} /><View style={{ flex: 1 }}><T v="small" color={colors.muted}>When</T><T v="bodyStrong">{d.asap ? 'ASAP (within 2–3 hours)' : d.date ? `${shortDate(d.date)}, ${d.slotLabel}` : '—'}</T></View><T v="small" color={colors.blue} onPress={() => router.navigate('/checkout/slot')}>Change</T></Row>
        </Card>
        <Gap h={16} />
        {f.coupons ? <><Card>
          <T v="h3" color={colors.ink}>Coupon</T>
          <Gap h={8} />
          {q?.coupon ? (
            <Row justify="space-between" style={{ backgroundColor: colors.successTint, padding: 12, borderRadius: radius.md }}>
              <Row gap={8}><Icon name="pricetag" color={colors.success} /><T v="bodyStrong" color={colors.success}>{q.coupon.code} applied · −{inr(q.couponDiscount)}</T></Row>
              <T v="small" color={colors.danger} onPress={() => apply('')}>Remove</T>
            </Row>
          ) : <>
            <Row gap={8} align="flex-start">
              <Field style={{ flex: 1, marginBottom: 0 }} value={code} onChangeText={(t) => setCode(t.toUpperCase())} placeholder="Enter coupon code" autoCapitalize="characters" />
              <Button title="Apply" kind="secondary" full={false} disabled={!code.trim()} onPress={() => apply(code)} />
            </Row>
            {offers.data?.coupons.length ? <T v="small" color={colors.blue} style={{ marginTop: 10 }} onPress={() => setSheet(true)}>View available coupons ({offers.data.coupons.length})</T> : null}
          </>}
        </Card>
        <Gap h={12} /></> : null}
        {f.wallet ? <><Card>
          <Toggle value={d.useWallet} onChange={(v) => checkout.set({ useWallet: v })} label="Use wallet balance" sub={q ? `Available ${inr(q.walletAvailable)}` : undefined} />
          {d.useWallet && q?.walletNote ? <T v="small" color={colors.muted} style={{ marginTop: 6 }}>{q.walletNote}</T> : null}
        </Card>
        <Gap h={12} /></> : null}
        <Card>
          <T v="h3" color={colors.ink} style={{ marginBottom: 10 }}>Payment</T>
          {pay?.payAfterServiceEnabled ? <Radio selected={d.paymentMode === 'PAY_AFTER_SERVICE'} onPress={() => checkout.set({ paymentMode: 'PAY_AFTER_SERVICE' })} label="Pay after service" sub={`UPI, card, net banking${pay.cashEnabled ? ' or cash' : ''} once the job is done`} /> : null}
          {pay?.payNowEnabled ? <Radio selected={d.paymentMode === 'PAY_NOW'} onPress={() => checkout.set({ paymentMode: 'PAY_NOW' })} label="Pay now" sub="UPI, cards, net banking — secure payment" /> : null}
        </Card>
        <Gap h={12} />
        <Card>
          <T v="h3" color={colors.ink} style={{ marginBottom: 6 }}>Bill summary</T>
          {q ? <>
            <BillRow label="Services" value={inr(q.itemsTotal)} />
            {q.couponDiscount ? <BillRow label={`Coupon (${q.coupon?.code})`} value={`−${inr(q.couponDiscount)}`} color={colors.success} /> : null}
            {q.taxTotal ? <BillRow label={q.taxInclusive ? 'Taxes (included)' : 'Taxes'} value={inr(q.taxTotal)} /> : null}
            {q.walletUsed ? <BillRow label="Wallet" value={`−${inr(q.walletUsed)}`} color={colors.success} /> : null}
            <Divider />
            <BillRow label={d.paymentMode === 'PAY_NOW' ? 'Pay now' : 'Payable after service'} value={inr(q.grandTotal)} strong />
            <T v="small" color={colors.muted}>Final amount may change only if you approve additional work or parts.</T>
          </> : <T color={colors.muted}>Calculating…</T>}
        </Card>
        {err ? <><Gap /><Banner tone="danger" title={err} /></> : null}
        {cfg.data?.cancellation ? <T v="small" color={colors.muted} style={{ marginTop: 12 }}>Free cancellation up to {Math.round(cfg.data.cancellation.freeUntilMinutesBefore / 60)} hours before your slot.{cfg.data.cancellation.feePaise ? ` After that a ${inr(cfg.data.cancellation.feePaise)} fee may apply.` : ''}</T> : null}
      </ScrollView>
      <StickyFooter>
        <Button title={q ? `${d.paymentMode === 'PAY_NOW' ? 'Pay' : 'Book'} · ${inr(q.grandTotal)}` : 'Book'} onPress={place} loading={placing} disabled={!q || !d.paymentMode} />
      </StickyFooter>
      <Sheet visible={sheet} onClose={() => setSheet(false)} title="Available coupons">
        {offers.data?.coupons.map((c) => (
          <View key={c.code} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line }}>
            <Row justify="space-between"><T v="bodyStrong" color={colors.orangeDark}>{c.code}</T><Button title="Apply" size="sm" kind="secondary" full={false} onPress={() => apply(c.code)} /></Row>
            <T v="small" color={colors.slate}>{c.title}{c.minOrder ? ` · min ${inr(c.minOrder)}` : ''}</T>
          </View>
        ))}
      </Sheet>
    </Screen>
  );
}
