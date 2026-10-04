import { and, count, eq, ne, sql } from 'drizzle-orm';
import { db, type Tx } from '../../db/client.js';
import {
  addresses, bookingAddons, bookingItems, bookingStatusHistory, bookings, cartItems, couponRedemptions, coupons,
  jobOffers, technicians, timeSlots, type AddressSnapshot,
} from '../../db/schema.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { encrypt, encryptJson, randomDigits } from '../../lib/crypto.js';
import { bookingCode } from '../../lib/codes.js';
import { addDays, hhmmToMinutes, istDate, istMinutes, slotStartInstant } from '../../lib/dates.js';
import { formatINR } from '../../lib/money.js';
import { getSettings } from '../settings/settings.service.js';
import { buildQuote } from '../pricing/quote.service.js';
import { priceAddon } from '../pricing/pricing.js';
import { credit, debit } from '../wallet/wallet.service.js';
import { checkServiceability } from '../location/location.service.js';
import { maybeRewardReferral } from '../referral/referral.service.js';
import { notify } from '../notifications/notify.js';
import { emitToAdmins, emitToBooking, emitToTech } from '../../realtime/io.js';
import { track } from '../analytics/track.js';

export type BookingStatus = (typeof bookings.$inferSelect)['status'];
export type Booking = typeof bookings.$inferSelect;
type Actor = { type: 'CUSTOMER' | 'TECHNICIAN' | 'ADMIN' | 'SYSTEM'; id?: string | null };
type After = Array<() => unknown>;

export const ACTIVE_STATUSES: BookingStatus[] = ['TECHNICIAN_ASSIGNED', 'TECHNICIAN_ON_THE_WAY', 'TECHNICIAN_ARRIVED', 'SERVICE_STARTED', 'SERVICE_COMPLETED', 'PAYMENT_PENDING'];
export const UPCOMING_STATUSES: BookingStatus[] = ['PENDING', 'CONFIRMED'];

/** Runs a transaction, then post-commit side effects (notifications, sockets, assignment). */
export async function withAfter<T>(fn: (tx: Tx, after: After) => Promise<T>): Promise<T> {
  const after: After = [];
  const result = await db.transaction((tx) => fn(tx, after));
  for (const f of after) { try { await f(); } catch { /* side effects never fail the request */ } }
  return result;
}

export async function lockBooking(tx: Tx, id: string) {
  const r = await tx.execute(sql`SELECT id FROM bookings WHERE id = ${id} FOR UPDATE`);
  if (!r.rows.length) throw notFound('Booking');
  const [b] = await tx.select().from(bookings).where(eq(bookings.id, id));
  return b;
}

/** Atomic status transition guarded by the expected current status (optimistic, race-safe). */
export async function transition(tx: Tx, b: Booking, to: BookingStatus, from: BookingStatus[], actor: Actor, note?: string, patch: Partial<typeof bookings.$inferInsert> = {}) {
  if (!from.includes(b.status)) throw conflict(`Booking is ${b.status.replaceAll('_', ' ').toLowerCase()}; this action is not allowed now.`, 'INVALID_STATUS');
  const [u] = await tx.update(bookings).set({ ...patch, status: to, version: sql`${bookings.version} + 1` })
    .where(and(eq(bookings.id, b.id), eq(bookings.version, b.version))).returning();
  if (!u) throw conflict('Booking was updated by someone else. Please refresh.', 'STALE');
  await tx.insert(bookingStatusHistory).values({ bookingId: b.id, fromStatus: b.status, toStatus: to, actorType: actor.type, actorId: actor.id ?? null, note: note ?? null });
  return u;
}

