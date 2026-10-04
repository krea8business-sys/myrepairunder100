import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { and, desc, eq, gte, ilike, lte, or, sql, count } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { addresses, bookings, technicians, users, wallets, technicianServiceAreas, technicianSkills, bookingItems } from '../../db/schema.js';
import { requireAdmin } from '../../lib/auth.js';
import { parse } from '../../lib/validate.js';
import { notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { normalizeIndianPhone } from '../../lib/phone.js';
import { referralCodeFor } from '../../lib/codes.js';
import { bookingDetail, bookingSummary } from '../bookings/booking.view.js';
import { cancelBooking, createBooking, rescheduleBooking } from '../bookings/booking.service.js';
import { adminAssign, runAssignment } from '../bookings/assignment.service.js';
import { adminRefund } from '../payments/payment.service.js';
import { TRACKABLE_STATUSES } from '../../realtime/io.js';
import { renderInvoice } from '../bookings/invoice.js';
import { getSettings } from '../settings/settings.service.js';

export const adminBookingsRouter = Router();
const STATUSES = ['PENDING', 'CONFIRMED', 'TECHNICIAN_ASSIGNED', 'TECHNICIAN_ON_THE_WAY', 'TECHNICIAN_ARRIVED', 'SERVICE_STARTED', 'SERVICE_COMPLETED', 'PAYMENT_PENDING', 'COMPLETED', 'CANCELLED'] as const;

adminBookingsRouter.get('/bookings', requireAdmin('bookings.view'), async (req, res) => {
  const q = parse(z.object({
    from: z.string().optional(), to: z.string().optional(), city: z.string().optional(), pincode: z.string().optional(),
    serviceId: z.uuid().optional(), technicianId: z.uuid().optional(), status: z.enum(STATUSES).optional(),
    paymentStatus: z.enum(['PENDING', 'PROCESSING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED']).optional(),
    q: z.string().max(40).optional(), needsAssignment: z.enum(['true']).optional(),
    page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25),
  }), req.query);
  const where = and(
    q.from ? gte(bookings.scheduledDate, q.from) : undefined, q.to ? lte(bookings.scheduledDate, q.to) : undefined,
    q.city ? eq(bookings.city, q.city) : undefined, q.pincode ? eq(bookings.pincode, q.pincode) : undefined,
    q.technicianId ? eq(bookings.technicianId, q.technicianId) : undefined, q.status ? eq(bookings.status, q.status) : undefined,
    q.paymentStatus ? eq(bookings.paymentStatus, q.paymentStatus) : undefined,
    q.serviceId ? sql`EXISTS (SELECT 1 FROM booking_items i WHERE i.booking_id = "bookings"."id" AND i.service_id = ${q.serviceId})` : undefined,
    q.needsAssignment ? and(eq(bookings.needsManualAssignment, true), eq(bookings.status, 'CONFIRMED')) : undefined,
    // booking codes contain letters; only a digits-only search (5+ digits) is treated as a phone number
    q.q ? (/^[\d\s+]{5,}$/.test(q.q.trim()) ? ilike(users.phone, `%${q.q.replace(/\D/g, '')}%`) : ilike(bookings.code, `%${q.q.trim().replace(/[%_]/g, '')}%`)) : undefined,
  );
  const tech = db.$with('tech').as(db.select({ id: technicians.id, name: users.name, code: technicians.code }).from(technicians).innerJoin(users, eq(users.id, technicians.userId)));
  const rows = await db.with(tech).select({
    b: bookings, customerName: users.name, customerPhone: users.phone, technicianName: tech.name, technicianCode: tech.code,
    serviceNames: sql<string>`(SELECT string_agg(i.name, ', ') FROM booking_items i WHERE i.booking_id = "bookings"."id")`,
  }).from(bookings).innerJoin(users, eq(users.id, bookings.customerId)).leftJoin(tech, eq(tech.id, bookings.technicianId))
    .where(where).orderBy(desc(bookings.createdAt)).limit(q.limit).offset((q.page - 1) * q.limit);
  const [{ n }] = await db.select({ n: count() }).from(bookings).innerJoin(users, eq(users.id, bookings.customerId)).where(where);
  res.json({
    items: rows.map((r) => ({ ...bookingSummary({ ...r.b, serviceNames: r.serviceNames, technicianName: r.technicianName }), customerName: r.customerName, customerPhone: r.customerPhone, technicianCode: r.technicianCode, needsManualAssignment: r.b.needsManualAssignment, paymentMode: r.b.paymentMode })),
    total: Number(n), page: q.page, limit: q.limit,
  });
});

