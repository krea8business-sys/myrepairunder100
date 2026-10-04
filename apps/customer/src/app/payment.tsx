import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Banner, Button, Card, Gap, Header, Icon, Loading, Row, Screen, T, api, colors, errorMessage, inr } from '@kit';
import { GatewayCheckout, type Order } from '@/components/GatewayCheckout';
import { track } from '@/lib/analytics';

type CreateRes = Order & { provider: string; methods: string[] };

/**
 * Payment: server creates the order (amount computed server-side) → gateway checkout → server verifies with the
 * gateway (and the webhook confirms independently). The app never marks anything as paid by itself.
 */
export default function Payment() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const qc = useQueryClient();
  const [order, setOrder] = useState<CreateRes | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'checkout' | 'verifying' | 'failed'>('loading');
  const [err, setErr] = useState<string | null>(null);

  const create = useCallback(async () => {
    setState('loading'); setErr(null);
    try { const o = await api<CreateRes>('/payments/create', { body: { bookingId } }); setOrder(o); setState('ready'); }
    catch (e) { setErr(errorMessage(e)); setState('failed'); }
  }, [bookingId]);
  useEffect(() => { void create(); }, [create]);

  const verify = async () => {
    setState('verifying');
    for (let i = 0; i < 8; i++) {
      try {
        const r = await api<{ status: 'PAID' | 'FAILED' | 'PENDING' }>('/payments/verify', { body: { orderId: order?.orderId } });
        if (r.status === 'PAID') {
          track('payment_success'); qc.invalidateQueries({ queryKey: ['booking', bookingId] }); qc.invalidateQueries({ queryKey: ['bookings'] });
          return router.replace({ pathname: '/booking-confirmed', params: { id: bookingId } });
        }
        if (r.status === 'FAILED') break;
      } catch { /* retry */ }
      await new Promise((res) => setTimeout(res, 1500));
    }
    track('payment_failure'); setErr('Payment failed. Try again. If money was debited, it will be confirmed automatically or refunded by your bank.'); setState('failed');
  };

  // DEV ONLY: mock gateway (server refuses this in production)
  const mockPay = async (outcome: 'success' | 'failure') => {
    setState('verifying');
    try { await api('/payments/mock/complete', { body: { orderId: order?.orderId, outcome } }); } catch (e) { setErr(errorMessage(e)); }
    await verify();
  };

  return (
    <Screen padded={false} scroll={false}>
      <Header title="Payment" onBack={() => router.replace({ pathname: '/booking/[id]', params: { id: String(bookingId) } })} />
      <Screen edges={[]}>
        {state === 'loading' ? <Loading /> : null}
        {order ? (
          <Card>
            <T v="small" color={colors.muted}>Amount to pay</T>
            <T v="display" color={colors.ink}>{inr(order.amount)}</T>
            <T v="small" color={colors.muted}>Booking {order.bookingCode}</T>
            <Gap h={12} />
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              {['UPI', 'Cards', 'Net banking'].map((m) => <Row key={m} gap={4}><Icon name="checkmark-circle" size={16} color={colors.success} /><T v="small">{m}</T></Row>)}
            </Row>
            <Gap h={4} />
            <Row gap={6}><Icon name="lock-closed" size={14} color={colors.muted} /><T v="small" color={colors.muted}>Payments are processed securely by our payment partner.</T></Row>
          </Card>
        ) : null}
        <Gap h={16} />
        {err ? <><Banner tone="danger" title={err} /><Gap /></> : null}
        {state === 'verifying' ? <><Loading /><T center color={colors.muted}>Confirming your payment…</T></> : null}
        {order && (state === 'ready' || state === 'failed') ? (
          order.provider === 'mock' ? (
            <View>
              <Banner tone="warn" title="Development payment gateway" body="Mock provider for local testing only. Configure Razorpay keys on the server for real payments." />
              <Gap />
              <Button title={`Simulate successful payment · ${inr(order.amount)}`} kind="success" onPress={() => mockPay('success')} />
              <Gap h={8} />
              <Button title="Simulate failed payment" kind="danger" onPress={() => mockPay('failure')} />
            </View>
          ) : <Button title={state === 'failed' ? 'Try again' : `Pay ${inr(order.amount)}`} onPress={() => { setErr(null); setState('checkout'); }} />
        ) : null}
        {state === 'failed' && !order ? <Button title="Retry" onPress={create} /> : null}
      </Screen>
      {state === 'checkout' && order ? <GatewayCheckout order={order} onResult={(r) => { if (r.status === 'success') void verify(); else { setState('failed'); setErr(r.status === 'dismissed' ? 'Payment cancelled. You can try again.' : r.reason ?? 'Payment failed. Try again.'); } }} /> : null}
    </Screen>
  );
}