const STATUS_COPY: Partial<Record<BookingStatus, [string, string]>> = {
  CONFIRMED: ['Booking confirmed', 'We are finding the best technician near you.'],
  TECHNICIAN_ASSIGNED: ['Technician assigned', 'Your technician has been assigned.'],
  TECHNICIAN_ON_THE_WAY: ['Technician on the way', 'Your technician is on the way. You can track them live.'],
  TECHNICIAN_ARRIVED: ['Technician arrived', 'Your technician has arrived at your location.'],
  SERVICE_STARTED: ['Service started', 'Your service has started.'],
  PAYMENT_PENDING: ['Service completed', 'Please review the final bill and complete payment.'],
  COMPLETED: ['Service completed', 'Thank you! Please rate your experience.'],
  CANCELLED: ['Booking cancelled', 'Your booking has been cancelled.'],
};
export function announce(after: After, b: Booking, extra: Record<string, unknown> = {}) {
  after.push(() => {
    emitToBooking(b.id, 'booking:update', { id: b.id, status: b.status, paymentStatus: b.paymentStatus, ...extra });
    emitToAdmins('booking:update', { id: b.id, code: b.code, status: b.status });
    const copy = STATUS_COPY[b.status];
    if (copy) {
      const type = b.status === 'CONFIRMED' ? 'BOOKING_CONFIRMED' : b.status === 'PAYMENT_PENDING' || b.status === 'COMPLETED' ? 'SERVICE_COMPLETED' : b.status === 'CANCELLED' ? 'BOOKING_CANCELLED' : (b.status as never);
      return notify(b.customerId, type, `${copy[0]} · ${b.code}`, copy[1], { bookingId: b.id });
    }
  });
}

// ───────────────────────── Create ─────────────────────────
export interface CreateBookingInput {
  addressId: string; date?: string | null; slotId?: string | null; asap?: boolean; problemDescription?: string | null;
  couponCode?: string | null; useWallet?: boolean; paymentMode: 'PAY_NOW' | 'PAY_AFTER_SERVICE'; clientRequestId: string;
  items?: { serviceId: string; quantity: number }[];
}

