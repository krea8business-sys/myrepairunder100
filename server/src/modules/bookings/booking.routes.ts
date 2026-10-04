import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { bookingMessages, bookings, reviews, technicians, users, warrantyClaims } from '../../db/schema.js';
import { requireCustomer, requireUser } from '../../lib/auth.js';
import { parse } from '../../lib/validate.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { ACTIVE_STATUSES, UPCOMING_STATUSES, cancelBooking, createBooking, decideAddon, rescheduleBooking } from './booking.service.js';
import { bookingDetail, bookingSummary } from './booking.view.js';
import { renderInvoice } from './invoice.js';
import { getSettings } from '../settings/settings.service.js';
import { maps } from '../../providers/maps.js';
import { TRACKABLE_STATUSES, emitToBooking } from '../../realtime/io.js';
import { haversineKm, roughEtaMins } from '../../lib/geo.js';
import { notify } from '../notifications/notify.js';
import { track } from '../analytics/track.js';
import { istDate } from '../../lib/dates.js';
import { env } from '../../config/env.js';
import { signFileToken, verifyFileToken } from '../../providers/storage.js';

export const bookingRouter = Router();

const createSchema = z.object({
  addressId: z.uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  slotId: z.uuid().optional().nullable(),
  asap: z.boolean().optional(),
  problemDescription: z.string().trim().max(500).optional().nullable(),
  couponCode: z.string().trim().max(32).optional().nullable(),
  useWallet: z.boolean().default(false),
  paymentMode: z.enum(['PAY_NOW', 'PAY_AFTER_SERVICE']),
  clientRequestId: z.string().min(8).max(64),
});

bookingRouter.post('/', requireCustomer, async (req, res) => {
  const body = parse(createSchema, req.body);
  void track('checkout_started', { userId: req.user!.sub });
  const b = await createBooking(req.user!.sub, body);
  res.status(201).json({ booking: await bookingDetail(b, 'CUSTOMER'), requiresPayment: b.status === 'PENDING' });
});

const TABS = {
  upcoming: UPCOMING_STATUSES,
  active: ACTIVE_STATUSES,
  completed: ['COMPLETED'],
  cancelled: ['CANCELLED'],
} as const;

bookingRouter.get('/', requireCustomer, async (req, res) => {
  const q = parse(z.object({ tab: z.enum(['upcoming', 'active', 'completed', 'cancelled']).optional(), page: z.coerce.number().int().min(1).default(1) }), req.query);
  const rows = await db.select({
    b: bookings,
    serviceNames: sql<string>`(SELECT string_agg(i.name, ', ') FROM booking_items i WHERE i.booking_id = "bookings"."id")`,
    technicianName: users.name,
  }).from(bookings)
    .leftJoin(technicians, eq(technicians.id, bookings.technicianId)).leftJoin(users, eq(users.id, technicians.userId))
    .where(and(eq(bookings.customerId, req.user!.sub), q.tab ? inArray(bookings.status, [...TABS[q.tab]]) : undefined))
    .orderBy(desc(bookings.createdAt)).limit(20).offset((q.page - 1) * 20);
  res.json({ items: rows.map((r) => bookingSummary({ ...r.b, serviceNames: r.serviceNames, technicianName: r.technicianName })), page: q.page, hasMore: rows.length === 20 });
});

async function ownBooking(customerId: string, id: string) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, id));
  if (!b || b.customerId !== customerId) throw notFound('Booking');
  return b;
}

bookingRouter.get('/:id', requireCustomer, async (req, res) => {
  res.json(await bookingDetail(await ownBooking(req.user!.sub, (req.params.id as string)), 'CUSTOMER'));
});

bookingRouter.post('/:id/cancel', requireCustomer, async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(2).max(300).default('Changed my mind') }), req.body ?? {});
  const b = await cancelBooking((req.params.id as string), { type: 'CUSTOMER', id: req.user!.sub }, reason);
  res.json(await bookingDetail(b, 'CUSTOMER'));
});

/** Shows the fee (if any) before the customer confirms cancellation. */
bookingRouter.get('/:id/cancel-preview', requireCustomer, async (req, res) => {
  const b = await ownBooking(req.user!.sub, (req.params.id as string));
  const s = await getSettings();
  const { cancellationFee } = await import('./booking.service.js');
  const { timeSlots } = await import('../../db/schema.js');
  const [slot] = b.slotId ? await db.select().from(timeSlots).where(eq(timeSlots.id, b.slotId)) : [];
  const fee = Math.min(cancellationFee(b, s, 'CUSTOMER', slot?.startTime ?? null), b.walletUsed + b.amountPaid);
  res.json({ fee, refund: b.walletUsed + b.amountPaid - fee, refundTo: s.wallet.cancellationRefundTo, walletRefund: Math.max(0, b.walletUsed - fee) });
});

