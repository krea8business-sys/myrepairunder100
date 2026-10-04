import { Router } from 'express';
import { z } from 'zod';
import { and, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  bookings, couponRedemptions, coupons, pincodes, referrals, refreshTokens, supportTickets, technicianDocuments, technicianServiceAreas, technicianSkills,
  technicians, users, wallets, categories, walletTransactions,
} from '../../db/schema.js';
import { requireAdmin } from '../../lib/auth.js';
import { parse } from '../../lib/validate.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { normalizeIndianPhone, maskPhone } from '../../lib/phone.js';
import { nextCounter, referralCodeFor } from '../../lib/codes.js';
import { storage } from '../../providers/storage.js';
import { notify } from '../notifications/notify.js';
import { bookingSummary } from '../bookings/booking.view.js';

export const adminPeopleRouter = Router();
const page = z.object({ q: z.string().max(60).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) });
const esc = (s: string) => s.replace(/[%_\\]/g, '');

// ───────────── Customers ─────────────
adminPeopleRouter.get('/customers', requireAdmin('customers.view'), async (req, res) => {
  const q = parse(page, req.query);
  const where = and(eq(users.role, 'CUSTOMER'), sql`${users.status} <> 'DELETED'`, q.q ? or(ilike(users.name, `%${esc(q.q)}%`), ilike(users.phone, `%${esc(q.q.replace(/\s/g, ''))}%`), eq(users.referralCode, q.q.toUpperCase())) : undefined);
  const rows = await db.select({
    id: users.id, name: users.name, phone: users.phone, status: users.status, referralCode: users.referralCode, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt,
    walletBalance: wallets.balance,
    bookings: sql<number>`(SELECT COUNT(*) FROM bookings b WHERE b.customer_id = "users"."id")`.mapWith(Number),
  }).from(users).leftJoin(wallets, eq(wallets.userId, users.id)).where(where).orderBy(desc(users.createdAt)).limit(q.limit).offset((q.page - 1) * q.limit);
  const [{ n }] = await db.select({ n: count() }).from(users).where(where);
  // SUPPORT role sees masked phone numbers in lists (data minimisation)
  const mask = req.admin!.role === 'SUPPORT';
  res.json({ items: rows.map((r) => ({ ...r, phone: mask ? maskPhone(r.phone) : r.phone })), total: Number(n), page: q.page, limit: q.limit });
});

adminPeopleRouter.get('/customers/:id', requireAdmin('customers.view'), async (req, res) => {
  const [u] = await db.select().from(users).where(and(eq(users.id, (req.params.id as string)), eq(users.role, 'CUSTOMER')));
  if (!u) throw notFound('Customer');
  const [w] = await db.select().from(wallets).where(eq(wallets.userId, u.id));
  const [bks, txns, refsOut, [refIn], tickets, coupon] = await Promise.all([
    db.select({ b: bookings, serviceNames: sql<string>`(SELECT string_agg(i.name, ', ') FROM booking_items i WHERE i.booking_id = "bookings"."id")` }).from(bookings).where(eq(bookings.customerId, u.id)).orderBy(desc(bookings.createdAt)).limit(50),
    db.select().from(walletTransactions).where(eq(walletTransactions.userId, u.id)).orderBy(desc(walletTransactions.createdAt)).limit(50),
    db.select({ id: referrals.id, status: referrals.status, reward: referrals.referrerReward, createdAt: referrals.createdAt, refereeName: users.name, blockReason: referrals.blockReason }).from(referrals).innerJoin(users, eq(users.id, referrals.refereeId)).where(eq(referrals.referrerId, u.id)).orderBy(desc(referrals.createdAt)),
    db.select().from(referrals).where(eq(referrals.refereeId, u.id)),
    db.select().from(supportTickets).where(eq(supportTickets.userId, u.id)).orderBy(desc(supportTickets.createdAt)).limit(20),
    db.select({ code: coupons.code, discount: couponRedemptions.discount, status: couponRedemptions.status, createdAt: couponRedemptions.createdAt }).from(couponRedemptions).innerJoin(coupons, eq(coupons.id, couponRedemptions.couponId)).where(eq(couponRedemptions.userId, u.id)),
  ]);
  const mask = req.admin!.role === 'SUPPORT';
  res.json({
    id: u.id, name: u.name, phone: mask ? maskPhone(u.phone) : u.phone, email: u.email, status: u.status, referralCode: u.referralCode, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt,
    walletBalance: w?.balance ?? 0, walletTransactions: txns,
    bookings: bks.map((r) => bookingSummary({ ...r.b, serviceNames: r.serviceNames })),
    referralsMade: refsOut, referredBy: refIn ?? null, tickets, coupons: coupon,
  });
});