export async function createBooking(customerId: string, input: CreateBookingInput, actor: Actor = { type: 'CUSTOMER', id: customerId }) {
  const s = await getSettings();
  // idempotent create
  const [dupe] = await db.select().from(bookings).where(and(eq(bookings.customerId, customerId), eq(bookings.clientRequestId, input.clientRequestId)));
  if (dupe) return dupe;

  if (input.paymentMode === 'PAY_NOW' && !s.payments.payNowEnabled) throw badRequest('Online pre-payment is currently unavailable.');
  if (input.paymentMode === 'PAY_AFTER_SERVICE' && !s.payments.payAfterServiceEnabled) throw badRequest('Please pay online to confirm this booking.');

  const [addr] = await db.select().from(addresses).where(and(eq(addresses.id, input.addressId), eq(addresses.userId, customerId)));
  if (!addr || addr.deletedAt) throw notFound('Address');
  const svc = await checkServiceability(addr.pincode);
  if (!svc.serviceable) throw badRequest("Sorry, we currently don't service this location.", 'NOT_SERVICEABLE');

  // slot / date validation
  const today = istDate();
  let date: string; let slot: typeof timeSlots.$inferSelect | null = null; let slotLabel: string;
  if (input.asap) {
    if (!s.booking.asapEnabled || istMinutes() >= s.booking.asapCutoffHour * 60) throw badRequest('ASAP service is not available right now. Please pick a slot.', 'ASAP_UNAVAILABLE');
    date = today; slotLabel = 'ASAP';
  } else {
    if (!input.date || !input.slotId) throw badRequest('Please choose a date and time slot.');
    date = input.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today || date > addDays(today, s.booking.advanceDays)) throw badRequest('Please choose a valid date.', 'INVALID_DATE');
    if (!s.booking.workingDays.includes(new Date(date + 'T00:00:00Z').getUTCDay())) throw badRequest('We are closed on this day. Please pick another date.');
    [slot] = await db.select().from(timeSlots).where(and(eq(timeSlots.id, input.slotId), eq(timeSlots.active, true)));
    if (!slot) throw badRequest('This time slot is not available.', 'INVALID_SLOT');
    if (date === today && hhmmToMinutes(slot.startTime) - istMinutes() < s.booking.minLeadMinutes) throw badRequest('This slot is too soon. Please pick a later slot.', 'SLOT_TOO_SOON');
    slotLabel = slot.label;
  }

  const booking = await withAfter(async (tx, after) => {
    if (slot) {
      // serialise capacity checks for this slot
      await tx.execute(sql`SELECT id FROM time_slots WHERE id = ${slot.id} FOR UPDATE`);
      const [{ n }] = await tx.select({ n: count() }).from(bookings).where(and(eq(bookings.slotId, slot.id), eq(bookings.scheduledDate, date), ne(bookings.status, 'CANCELLED')));
      if (n >= slot.capacity) throw conflict('This slot just got fully booked. Please choose another slot.', 'SLOT_FULL');
    }

    const quote = await buildQuote(tx, customerId, { items: input.items, couponCode: input.couponCode, useWallet: input.useWallet });
    if (!quote.lines.length) throw badRequest('Your cart is empty.', 'CART_EMPTY');
    if (input.couponCode && quote.couponError) throw badRequest(quote.couponError, 'COUPON_INVALID');
    if (quote.totalBeforeWallet < s.booking.minOrderValue) throw badRequest(`Minimum booking value is ${formatINR(s.booking.minOrderValue)}.`, 'MIN_ORDER');

    const needsPayment = input.paymentMode === 'PAY_NOW' && quote.grandTotal > 0;
    const snapshot: AddressSnapshot = { contactName: addr.contactName, contactPhone: addr.contactPhone, houseNo: addr.houseNo, street: addr.street, landmark: addr.landmark, locality: addr.locality, city: addr.city, state: addr.state, pincode: addr.pincode, lat: addr.lat, lng: addr.lng };

    let created: Booking | undefined;
    for (let i = 0; i < 5 && !created; i++) {
      [created] = await tx.insert(bookings).values({
        code: bookingCode(), customerId, addressId: addr.id, addressEnc: encryptJson(snapshot), pincode: addr.pincode, city: addr.city, lat: addr.lat, lng: addr.lng,
        scheduledDate: date, slotId: slot?.id ?? null, slotLabel, isAsap: !!input.asap, problemDescription: input.problemDescription ?? null,
        status: needsPayment ? 'PENDING' : 'CONFIRMED', paymentMode: input.paymentMode, paymentStatus: quote.grandTotal === 0 ? 'PAID' : 'PENDING',
        itemsTotal: quote.itemsTotal, couponDiscount: quote.couponDiscount, walletUsed: quote.walletUsed, taxTotal: quote.taxTotal, taxInclusive: quote.taxInclusive,
        grandTotal: quote.grandTotal, couponId: quote.coupon?.id ?? null, clientRequestId: input.clientRequestId,
        paymentExpiresAt: needsPayment ? new Date(Date.now() + 30 * 60_000) : null,
      }).onConflictDoNothing({ target: bookings.code }).returning();
    }
    if (!created) throw new Error('could not allocate booking code');

    await tx.insert(bookingItems).values(quote.lines.map((l) => ({
      bookingId: created!.id, serviceId: l.serviceId, categoryId: l.categoryId, name: l.name, unitPrice: l.unitPrice, quantity: l.quantity,
      taxRateBps: l.taxRateBps, discount: l.discount, tax: l.tax, lineTotal: l.lineTotal, warrantyDays: l.warrantyDays,
    })));

    if (quote.coupon) {
      // lock the coupon row and re-check the global usage limit
      const r = await tx.execute<{ used_count: number; usage_limit: number | null }>(sql`SELECT used_count, usage_limit FROM coupons WHERE id = ${quote.coupon.id} FOR UPDATE`);
      const c = r.rows[0];
      if (c.usage_limit != null && c.used_count >= c.usage_limit) throw conflict('This coupon has just reached its usage limit.', 'COUPON_EXHAUSTED');
      await tx.update(coupons).set({ usedCount: sql`${coupons.usedCount} + 1` }).where(eq(coupons.id, quote.coupon.id));
      await tx.insert(couponRedemptions).values({ couponId: quote.coupon.id, userId: customerId, bookingId: created.id, discount: quote.couponDiscount, status: 'RESERVED' });
    }
    if (quote.walletUsed > 0) {
      await debit(tx, { userId: customerId, amount: quote.walletUsed, source: 'BOOKING', description: `Used for booking ${created.code}`, idempotencyKey: `booking:${created.id}:wallet`, bookingId: created.id });
      after.push(() => track('wallet_usage', { userId: customerId, props: { amount: quote.walletUsed } }));
    }
    await tx.insert(bookingStatusHistory).values({ bookingId: created.id, fromStatus: null, toStatus: created.status, actorType: actor.type, actorId: actor.id ?? null, note: needsPayment ? 'Awaiting online payment' : null });
    if (!input.items) await tx.delete(cartItems).where(eq(cartItems.userId, customerId));

    after.push(() => track('booking_created', { userId: customerId, props: { bookingId: created!.id, total: quote.grandTotal, mode: input.paymentMode } }));
    if (created.status === 'CONFIRMED') {
      announce(after, created);
      after.push(() => import('./assignment.service.js').then((m) => m.runAssignment(created!.id)));
    }
    return created;
  });
  return booking;
}