adminBookingsRouter.get('/bookings/:id', requireAdmin('bookings.view'), async (req, res) => {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, (req.params.id as string)));
  if (!b) throw notFound('Booking');
  const [c] = await db.select({ id: users.id, name: users.name, phone: users.phone }).from(users).where(eq(users.id, b.customerId));
  const d = await bookingDetail(b, 'ADMIN');
  let technicianLocation = null;
  // admins see technician location only during active jobs
  if (b.technicianId && (TRACKABLE_STATUSES as readonly string[]).includes(b.status)) {
    const [t] = await db.select({ lat: technicians.lastLat, lng: technicians.lastLng, at: technicians.lastLocationAt }).from(technicians).where(eq(technicians.id, b.technicianId));
    if (t?.lat != null) technicianLocation = t;
  }
  res.json({ ...d, customer: c, technicianLocation });
});

/** Eligible technicians for manual assignment, best first. */
adminBookingsRouter.get('/bookings/:id/eligible-technicians', requireAdmin('bookings.manage'), async (req, res) => {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, (req.params.id as string)));
  if (!b) throw notFound('Booking');
  const cats = (await db.select({ c: bookingItems.categoryId }).from(bookingItems).where(eq(bookingItems.bookingId, b.id))).map((r) => r.c);
  const rows = await db.select({
    id: technicians.id, code: technicians.code, name: users.name, availability: technicians.availability, rating: technicians.ratingAvg, ratingCount: technicians.ratingCount,
    servesPincode: sql<boolean>`EXISTS (SELECT 1 FROM ${technicianServiceAreas} a WHERE a.technician_id = "technicians"."id" AND a.pincode = ${b.pincode})`,
    skillMatch: sql<number>`(SELECT COUNT(DISTINCT k.category_id) FROM ${technicianSkills} k WHERE k.technician_id = "technicians"."id" AND k.category_id IN ${cats.length ? cats : ['00000000-0000-0000-0000-000000000000']})`.mapWith(Number),
    load: sql<number>`(SELECT COUNT(*) FROM bookings b2 WHERE b2.technician_id = "technicians"."id" AND b2.scheduled_date = ${b.scheduledDate} AND b2.status NOT IN ('CANCELLED','COMPLETED'))`.mapWith(Number),
  }).from(technicians).innerJoin(users, eq(users.id, technicians.userId)).where(eq(technicians.status, 'APPROVED'));
  const need = new Set(cats).size;
  res.json(rows.map((r) => ({ ...r, skillsOk: r.skillMatch >= need })).sort((a, z2) => Number(z2.servesPincode) - Number(a.servesPincode) || Number(z2.skillsOk) - Number(a.skillsOk) || a.load - z2.load));
});