adminPeopleRouter.post('/customers/:id/status', requireAdmin('customers.manage'), async (req, res) => {
  const { status, reason } = parse(z.object({ status: z.enum(['ACTIVE', 'BLOCKED']), reason: z.string().min(3).max(300) }), req.body);
  const [before] = await db.select({ status: users.status }).from(users).where(eq(users.id, (req.params.id as string)));
  if (!before || before.status === 'DELETED') throw notFound('Customer');
  await db.update(users).set({ status }).where(eq(users.id, (req.params.id as string)));
  if (status === 'BLOCKED') await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.userId, (req.params.id as string)));
  await audit({ req, action: `customer.${status === 'BLOCKED' ? 'block' : 'unblock'}`, entity: 'user', entityId: (req.params.id as string), before, after: { status, reason } });
  res.json({ ok: true });
});

// ───────────── Technicians ─────────────
adminPeopleRouter.get('/technicians', requireAdmin('technicians.view'), async (req, res) => {
  const q = parse(page.extend({ status: z.enum(['PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED']).optional() }), req.query);
  const where = and(q.status ? eq(technicians.status, q.status) : undefined, q.q ? or(ilike(users.name, `%${esc(q.q)}%`), ilike(users.phone, `%${esc(q.q)}%`), ilike(technicians.code, `%${esc(q.q)}%`)) : undefined);
  const rows = await db.select({
    id: technicians.id, code: technicians.code, name: users.name, phone: users.phone, status: technicians.status, availability: technicians.availability,
    rating: technicians.ratingAvg, ratingCount: technicians.ratingCount, completedJobs: technicians.completedJobs, createdAt: technicians.createdAt,
    skills: sql<string>`(SELECT string_agg(c.name, ', ') FROM technician_skills k JOIN categories c ON c.id = k.category_id WHERE k.technician_id = "technicians"."id")`,
    areas: sql<number>`(SELECT COUNT(*) FROM technician_service_areas a WHERE a.technician_id = "technicians"."id")`.mapWith(Number),
    activeJobs: sql<number>`(SELECT COUNT(*) FROM bookings b WHERE b.technician_id = "technicians"."id" AND b.status IN ('TECHNICIAN_ASSIGNED','TECHNICIAN_ON_THE_WAY','TECHNICIAN_ARRIVED','SERVICE_STARTED','PAYMENT_PENDING'))`.mapWith(Number),
  }).from(technicians).innerJoin(users, eq(users.id, technicians.userId)).where(where).orderBy(desc(technicians.createdAt)).limit(q.limit).offset((q.page - 1) * q.limit);
  const [{ n }] = await db.select({ n: count() }).from(technicians).innerJoin(users, eq(users.id, technicians.userId)).where(where);
  res.json({ items: rows, total: Number(n), page: q.page, limit: q.limit });
});