// ───────────────────────── Payment confirmed (advance) ─────────────────────────
export async function onAdvancePaid(tx: Tx, b: Booking, after: After) {
  if (b.status !== 'PENDING') return b;
  const u = await transition(tx, b, 'CONFIRMED', ['PENDING'], { type: 'SYSTEM' }, 'Payment received', { paymentExpiresAt: null });
  announce(after, u);
  after.push(() => import('./assignment.service.js').then((m) => m.runAssignment(u.id)));
  return u;
}

// ───────────────────────── Cancel / refund ─────────────────────────
export function cancellationFee(b: Booking, s: Awaited<ReturnType<typeof getSettings>>, by: 'CUSTOMER' | 'TECHNICIAN' | 'ADMIN' | 'SYSTEM', slotStart: string | null) {
  if (by !== 'CUSTOMER') return 0; // never charge the customer for our/our technician's cancellation
  if (b.status === 'PENDING' || (s.cancellation.freeBeforeAssignment && b.status === 'CONFIRMED')) return 0;
  const start = b.isAsap || !slotStart ? b.createdAt : slotStartInstant(b.scheduledDate, slotStart);
  const minsBefore = (start.getTime() - Date.now()) / 60_000;
  return minsBefore >= s.cancellation.freeUntilMinutesBefore ? 0 : s.cancellation.feePaise;
}

export async function cancelBooking(bookingId: string, actor: Actor & { type: 'CUSTOMER' | 'TECHNICIAN' | 'ADMIN' | 'SYSTEM' }, reason: string, opts: { waiveFee?: boolean } = {}) {
  const s = await getSettings();
  return withAfter(async (tx, after) => {
    const b = await lockBooking(tx, bookingId);
    if (actor.type === 'CUSTOMER' && b.customerId !== actor.id) throw forbidden();
    const allowed: BookingStatus[] = actor.type === 'CUSTOMER'
      ? ['PENDING', 'CONFIRMED', 'TECHNICIAN_ASSIGNED', 'TECHNICIAN_ON_THE_WAY']
      : ['PENDING', 'CONFIRMED', 'TECHNICIAN_ASSIGNED', 'TECHNICIAN_ON_THE_WAY', 'TECHNICIAN_ARRIVED'];
    if (!allowed.includes(b.status)) throw conflict(actor.type === 'CUSTOMER' && b.status === 'TECHNICIAN_ARRIVED' ? 'The technician has already arrived. Please contact support to cancel.' : 'This booking can no longer be cancelled.', 'NOT_CANCELLABLE');

    const refundable = b.walletUsed + b.amountPaid;
    const [slotRow] = b.slotId ? await tx.select({ startTime: timeSlots.startTime }).from(timeSlots).where(eq(timeSlots.id, b.slotId)) : [];
    const fee = opts.waiveFee ? 0 : Math.min(cancellationFee(b, s, actor.type, slotRow?.startTime ?? null), refundable);
    const u = await transition(tx, b, 'CANCELLED', allowed, actor, reason, { cancelledBy: actor.type, cancelReason: reason, cancellationFee: fee, paymentExpiresAt: null });

    // release coupon
    const [red] = await tx.select().from(couponRedemptions).where(and(eq(couponRedemptions.bookingId, b.id), eq(couponRedemptions.status, 'RESERVED')));
    if (red) {
      await tx.update(couponRedemptions).set({ status: 'RELEASED' }).where(eq(couponRedemptions.id, red.id));
      await tx.update(coupons).set({ usedCount: sql`GREATEST(${coupons.usedCount} - 1, 0)` }).where(eq(coupons.id, red.couponId));
    }
    // fee is taken from wallet portion first, then from paid amount
    const walletBack = Math.max(0, b.walletUsed - fee);
    const feeFromPaid = Math.max(0, fee - b.walletUsed);
    if (walletBack > 0) await credit(tx, { userId: b.customerId, amount: walletBack, source: 'REFUND', description: `Wallet refund for cancelled booking ${b.code}`, idempotencyKey: `booking:${b.id}:wallet-refund`, bookingId: b.id });
    const paidBack = b.amountPaid - feeFromPaid;
    if (paidBack > 0) {
      const { refundBooking } = await import('../payments/payment.service.js');
      await refundBooking(tx, after, u, paidBack, s.wallet.cancellationRefundTo, `Cancellation of ${b.code}`, actor.id ?? null);
    }
    // close open offers and free the technician
    await tx.update(jobOffers).set({ status: 'CANCELLED' }).where(and(eq(jobOffers.bookingId, b.id), eq(jobOffers.status, 'OFFERED')));
    if (b.technicianId) {
      const techId = b.technicianId;
      after.push(async () => {
        const [t] = await db.select({ userId: technicians.userId }).from(technicians).where(eq(technicians.id, techId));
        emitToTech(techId, 'job:cancelled', { bookingId: b.id });
        if (t) await notify(t.userId, 'BOOKING_CANCELLED', `Job cancelled · ${b.code}`, 'This job has been cancelled.', { bookingId: b.id });
      });
    }
    announce(after, u, { cancellationFee: fee });
    after.push(() => track('booking_cancelled', { userId: b.customerId, props: { by: actor.type, fee } }));
    return u;
  });
}

