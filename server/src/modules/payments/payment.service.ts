import { and, desc, eq, sql } from 'drizzle-orm';
import { db, type Tx } from '../../db/client.js';
import { bookings, paymentEvents, payments, refunds, users } from '../../db/schema.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { paymentsProvider, type WebhookEvent } from '../../providers/payments.js';
import { credit } from '../wallet/wallet.service.js';
import { notify } from '../notifications/notify.js';
import { emitToBooking } from '../../realtime/io.js';
import { formatINR } from '../../lib/money.js';
import { track } from '../analytics/track.js';
import { finalizeCompletion, lockBooking, onAdvancePaid, withAfter, type Booking } from '../bookings/booking.service.js';
import { getSettings } from '../settings/settings.service.js';

type After = Array<() => unknown>;

/** Creates (or reuses) a gateway order for whatever is currently payable on the booking. Amount is computed server-side. */
export async function createPaymentForBooking(userId: string, bookingId: string) {
  const s = await getSettings();
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b) throw notFound('Booking');
  if (b.customerId !== userId) throw forbidden();
  let purpose: 'ADVANCE' | 'FINAL';
  if (b.status === 'PENDING' && b.paymentMode === 'PAY_NOW') {
    if (b.paymentExpiresAt && b.paymentExpiresAt < new Date()) throw conflict('Payment window expired. Please book again.', 'PAYMENT_EXPIRED');
    purpose = 'ADVANCE';
  } else if (b.status === 'PAYMENT_PENDING') purpose = 'FINAL';
  else throw conflict('Nothing is due on this booking right now.', 'NOTHING_DUE');
  const amount = b.grandTotal - b.amountPaid;
  if (amount <= 0) throw conflict('Nothing is due on this booking.', 'NOTHING_DUE');

  // reuse an open order for the same amount (double-tap / app restart safe)
  const [open] = await db.select().from(payments).where(and(eq(payments.bookingId, b.id), eq(payments.status, 'PENDING'), eq(payments.amount, amount), eq(payments.purpose, purpose))).orderBy(desc(payments.createdAt)).limit(1);
  const [u] = await db.select({ name: users.name, phone: users.phone, email: users.email }).from(users).where(eq(users.id, userId));
  const prefill = { name: u?.name ?? '', contact: u?.phone ?? '', email: u?.email ?? '' };
  if (open?.providerOrderId) return { paymentId: open.id, orderId: open.providerOrderId, amount, currency: 'INR', provider: open.provider, keyId: paymentsProvider.name === 'razorpay' ? process.env.RAZORPAY_KEY_ID ?? null : null, prefill, methods: s.payments.methods, bookingCode: b.code };

  const order = await paymentsProvider.createOrder(amount, b.code, { bookingId: b.id, purpose });
  const [p] = await db.insert(payments).values({ bookingId: b.id, userId, purpose, provider: order.provider, providerOrderId: order.orderId, amount, status: 'PENDING' }).returning();
  if (b.paymentStatus === 'PENDING') await db.update(bookings).set({ paymentStatus: 'PROCESSING' }).where(eq(bookings.id, b.id));
  return { paymentId: p.id, orderId: order.orderId, amount, currency: 'INR', provider: order.provider, keyId: order.keyId, prefill, methods: s.payments.methods, bookingCode: b.code };
}

/** Idempotent: marks a payment PAID and advances the booking. Safe to call from webhook AND client verify. */
export async function markPaymentPaid(orderId: string, providerPaymentId: string | undefined, method: string | undefined) {
  return withAfter(async (tx, after) => {
    const r = await tx.execute<{ id: string }>(sql`SELECT id FROM payments WHERE provider_order_id = ${orderId} FOR UPDATE`);
    if (!r.rows.length) throw notFound('Payment');
    const [p] = await tx.select().from(payments).where(eq(payments.id, r.rows[0].id));
    if (p.status === 'PAID' || p.status === 'REFUNDED' || p.status === 'PARTIALLY_REFUNDED') return { payment: p, alreadyProcessed: true };
    const [paid] = await tx.update(payments).set({ status: 'PAID', providerPaymentId: providerPaymentId ?? null, method: method ?? null, failureReason: null }).where(eq(payments.id, p.id)).returning();
    let b = await lockBooking(tx, p.bookingId);
    const amountPaid = b.amountPaid + p.amount;
    [b] = await tx.update(bookings).set({ amountPaid, paymentStatus: amountPaid >= b.grandTotal ? 'PAID' : 'PROCESSING' }).where(eq(bookings.id, b.id)).returning();

    if (b.status === 'CANCELLED') {
      // paid after the booking was cancelled/expired → refund automatically
      await refundBooking(tx, after, b, p.amount, 'SOURCE', 'Payment received after cancellation', null);
    } else if (p.purpose === 'ADVANCE') {
      b = await onAdvancePaid(tx, b, after);
    } else if (b.status === 'PAYMENT_PENDING' && b.amountPaid >= b.grandTotal) {
      b = await finalizeCompletion(tx, b, after, { type: 'SYSTEM' });
    }
    after.push(() => {
      emitToBooking(b.id, 'payment:update', { bookingId: b.id, status: 'PAID', amount: p.amount });
      void track('payment_success', { userId: p.userId, props: { amount: p.amount, method: method ?? null } });
      return notify(p.userId, 'PAYMENT_SUCCESS', 'Payment successful', `${formatINR(p.amount)} received for ${b.code}.`, { bookingId: b.id });
    });
    return { payment: paid, alreadyProcessed: false };
  });
}