adminPeopleRouter.get('/technicians/:id', requireAdmin('technicians.view'), async (req, res) => {
  const [r] = await db.select({ t: technicians, u: users }).from(technicians).innerJoin(users, eq(users.id, technicians.userId)).where(eq(technicians.id, (req.params.id as string)));
  if (!r) throw notFound('Technician');
  const [skills, areas, docs, jobs] = await Promise.all([
    db.select({ id: categories.id, name: categories.name }).from(technicianSkills).innerJoin(categories, eq(categories.id, technicianSkills.categoryId)).where(eq(technicianSkills.technicianId, r.t.id)),
    db.select({ pincode: technicianServiceAreas.pincode, area: pincodes.area }).from(technicianServiceAreas).innerJoin(pincodes, eq(pincodes.pincode, technicianServiceAreas.pincode)).where(eq(technicianServiceAreas.technicianId, r.t.id)),
    db.select().from(technicianDocuments).where(eq(technicianDocuments.technicianId, r.t.id)).orderBy(desc(technicianDocuments.createdAt)),
    db.select({ b: bookings, serviceNames: sql<string>`(SELECT string_agg(i.name, ', ') FROM booking_items i WHERE i.booking_id = "bookings"."id")` }).from(bookings).where(eq(bookings.technicianId, r.t.id)).orderBy(desc(bookings.createdAt)).limit(30),
  ]);
  const activeJob = jobs.find((j) => ['TECHNICIAN_ON_THE_WAY', 'TECHNICIAN_ARRIVED'].includes(j.b.status));
  const earned = await db.execute<{ v: number; n: number }>(sql`SELECT COALESCE(SUM(items_total - coupon_discount + addons_total),0)::int AS v, COUNT(*)::int AS n FROM bookings WHERE technician_id = ${r.t.id} AND status = 'COMPLETED' AND completed_at > now() - interval '30 days'`);
  res.json({
    id: r.t.id, code: r.t.code, status: r.t.status, availability: r.t.availability, name: r.u.name, phone: r.u.phone, experienceYears: r.t.experienceYears, bio: r.t.bio,
    rating: r.t.ratingCount ? r.t.ratingAvg : null, ratingCount: r.t.ratingCount, completedJobs: r.t.completedJobs, payoutRateBps: r.t.payoutRateBps, approvedAt: r.t.approvedAt, createdAt: r.t.createdAt,
    photoUrl: r.t.photoUrl ? await storage.signedUrl(r.t.photoUrl) : null,
    skills, serviceAreas: areas,
    documents: await Promise.all(docs.map(async (d) => ({ id: d.id, type: d.type, status: d.status, createdAt: d.createdAt, url: await storage.signedUrl(d.fileKey, 600) }))),
    jobs: jobs.map((j) => bookingSummary({ ...j.b, serviceNames: j.serviceNames })),
    earnings30d: { serviceValue: Number(earned.rows[0].v), jobs: Number(earned.rows[0].n), estimatedPayout: Math.round((Number(earned.rows[0].v) * r.t.payoutRateBps) / 10_000) },
    // location only exposed while the technician is travelling to / at an active job
    liveLocation: activeJob && r.t.lastLat != null ? { lat: r.t.lastLat, lng: r.t.lastLng, at: r.t.lastLocationAt, bookingCode: activeJob.b.code } : null,
  });
});