// ───────────────────────── Reschedule ─────────────────────────
export async function rescheduleBooking(bookingId: string, actor: Actor, date: string, slotId: string) {
  const s = await getSettings();
  const today = istDate();
  if (date < today || date > addDays(today, s.booking.advanceDays)) throw badRequest('Please choose a valid date.');
  const [slot] = await db.select().from(timeSlots).where(and(eq(timeSlots.id, slotId), eq(timeSlots.active, true)));
  if (!slot) throw badRequest('This time slot is not available.');
  if (date === today && hhmmToMinutes(slot.startTime) - istMinutes() < s.booking.minLeadMinutes) throw badRequest('This slot is too soon.');
  return withAfter(async (tx, after) => {
    const b = await lockBooking(tx, bookingId);
    if (actor.type === 'CUSTOMER' && b.customerId !== actor.id) throw forbidden();
    await tx.execute(sql`SELECT id FROM time_slots WHERE id = ${slot.id} FOR UPDATE`);
    const [{ n }] = await tx.select({ n: count() }).from(bookings).where(and(eq(bookings.slotId, slot.id), eq(bookings.scheduledDate, date), ne(bookings.status, 'CANCELLED'), ne(bookings.id, b.id)));
    if (n >= slot.capacity) throw conflict('This slot is fully booked.', 'SLOT_FULL');
    const prevTech = b.technicianId;
    // a new time may not suit the assigned technician → release and re-run assignment
    const u = await transition(tx, b, b.status === 'PENDING' ? 'PENDING' : 'CONFIRMED', ['PENDING', 'CONFIRMED', 'TECHNICIAN_ASSIGNED'], actor, `Rescheduled to ${date} ${slot.label}`,
      { scheduledDate: date, slotId: slot.id, slotLabel: slot.label, isAsap: false, technicianId: null, needsManualAssignment: false, assignmentRound: 0 });
    await tx.update(jobOffers).set({ status: 'CANCELLED' }).where(and(eq(jobOffers.bookingId, b.id), eq(jobOffers.status, 'OFFERED')));
    await tx.delete(jobOffers).where(eq(jobOffers.bookingId, b.id));
    if (prevTech) after.push(() => emitToTech(prevTech, 'job:cancelled', { bookingId: b.id, reason: 'rescheduled' }));
    announce(after, u);
    if (u.status === 'CONFIRMED') after.push(() => import('./assignment.service.js').then((m) => m.runAssignment(u.id)));
    return u;
  });
}

// ───────────────────────── Add-ons (technician-requested) ─────────────────────────
export async function recomputeTotals(tx: Tx, bookingId: string) {
  const [b] = await tx.select().from(bookings).where(eq(bookings.id, bookingId));
  const items = await tx.select().from(bookingItems).where(eq(bookingItems.bookingId, bookingId));
  const addons = await tx.select().from(bookingAddons).where(and(eq(bookingAddons.bookingId, bookingId), eq(bookingAddons.status, 'APPROVED')));
  const itemsNet = items.reduce((a, i) => a + i.lineTotal, 0);
  const addonsTotal = addons.reduce((a, x) => a + x.lineTotal, 0);
  const taxTotal = items.reduce((a, i) => a + i.tax, 0) + addons.reduce((a, x) => a + x.tax, 0);
  const grandTotal = itemsNet + addonsTotal - b.walletUsed;
  const paymentStatus = b.amountPaid >= grandTotal ? 'PAID' : 'PENDING';
  const [u] = await tx.update(bookings).set({ addonsTotal, taxTotal, grandTotal, paymentStatus, version: sql`${bookings.version} + 1` }).where(eq(bookings.id, bookingId)).returning();
  return u;
}