export async function markPaymentFailed(orderId: string, reason?: string) {
  const [p] = await db.update(payments).set({ status: 'FAILED', failureReason: reason ?? 'Payment failed' })
    .where(and(eq(payments.providerOrderId, orderId), eq(payments.status, 'PENDING'))).returning();
  if (!p) return;
  await db.update(bookings).set({ paymentStatus: 'PENDING' }).where(and(eq(bookings.id, p.bookingId), eq(bookings.paymentStatus, 'PROCESSING')));
  emitToBooking(p.bookingId, 'payment:update', { bookingId: p.bookingId, status: 'FAILED' });
  void track('payment_failure', { userId: p.userId, props: { reason: reason ?? null } });
  await notify(p.userId, 'PAYMENT_FAILED', 'Payment failed', 'Payment failed. Try again — no money is deducted for failed payments, or it is auto-reversed by your bank.', { bookingId: p.bookingId });
}

/** Client callback — we re-check with the gateway server-to-server; the client's word is never trusted. */
export async function verifyPayment(userId: string, orderId: string) {
  const [p] = await db.select().from(payments).where(eq(payments.providerOrderId, orderId));
  if (!p || p.userId !== userId) throw notFound('Payment');
  if (p.status === 'PAID') return { status: 'PAID' as const };
  const st = await paymentsProvider.fetchOrderPayment(orderId);
  if (st.status === 'PAID') { await markPaymentPaid(orderId, st.paymentId, st.method); return { status: 'PAID' as const }; }
  if (st.status === 'FAILED') { await markPaymentFailed(orderId); return { status: 'FAILED' as const }; }
  return { status: 'PENDING' as const };
}

export async function handleWebhook(raw: Buffer, signature: string | undefined) {
  const ev: WebhookEvent = paymentsProvider.verifyWebhook(raw, signature);
  // replay protection: each gateway event is processed once
  const ins = await db.insert(paymentEvents).values({ provider: paymentsProvider.name, eventId: ev.eventId, type: ev.type, payload: ev.raw as object }).onConflictDoNothing().returning();
  if (!ins.length) return { duplicate: true };
  if (ev.type === 'payment.captured' && ev.orderId) await markPaymentPaid(ev.orderId, ev.paymentId, ev.method);
  else if (ev.type === 'payment.failed' && ev.orderId) await markPaymentFailed(ev.orderId, ev.failureReason);
  else if (ev.type === 'refund.processed' && ev.paymentId) {
    await db.execute(sql`UPDATE refunds SET status = 'PROCESSED', updated_at = now()
      WHERE status = 'PENDING' AND payment_id IN (SELECT id FROM payments WHERE provider_payment_id = ${ev.paymentId})`);
  }
  return { duplicate: false };
}

/**
 * Refund `amount` of what was paid on a booking — to wallet (instant) or to the original method via the gateway.
 * Must be called inside a transaction holding the booking lock.
 */
export async function refundBooking(tx: Tx, after: After, b: Booking, amount: number, destination: 'WALLET' | 'SOURCE', reason: string, initiatedBy: string | null) {
  if (amount <= 0) return;
  if (amount > b.amountPaid) throw badRequest('Refund exceeds amount paid.');
  if (destination === 'WALLET') {
    await credit(tx, { userId: b.customerId, amount, source: 'REFUND', description: `Refund for ${b.code}`, idempotencyKey: `refund:${b.id}:${b.version}:${amount}`, bookingId: b.id });
    await tx.insert(refunds).values({ bookingId: b.id, amount, destination, status: 'PROCESSED', reason, initiatedBy });
  } else {
    let left = amount;
    const paid = await tx.select().from(payments).where(and(eq(payments.bookingId, b.id), sql`${payments.status} IN ('PAID','PARTIALLY_REFUNDED')`));
    for (const p of paid) {
      if (!left) break;
      const can = p.amount - p.refundedAmount;
      if (can <= 0) continue;
      const take = Math.min(can, left);
      if (p.provider === 'cash') {
        // cash can't go back to source — credit wallet instead
        await credit(tx, { userId: b.customerId, amount: take, source: 'REFUND', description: `Refund for ${b.code} (cash payment)`, idempotencyKey: `refund:${p.id}:${p.refundedAmount}:${take}`, bookingId: b.id });
        await tx.insert(refunds).values({ bookingId: b.id, paymentId: p.id, amount: take, destination: 'WALLET', status: 'PROCESSED', reason, initiatedBy });
      } else {
        const r = await paymentsProvider.refund(p.providerPaymentId ?? '', take);
        await tx.insert(refunds).values({ bookingId: b.id, paymentId: p.id, amount: take, destination: 'SOURCE', status: paymentsProvider.name === 'mock' ? 'PROCESSED' : 'PENDING', providerRefundId: r.refundId, reason, initiatedBy });
      }
      const refundedAmount = p.refundedAmount + take;
      await tx.update(payments).set({ refundedAmount, status: refundedAmount >= p.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED' }).where(eq(payments.id, p.id));
      left -= take;
    }
    if (left > 0) throw badRequest('Could not allocate refund to payments.');
  }
  const newPaid = b.amountPaid - amount;
  await tx.update(bookings).set({ amountPaid: newPaid, paymentStatus: newPaid === 0 ? 'REFUNDED' : 'PARTIALLY_REFUNDED' }).where(eq(bookings.id, b.id));
  after.push(() => notify(b.customerId, 'REFUND_PROCESSED', 'Refund initiated', `${formatINR(amount)} ${destination === 'WALLET' ? 'added to your wallet' : 'will reach your original payment method in 5–7 working days'} for ${b.code}.`, { bookingId: b.id }));
}

export async function adminRefund(bookingId: string, amount: number, destination: 'WALLET' | 'SOURCE', reason: string, adminId: string) {
  return withAfter(async (tx, after) => {
    const b = await lockBooking(tx, bookingId);
    await refundBooking(tx, after, b, amount, destination, reason, adminId);
    return { ok: true };
  });
}