const techUpsert = z.object({
  phone: z.string(), name: z.string().trim().min(2).max(120), experienceYears: z.number().int().min(0).max(60).optional().nullable(), bio: z.string().max(500).optional().nullable(),
  categoryIds: z.array(z.uuid()).min(1), pincodes: z.array(z.string().regex(/^\d{6}$/)).min(1), payoutRateBps: z.number().int().min(0).max(10000).optional(),
});
adminPeopleRouter.post('/technicians', requireAdmin('technicians.manage'), async (req, res) => {
  const b = parse(techUpsert, req.body);
  const phone = normalizeIndianPhone(b.phone);
  const t = await db.transaction(async (tx) => {
    let [u] = await tx.select().from(users).where(and(eq(users.phone, phone), eq(users.role, 'TECHNICIAN')));
    if (!u) [u] = await tx.insert(users).values({ phone, role: 'TECHNICIAN', name: b.name, referralCode: referralCodeFor() }).returning();
    else await tx.update(users).set({ name: b.name }).where(eq(users.id, u.id));
    const [ex] = await tx.select().from(technicians).where(eq(technicians.userId, u.id));
    if (ex) throw conflict(`Technician already exists (${ex.code}).`);
    const n = await nextCounter(tx, 'technician');
    const [t] = await tx.insert(technicians).values({ userId: u.id, code: `TECH${String(n).padStart(4, '0')}`, experienceYears: b.experienceYears ?? null, bio: b.bio ?? null, payoutRateBps: b.payoutRateBps ?? 7000, status: 'APPROVED', approvedAt: new Date() }).returning();
    await tx.insert(technicianSkills).values(b.categoryIds.map((categoryId) => ({ technicianId: t.id, categoryId })));
    const valid = await tx.select({ p: pincodes.pincode }).from(pincodes).where(inArray(pincodes.pincode, b.pincodes));
    if (!valid.length) throw badRequest('Add these pincodes under Service Areas first.');
    await tx.insert(technicianServiceAreas).values(valid.map((v) => ({ technicianId: t.id, pincode: v.p })));
    await audit({ req, action: 'technician.create', entity: 'technician', entityId: t.id, after: { ...b, code: t.code } }, tx);
    return t;
  });
  res.status(201).json(t);
});
adminPeopleRouter.put('/technicians/:id', requireAdmin('technicians.manage'), async (req, res) => {
  const b = parse(techUpsert.omit({ phone: true }), req.body);
  await db.transaction(async (tx) => {
    const [t] = await tx.select().from(technicians).where(eq(technicians.id, (req.params.id as string)));
    if (!t) throw notFound('Technician');
    await tx.update(users).set({ name: b.name }).where(eq(users.id, t.userId));
    await tx.update(technicians).set({ experienceYears: b.experienceYears ?? null, bio: b.bio ?? null, payoutRateBps: b.payoutRateBps ?? t.payoutRateBps }).where(eq(technicians.id, t.id));
    await tx.delete(technicianSkills).where(eq(technicianSkills.technicianId, t.id));
    await tx.insert(technicianSkills).values(b.categoryIds.map((categoryId) => ({ technicianId: t.id, categoryId })));
    await tx.delete(technicianServiceAreas).where(eq(technicianServiceAreas.technicianId, t.id));
    const valid = await tx.select({ p: pincodes.pincode }).from(pincodes).where(inArray(pincodes.pincode, b.pincodes));
    if (valid.length) await tx.insert(technicianServiceAreas).values(valid.map((v) => ({ technicianId: t.id, pincode: v.p })));
    await audit({ req, action: 'technician.update', entity: 'technician', entityId: t.id, after: b }, tx);
  });
  res.json({ ok: true });
});
adminPeopleRouter.post('/technicians/:id/status', requireAdmin('technicians.manage'), async (req, res) => {
  const { status, reason } = parse(z.object({ status: z.enum(['APPROVED', 'SUSPENDED', 'REJECTED']), reason: z.string().max(300).optional() }), req.body);
  const [before] = await db.select().from(technicians).where(eq(technicians.id, (req.params.id as string)));
  if (!before) throw notFound('Technician');
  const [t] = await db.update(technicians).set({ status, approvedAt: status === 'APPROVED' ? before.approvedAt ?? new Date() : before.approvedAt, availability: status === 'APPROVED' ? before.availability : 'OFFLINE' }).where(eq(technicians.id, (req.params.id as string))).returning();
  if (status !== 'APPROVED') await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.userId, t.userId));
  if (status === 'APPROVED' && before.status !== 'APPROVED') void notify(t.userId, 'TECHNICIAN_APPROVED', 'You are approved 🎉', 'Go online to start receiving job requests.');
  await audit({ req, action: `technician.${status.toLowerCase()}`, entity: 'technician', entityId: t.id, before: { status: before.status }, after: { status, reason } });
  res.json(t);
});
adminPeopleRouter.post('/technicians/:id/documents/:docId', requireAdmin('technicians.manage'), async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['VERIFIED', 'REJECTED']) }), req.body);
  const [d] = await db.update(technicianDocuments).set({ status, reviewedBy: req.admin!.sub }).where(and(eq(technicianDocuments.id, (req.params.docId as string)), eq(technicianDocuments.technicianId, (req.params.id as string)))).returning();
  if (!d) throw notFound('Document');
  await audit({ req, action: 'technician.document.review', entity: 'technician_document', entityId: d.id, after: { status } });
  res.json(d);
});