bookingRouter.post('/:id/reschedule', requireCustomer, async (req, res) => {
  const b = parse(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), slotId: z.uuid() }), req.body);
  const u = await rescheduleBooking((req.params.id as string), { type: 'CUSTOMER', id: req.user!.sub }, b.date, b.slotId);
  res.json(await bookingDetail(u, 'CUSTOMER'));
});

bookingRouter.post('/:id/addons/:addonId/decision', requireCustomer, async (req, res) => {
  const { approve } = parse(z.object({ approve: z.boolean() }), req.body);
  const r = await decideAddon(req.user!.sub, (req.params.id as string), (req.params.addonId as string), approve);
  res.json(await bookingDetail(r.booking, 'CUSTOMER'));
});

/** Live tracking snapshot. Technician location is returned ONLY while the job is active and they are travelling/arrived. */
bookingRouter.get('/:id/tracking', requireCustomer, async (req, res) => {
  const b = await ownBooking(req.user!.sub, (req.params.id as string));
  const s = await getSettings();
  if (!(TRACKABLE_STATUSES as readonly string[]).includes(b.status) || !b.technicianId) return res.json({ trackable: false, status: b.status });
  const order = TRACKABLE_STATUSES.indexOf(b.status as never);
  const shareFrom = TRACKABLE_STATUSES.indexOf(s.tracking.shareFromStatus as never);
  const [t] = await db.select().from(technicians).where(eq(technicians.id, b.technicianId));
  const fresh = t?.lastLocationAt && Date.now() - t.lastLocationAt.getTime() < 10 * 60_000;
  const share = s.features.liveTracking && order >= shareFrom && b.status !== 'SERVICE_STARTED' && fresh && t.lastLat != null;
  let eta: { km: number; mins: number } | null = null;
  if (share && b.lat != null && b.lng != null) {
    try { eta = await maps.eta({ lat: t!.lastLat!, lng: t!.lastLng! }, { lat: b.lat, lng: b.lng }); }
    catch { const km = haversineKm({ lat: t!.lastLat!, lng: t!.lastLng! }, { lat: b.lat, lng: b.lng }); eta = { km, mins: roughEtaMins(km) }; }
  }
  res.json({
    trackable: true, status: b.status,
    customer: b.lat != null ? { lat: b.lat, lng: b.lng } : null,
    technician: share ? { lat: t!.lastLat, lng: t!.lastLng, at: t!.lastLocationAt } : null,
    eta: eta ? { km: Math.round(eta.km * 10) / 10, mins: eta.mins } : null,
  });
});

bookingRouter.get('/:id/invoice.pdf', requireCustomer, async (req, res) => {
  const b = await ownBooking(req.user!.sub, (req.params.id as string));
  if (b.status === 'CANCELLED') throw badRequest('No invoice for cancelled bookings.');
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, b.customerId));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${b.code}.pdf"`);
  renderInvoice(await bookingDetail(b, 'CUSTOMER'), await getSettings(), u?.name ?? null, res);
});

/** Short-lived signed link so the invoice opens in the phone's browser / PDF viewer without exposing the token. */
bookingRouter.get('/:id/invoice-link', requireCustomer, async (req, res) => {
  const b = await ownBooking(req.user!.sub, (req.params.id as string));
  if (b.status === 'CANCELLED') throw badRequest('No invoice for cancelled bookings.');
  const exp = Math.floor(Date.now() / 1000) + 600;
  res.json({ url: `${env.PUBLIC_BASE_URL}/v1/bookings/${b.id}/invoice-signed.pdf?exp=${exp}&sig=${signFileToken('invoice:' + b.id, exp)}` });
});
bookingRouter.get('/:id/invoice-signed.pdf', async (req, res) => {
  const id = req.params.id as string; const exp = Number(req.query.exp); const sig = String(req.query.sig ?? '');
  if (!verifyFileToken('invoice:' + id, exp, sig)) throw forbidden('Link expired. Please download again from the app.');
  const [b] = await db.select().from(bookings).where(eq(bookings.id, id));
  if (!b) throw notFound('Booking');
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, b.customerId));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${b.code}.pdf"`);
  renderInvoice(await bookingDetail(b, 'CUSTOMER'), await getSettings(), u?.name ?? null, res);
});