export async function requestAddon(techId: string, bookingId: string, input: { kind: 'SERVICE' | 'PART'; serviceId?: string; name?: string; unitPrice?: number; quantity: number; note?: string; warrantyDays?: number }) {
  const s = await getSettings();
  return withAfter(async (tx, after) => {
    const b = await lockBooking(tx, bookingId);
    if (b.technicianId !== techId) throw forbidden();
    if (!['TECHNICIAN_ARRIVED', 'SERVICE_STARTED'].includes(b.status)) throw conflict('Add-ons can be requested once you have arrived.', 'INVALID_STATUS');
    let name: string, unitPrice: number, taxRateBps: number, warrantyDays: number, serviceId: string | null = null;
    if (input.kind === 'SERVICE') {
      // service prices come from the catalog — technicians cannot invent prices for catalog services
      const { services } = await import('../../db/schema.js');
      const [svc] = await tx.select().from(services).where(and(eq(services.id, input.serviceId ?? ''), eq(services.active, true)));
      if (!svc) throw notFound('Service');
      name = svc.name; unitPrice = svc.discountPrice ?? svc.basePrice; taxRateBps = svc.taxRateBps ?? s.tax.defaultRateBps; warrantyDays = svc.warrantyDays; serviceId = svc.id;
    } else {
      if (!input.name || input.unitPrice == null) throw badRequest('Part name and price are required.');
      if (input.unitPrice <= 0 || input.unitPrice > 50_000_00) throw badRequest('Enter a valid part price.');
      name = input.name; unitPrice = input.unitPrice; taxRateBps = s.tax.defaultRateBps; warrantyDays = input.warrantyDays ?? 0;
    }
    const { tax, lineTotal } = priceAddon(unitPrice, input.quantity, taxRateBps, s.tax);
    const [a] = await tx.insert(bookingAddons).values({ bookingId, kind: input.kind, serviceId, name, note: input.note ?? null, unitPrice, quantity: input.quantity, taxRateBps, tax, lineTotal, warrantyDays, requestedBy: techId }).returning();
    after.push(() => {
      emitToBooking(bookingId, 'addon:requested', a);
      return notify(b.customerId, 'ADDON_REQUESTED', 'Technician has requested an additional service', `${name} · ${formatINR(lineTotal)}. Tap to approve or reject.`, { bookingId, addonId: a.id });
    });
    return a;
  });
}

export async function decideAddon(customerId: string, bookingId: string, addonId: string, approve: boolean) {
  return withAfter(async (tx, after) => {
    const b = await lockBooking(tx, bookingId);
    if (b.customerId !== customerId) throw forbidden();
    if (!['TECHNICIAN_ARRIVED', 'SERVICE_STARTED'].includes(b.status)) throw conflict('This request can no longer be changed.', 'INVALID_STATUS');
    const [a] = await tx.update(bookingAddons).set({ status: approve ? 'APPROVED' : 'REJECTED', decidedAt: new Date() })
      .where(and(eq(bookingAddons.id, addonId), eq(bookingAddons.bookingId, bookingId), eq(bookingAddons.status, 'PENDING'))).returning();
    if (!a) throw conflict('This request was already answered.', 'ALREADY_DECIDED');
    const u = await recomputeTotals(tx, bookingId);
    after.push(() => emitToBooking(bookingId, 'addon:decided', { addonId, status: a.status, grandTotal: u.grandTotal }));
    return { addon: a, booking: u };
  });
}