adminBookingsRouter.post('/bookings/:id/assign', requireAdmin('bookings.manage'), async (req, res) => {
  const { technicianId } = parse(z.object({ technicianId: z.uuid() }), req.body);
  const b = await adminAssign((req.params.id as string), technicianId, req.admin!.sub);
  await audit({ req, action: 'booking.assign', entity: 'booking', entityId: b.id, after: { technicianId } });
  res.json(await bookingDetail(b, 'ADMIN'));
});
adminBookingsRouter.post('/bookings/:id/auto-assign', requireAdmin('bookings.manage'), async (req, res) => {
  await db.update(bookings).set({ assignmentRound: 0, needsManualAssignment: false }).where(eq(bookings.id, (req.params.id as string)));
  res.json(await runAssignment((req.params.id as string)));
});
adminBookingsRouter.post('/bookings/:id/cancel', requireAdmin('bookings.cancel'), async (req, res) => {
  const b = parse(z.object({ reason: z.string().trim().min(3).max(300), waiveFee: z.boolean().default(true) }), req.body);
  const u = await cancelBooking((req.params.id as string), { type: 'ADMIN', id: req.admin!.sub }, b.reason, { waiveFee: b.waiveFee });
  await audit({ req, action: 'booking.cancel', entity: 'booking', entityId: u.id, after: b });
  res.json(await bookingDetail(u, 'ADMIN'));
});
adminBookingsRouter.post('/bookings/:id/reschedule', requireAdmin('bookings.manage'), async (req, res) => {
  const b = parse(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), slotId: z.uuid() }), req.body);
  const u = await rescheduleBooking((req.params.id as string), { type: 'ADMIN', id: req.admin!.sub }, b.date, b.slotId);
  await audit({ req, action: 'booking.reschedule', entity: 'booking', entityId: u.id, after: b });
  res.json(await bookingDetail(u, 'ADMIN'));
});
adminBookingsRouter.patch('/bookings/:id', requireAdmin('bookings.manage'), async (req, res) => {
  const b = parse(z.object({ adminNotes: z.string().max(2000).optional(), problemDescription: z.string().max(500).optional() }), req.body);
  const [before] = await db.select({ adminNotes: bookings.adminNotes, problemDescription: bookings.problemDescription }).from(bookings).where(eq(bookings.id, (req.params.id as string)));
  if (!before) throw notFound('Booking');
  const [u] = await db.update(bookings).set(b).where(eq(bookings.id, (req.params.id as string))).returning();
  await audit({ req, action: 'booking.edit', entity: 'booking', entityId: u.id, before, after: b });
  res.json(await bookingDetail(u, 'ADMIN'));
});
adminBookingsRouter.post('/bookings/:id/refund', requireAdmin('payments.refund'), async (req, res) => {
  const b = parse(z.object({ amount: z.number().int().positive(), destination: z.enum(['WALLET', 'SOURCE']), reason: z.string().trim().min(3).max(300) }), req.body);
  await adminRefund((req.params.id as string), b.amount, b.destination, b.reason, req.admin!.sub);
  await audit({ req, action: 'booking.refund', entity: 'booking', entityId: (req.params.id as string), after: b });
  const [u] = await db.select().from(bookings).where(eq(bookings.id, (req.params.id as string)));
  res.json(await bookingDetail(u, 'ADMIN'));
});
adminBookingsRouter.get('/bookings/:id/invoice.pdf', requireAdmin('bookings.view'), async (req, res) => {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, (req.params.id as string)));
  if (!b) throw notFound('Booking');
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, b.customerId));
  res.setHeader('Content-Type', 'application/pdf');
  renderInvoice(await bookingDetail(b, 'ADMIN'), await getSettings(), u?.name ?? null, res);
});

/** Phone bookings: admin creates a booking for a customer (customer + address created if new). */
adminBookingsRouter.post('/bookings', requireAdmin('bookings.manage'), async (req, res) => {
  const b = parse(z.object({
    phone: z.string(), name: z.string().trim().min(2).max(120),
    address: z.object({ houseNo: z.string().min(1).max(120), street: z.string().max(200).optional(), landmark: z.string().max(200).optional(), locality: z.string().max(120).optional(), city: z.string().min(2).max(80), state: z.string().min(2).max(80), pincode: z.string().regex(/^\d{6}$/), lat: z.number().optional(), lng: z.number().optional() }),
    items: z.array(z.object({ serviceId: z.uuid(), quantity: z.number().int().min(1).max(10) })).min(1),
    date: z.string().optional(), slotId: z.uuid().optional(), asap: z.boolean().optional(), problemDescription: z.string().max(500).optional(),
    couponCode: z.string().max(32).optional(),
  }), req.body);
  const phone = normalizeIndianPhone(b.phone);
  let [cust] = await db.select().from(users).where(and(eq(users.phone, phone), eq(users.role, 'CUSTOMER')));
  if (!cust) {
    [cust] = await db.insert(users).values({ phone, name: b.name, role: 'CUSTOMER', referralCode: referralCodeFor() }).returning();
    await db.insert(wallets).values({ userId: cust.id }).onConflictDoNothing();
  }
  const [addr] = await db.insert(addresses).values({ userId: cust.id, label: 'OTHER', contactName: b.name, contactPhone: phone, ...b.address }).returning();
  const booking = await createBooking(cust.id, {
    addressId: addr.id, items: b.items, date: b.date, slotId: b.slotId, asap: b.asap, problemDescription: b.problemDescription, couponCode: b.couponCode,
    useWallet: false, paymentMode: 'PAY_AFTER_SERVICE', clientRequestId: 'admin-' + crypto.randomUUID(),
  }, { type: 'ADMIN', id: req.admin!.sub });
  await audit({ req, action: 'booking.create', entity: 'booking', entityId: booking.id });
  res.status(201).json(await bookingDetail(booking, 'ADMIN'));
});