bookingRouter.post('/:id/review', requireCustomer, async (req, res) => {
  const body = parse(z.object({ technicianRating: z.number().int().min(1).max(5), serviceRating: z.number().int().min(1).max(5), comment: z.string().trim().max(1000).optional() }), req.body);
  if (!(await getSettings()).features.reviews) throw conflict('Ratings are turned off.', 'FEATURE_OFF');
  const b = await ownBooking(req.user!.sub, (req.params.id as string));
  if (b.status !== 'COMPLETED') throw conflict('You can rate once the service is completed.', 'NOT_COMPLETED');
  await db.transaction(async (tx) => {
    const ins = await tx.insert(reviews).values({ bookingId: b.id, customerId: b.customerId, technicianId: b.technicianId, ...body }).onConflictDoNothing().returning();
    if (!ins.length) throw conflict('You have already rated this booking.', 'ALREADY_REVIEWED');
    if (b.technicianId) await recomputeRating(tx, b.technicianId);
  });
  res.status(201).json({ ok: true });
});

export async function recomputeRating(tx: Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db, techId: string) {
  await tx.execute(sql`UPDATE technicians SET
    rating_avg = COALESCE((SELECT AVG(technician_rating)::float FROM reviews WHERE technician_id = ${techId} AND NOT hidden), 0),
    rating_count = (SELECT COUNT(*) FROM reviews WHERE technician_id = ${techId} AND NOT hidden) WHERE id = ${techId}`);
}

bookingRouter.post('/:id/warranty-claim', requireCustomer, async (req, res) => {
  const { description } = parse(z.object({ description: z.string().trim().min(10).max(1000) }), req.body);
  if (!(await getSettings()).features.warrantyClaims) throw conflict('Warranty requests are handled by phone. Please contact support.', 'FEATURE_OFF');
  const b = await ownBooking(req.user!.sub, (req.params.id as string));
  if (b.status !== 'COMPLETED' || !b.warrantyUntil || b.warrantyUntil < istDate()) throw conflict('This booking is not under warranty.', 'NO_WARRANTY');
  const open = await db.select().from(warrantyClaims).where(and(eq(warrantyClaims.bookingId, b.id), inArray(warrantyClaims.status, ['REQUESTED', 'APPROVED'])));
  if (open.length) throw conflict('A warranty request for this booking is already open.', 'CLAIM_OPEN');
  const [c] = await db.insert(warrantyClaims).values({ bookingId: b.id, userId: b.customerId, description }).returning();
  res.status(201).json(c);
});

// ───────────── In-app chat (customer ↔ assigned technician, only during the job) ─────────────
async function chatAccess(req: Parameters<Parameters<typeof bookingRouter.get>[1]>[0], id: string) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, id));
  if (!b) throw notFound('Booking');
  const u = req.user!;
  const isCustomer = u.role === 'CUSTOMER' && b.customerId === u.sub;
  const isTech = u.role === 'TECHNICIAN' && !!u.tid && b.technicianId === u.tid;
  if (!isCustomer && !isTech) throw forbidden();
  return { b, isCustomer };
}
bookingRouter.get('/:id/messages', requireUser(), async (req, res) => {
  await chatAccess(req, (req.params.id as string));
  res.json(await db.select().from(bookingMessages).where(eq(bookingMessages.bookingId, (req.params.id as string))).orderBy(bookingMessages.createdAt).limit(200));
});
bookingRouter.post('/:id/messages', requireUser(), async (req, res) => {
  const { message } = parse(z.object({ message: z.string().trim().min(1).max(1000) }), req.body);
  const { b, isCustomer } = await chatAccess(req, (req.params.id as string));
  if (!(await getSettings()).features.chat) throw conflict('Chat is turned off. Please call instead.', 'FEATURE_OFF');
  if (!b.technicianId || [...['COMPLETED', 'CANCELLED']].includes(b.status)) throw conflict('Chat is available only during an active booking.', 'CHAT_CLOSED');
  const [m] = await db.insert(bookingMessages).values({ bookingId: b.id, senderType: isCustomer ? 'CUSTOMER' : 'TECHNICIAN', senderId: req.user!.sub, message }).returning();
  emitToBooking(b.id, 'chat:message', m);
  if (isCustomer) {
    const [t] = await db.select({ userId: technicians.userId }).from(technicians).where(eq(technicians.id, b.technicianId));
    if (t) void notify(t.userId, 'CHAT_MESSAGE', `Message from customer · ${b.code}`, message.slice(0, 120), { bookingId: b.id });
  } else void notify(b.customerId, 'CHAT_MESSAGE', 'Message from your technician', message.slice(0, 120), { bookingId: b.id });
  res.status(201).json(m);
});

