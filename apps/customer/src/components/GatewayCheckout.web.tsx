import { useEffect } from 'react';
import { colors } from '@kit';
import type { Order } from './GatewayCheckout';
export type { Order };

declare global { interface Window { Razorpay?: new (o: unknown) => { open(): void; on(e: string, f: (r: { error?: { description?: string } }) => void): void } } }

/** Web: load checkout.js into the page and open the Razorpay modal. */
export function GatewayCheckout({ order, onResult }: { order: Order | null; onResult: (r: { status: 'success' | 'failed' | 'dismissed'; reason?: string }) => void }) {
  useEffect(() => {
    if (!order) return;
    const open = () => {
      const rzp = new window.Razorpay!({ key: order.keyId, amount: order.amount, currency: 'INR', order_id: order.orderId, name: 'MyRepairUnder100', description: `Booking ${order.bookingCode}`, prefill: order.prefill, theme: { color: colors.blue },
        handler: () => onResult({ status: 'success' }), modal: { ondismiss: () => onResult({ status: 'dismissed' }) } });
      rzp.on('payment.failed', (r) => onResult({ status: 'failed', reason: r.error?.description }));
      rzp.open();
    };
    if (window.Razorpay) return open();
    const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.onload = open; s.onerror = () => onResult({ status: 'failed', reason: 'Could not load payment page' });
    document.body.appendChild(s);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.orderId]);
  return null;
}