// ───────────────────────── Completion ─────────────────────────
export async function finalizeCompletion(tx: Tx, b: Booking, after: After, actor: Actor) {
  const s = await getSettings();
  const items = await tx.select({ w: bookingItems.warrantyDays }).from(bookingItems).where(eq(bookingItems.bookingId, b.id));
  const addons = await tx.select({ w: bookingAddons.warrantyDays }).from(bookingAddons).where(and(eq(bookingAddons.bookingId, b.id), eq(bookingAddons.status, 'APPROVED')));
  const maxW = Math.max(0, ...items.map((i) => i.w), ...addons.map((a) => a.w));
  const warrantyDays = maxW || s.warranty.defaultDays;
  const u = await transition(tx, b, 'COMPLETED', ['SERVICE_COMPLETED', 'PAYMENT_PENDING'], actor, 'Payment settled', {
    paymentStatus: 'PAID', completedAt: b.completedAt ?? new Date(), warrantyUntil: warrantyDays ? addDays(istDate(), warrantyDays) : null,
  });
  await tx.update(couponRedemptions).set({ status: 'REDEEMED' }).where(and(eq(couponRedemptions.bookingId, b.id), eq(couponRedemptions.status, 'RESERVED')));
  if (b.technicianId) await tx.update(technicians).set({ completedJobs: sql`${technicians.completedJobs} + 1` }).where(eq(technicians.id, b.technicianId));
  await maybeRewardReferral(tx, u, after);
  announce(after, u);
  after.push(() => track('booking_completed', { userId: b.customerId, props: { bookingId: b.id, total: u.grandTotal } }));
  return u;
}

export async function completeJob(techId: string, bookingId: string) {
  return withAfter(async (tx, after) => {
    const b = await lockBooking(tx, bookingId);
    if (b.technicianId !== techId) throw forbidden();
    const [{ n: pending }] = await tx.select({ n: count() }).from(bookingAddons).where(and(eq(bookingAddons.bookingId, b.id), eq(bookingAddons.status, 'PENDING')));
    if (pending > 0) throw conflict('Waiting for the customer to approve or reject your additional request.', 'ADDON_PENDING');
    const fresh = await recomputeTotals(tx, b.id);
    let u = await transition(tx, fresh, 'SERVICE_COMPLETED', ['SERVICE_STARTED'], { type: 'TECHNICIAN', id: techId }, 'Service completed', { completedAt: new Date() });
    const due = u.grandTotal - u.amountPaid;
    if (due > 0) {
      u = await transition(tx, u, 'PAYMENT_PENDING', ['SERVICE_COMPLETED'], { type: 'SYSTEM' }, `Amount due ${formatINR(due)}`, { paymentStatus: u.amountPaid > 0 ? 'PROCESSING' : 'PENDING' });
      announce(after, u, { amountDue: due });
    } else {
      u = await finalizeCompletion(tx, u, after, { type: 'TECHNICIAN', id: techId });
    }
    await tx.update(technicians).set({ availability: 'AVAILABLE' }).where(and(eq(technicians.id, techId), eq(technicians.availability, 'BUSY')));
    return { booking: u, amountDue: Math.max(0, due) };
  });
}

/** Technician collected cash for the remaining amount (only if admin enabled cash). */
export async function collectCash(techId: string, bookingId: string) {
  const s = await getSettings();
  if (!s.payments.cashEnabled) throw badRequest('Cash payments are disabled.', 'CASH_DISABLED');
  const { payments } = await import('../../db/schema.js');
  return withAfter(async (tx, after) => {
    const b = await lockBooking(tx, bookingId);
    if (b.technicianId !== techId) throw forbidden();
    if (b.status !== 'PAYMENT_PENDING') throw conflict('No payment is due for this booking.', 'INVALID_STATUS');
    const due = b.grandTotal - b.amountPaid;
    await tx.insert(payments).values({ bookingId: b.id, userId: b.customerId, purpose: 'FINAL', provider: 'cash', method: 'cash', amount: due, status: 'PAID', collectedBy: techId });
    const [paid] = await tx.update(bookings).set({ amountPaid: b.amountPaid + due }).where(eq(bookings.id, b.id)).returning();
    const u = await finalizeCompletion(tx, paid, after, { type: 'TECHNICIAN', id: techId });
    after.push(() => notify(b.customerId, 'PAYMENT_SUCCESS', 'Payment received', `${formatINR(due)} paid in cash for ${b.code}.`, { bookingId: b.id }));
    return u;
  });
}

export async function issueStartCode(tx: Tx, bookingId: string) {
  const code = randomDigits(4);
  await tx.update(bookings).set({ startCodeEnc: encrypt(code) }).where(eq(bookings.id, bookingId));
  return code;
}

