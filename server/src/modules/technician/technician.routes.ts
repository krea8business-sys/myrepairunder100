import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import crypto from 'node:crypto';
import { and, asc, count, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  bookingPhotos, bookings, categories, jobOffers, notifications, pincodes, services, technicianDocuments, technicianServiceAreas,
  technicianSkills, technicians, users,
} from '../../db/schema.js';
import { requireTechnician } from '../../lib/auth.js';
import { parse } from '../../lib/validate.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { nextCounter } from '../../lib/codes.js';
import { decrypt, safeEqual } from '../../lib/crypto.js';
import { istDate } from '../../lib/dates.js';
import { storage, sniffDocument, sniffImage } from '../../providers/storage.js';
import { emitToAdmins, emitToBooking } from '../../realtime/io.js';
import { acceptOffer, rejectOffer } from '../bookings/assignment.service.js';
import { announce, collectCash, completeJob, lockBooking, requestAddon, transition, withAfter } from '../bookings/booking.service.js';
import { bookingDetail, bookingSummary } from '../bookings/booking.view.js';
import { publicService } from '../catalog/serialize.js';
import { issueTokens } from '../auth/auth.routes.js';
import { getSettings } from '../settings/settings.service.js';

export const technicianRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024, files: 1 } });

/** First-time technician onboarding (status PENDING until admin approval). */
technicianRouter.post('/register', requireTechnician, async (req, res) => {
  const b = parse(z.object({
    name: z.string().trim().min(2).max(120),
    experienceYears: z.number().int().min(0).max(60).optional(),
    categoryIds: z.array(z.uuid()).min(1).max(10),
    pincodes: z.array(z.string().regex(/^\d{6}$/)).min(1).max(50),
  }), req.body);
  if (!(await getSettings()).features.technicianSelfSignup) throw forbidden('New technician sign-ups are closed. Please contact the admin to join.');
  const uid = req.user!.sub;
  const [existing] = await db.select().from(technicians).where(eq(technicians.userId, uid));
  if (existing) throw conflict('You are already registered.', 'ALREADY_REGISTERED');
  const validPins = await db.select({ p: pincodes.pincode }).from(pincodes).where(and(inArray(pincodes.pincode, b.pincodes), eq(pincodes.active, true)));
  if (!validPins.length) throw badRequest('None of these pincodes are in our service area yet.');
  const t = await db.transaction(async (tx) => {
    await tx.update(users).set({ name: b.name }).where(eq(users.id, uid));
    const n = await nextCounter(tx, 'technician');
    const [t] = await tx.insert(technicians).values({ userId: uid, code: `TECH${String(n).padStart(4, '0')}`, experienceYears: b.experienceYears ?? null }).returning();
    await tx.insert(technicianSkills).values(b.categoryIds.map((categoryId) => ({ technicianId: t.id, categoryId }))).onConflictDoNothing();
    await tx.insert(technicianServiceAreas).values(validPins.map((p) => ({ technicianId: t.id, pincode: p.p }))).onConflictDoNothing();
    return t;
  });
  emitToAdmins('technician:registered', { id: t.id, code: t.code });
  // re-issue tokens so the access token carries the technician id
  res.status(201).json({ technician: { id: t.id, code: t.code, status: t.status }, ...(await issueTokens(uid, 'TECHNICIAN', t.id, req.headers['user-agent'])) });
});

async function me(req: { user?: { tid?: string } }) {
  if (!req.user?.tid) throw forbidden('Please complete technician registration first.');
  const [t] = await db.select().from(technicians).where(eq(technicians.id, req.user.tid));
  if (!t) throw forbidden('Please complete technician registration first.');
  return t;
}
const approved = async (req: { user?: { tid?: string } }) => {
  const t = await me(req);
  if (t.status !== 'APPROVED') throw forbidden(t.status === 'PENDING' ? 'Your profile is under review. You can accept jobs once approved.' : 'Your account is not active.');
  return t;
};

technicianRouter.get('/me', requireTechnician, async (req, res) => {
  const t = await me(req);
  const [u] = await db.select().from(users).where(eq(users.id, t.userId));
  const skills = await db.select({ id: categories.id, name: categories.name }).from(technicianSkills).innerJoin(categories, eq(categories.id, technicianSkills.categoryId)).where(eq(technicianSkills.technicianId, t.id));
  const areas = await db.select({ pincode: technicianServiceAreas.pincode, area: pincodes.area }).from(technicianServiceAreas).innerJoin(pincodes, eq(pincodes.pincode, technicianServiceAreas.pincode)).where(eq(technicianServiceAreas.technicianId, t.id));
  const docs = await db.select({ id: technicianDocuments.id, type: technicianDocuments.type, status: technicianDocuments.status, createdAt: technicianDocuments.createdAt }).from(technicianDocuments).where(eq(technicianDocuments.technicianId, t.id));
  res.json({
    id: t.id, code: t.code, status: t.status, availability: t.availability, name: u.name, phone: u.phone, photoUrl: t.photoUrl ? await storage.signedUrl(t.photoUrl) : null,
    experienceYears: t.experienceYears, rating: t.ratingCount ? Math.round(t.ratingAvg * 10) / 10 : null, ratingCount: t.ratingCount, completedJobs: t.completedJobs,
    skills, serviceAreas: areas, documents: docs,
  });
});

technicianRouter.post('/availability', requireTechnician, async (req, res) => {
  const { availability } = parse(z.object({ availability: z.enum(['AVAILABLE', 'BUSY', 'OFFLINE']) }), req.body);
  const t = await approved(req);
  const update: Partial<typeof technicians.$inferInsert> = { availability };
  if (availability === 'OFFLINE') { update.lastLat = null; update.lastLng = null; update.lastLocationAt = null; } // privacy: forget location when going offline
  await db.update(technicians).set(update).where(eq(technicians.id, t.id));
  res.json({ availability });
});

/** REST fallback for location (when the socket is down). Same privacy rule as the socket handler. */
technicianRouter.post('/location', requireTechnician, async (req, res) => {
  const p = parse(z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }), req.body);
  const t = await me(req);
  const active = await db.select({ id: bookings.id }).from(bookings).where(and(eq(bookings.technicianId, t.id), inArray(bookings.status, ['TECHNICIAN_ON_THE_WAY', 'TECHNICIAN_ARRIVED'])));
  if (!active.length || !(await getSettings()).features.liveTracking) return res.json({ stored: false });
  await db.update(technicians).set({ lastLat: p.lat, lastLng: p.lng, lastLocationAt: new Date() }).where(eq(technicians.id, t.id));
  for (const b of active) emitToBooking(b.id, 'tech:location', { bookingId: b.id, ...p, at: Date.now() });
  res.json({ stored: true });
});

technicianRouter.get('/dashboard', requireTechnician, async (req, res) => {
  const t = await me(req);
  const today = istDate();
  const [offers] = await db.select({ n: count() }).from(jobOffers).where(and(eq(jobOffers.technicianId, t.id), eq(jobOffers.status, 'OFFERED'), gte(jobOffers.expiresAt, new Date())));
  const [todayJobs] = await db.select({ n: count() }).from(bookings).where(and(eq(bookings.technicianId, t.id), eq(bookings.scheduledDate, today), sql`${bookings.status} <> 'CANCELLED'`));
  const [assigned] = await db.select({ n: count() }).from(bookings).where(and(eq(bookings.technicianId, t.id), inArray(bookings.status, ['TECHNICIAN_ASSIGNED', 'TECHNICIAN_ON_THE_WAY', 'TECHNICIAN_ARRIVED', 'SERVICE_STARTED', 'PAYMENT_PENDING'])));
  const earn = await earnings(t.id, t.payoutRateBps);
  res.json({ status: t.status, availability: t.availability, counts: { jobRequests: offers.n, today: todayJobs.n, assigned: assigned.n }, earnings: earn.summary });
});

/** Job requests (offers) + assigned jobs. */
technicianRouter.get('/jobs', requireTechnician, async (req, res) => {
  const t = await me(req);
  const q = parse(z.object({ tab: z.enum(['requests', 'assigned', 'today', 'history']).default('assigned') }), req.query);
  const base = db.select({ b: bookings, serviceNames: sql<string>`(SELECT string_agg(i.name, ', ') FROM booking_items i WHERE i.booking_id = "bookings"."id")` }).from(bookings);
  if (q.tab === 'requests') {
    const rows = await db.select({ b: bookings, o: jobOffers, serviceNames: sql<string>`(SELECT string_agg(i.name, ', ') FROM booking_items i WHERE i.booking_id = "bookings"."id")` })
      .from(jobOffers).innerJoin(bookings, eq(bookings.id, jobOffers.bookingId))
      .where(and(eq(jobOffers.technicianId, t.id), eq(jobOffers.status, 'OFFERED'), gte(jobOffers.expiresAt, new Date()))).orderBy(asc(jobOffers.expiresAt));
    // before acceptance the technician sees area + time + services only — never the customer's address or phone
    return res.json(rows.map((r) => ({ ...bookingSummary({ ...r.b, serviceNames: r.serviceNames }), offer: { expiresAt: r.o.expiresAt, distanceKm: r.o.distanceKm != null ? Math.round(r.o.distanceKm * 10) / 10 : null } })));
  }
  const where = q.tab === 'assigned' ? and(eq(bookings.technicianId, t.id), inArray(bookings.status, ['TECHNICIAN_ASSIGNED', 'TECHNICIAN_ON_THE_WAY', 'TECHNICIAN_ARRIVED', 'SERVICE_STARTED', 'SERVICE_COMPLETED', 'PAYMENT_PENDING']))
    : q.tab === 'today' ? and(eq(bookings.technicianId, t.id), eq(bookings.scheduledDate, istDate()), sql`${bookings.status} <> 'CANCELLED'`)
    : and(eq(bookings.technicianId, t.id), inArray(bookings.status, ['COMPLETED', 'CANCELLED']));
  const rows = await base.where(where).orderBy(q.tab === 'history' ? desc(bookings.updatedAt) : asc(bookings.scheduledDate)).limit(100);
  res.json(rows.map((r) => bookingSummary({ ...r.b, serviceNames: r.serviceNames })));
});

async function myJob(techId: string, id: string) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, id));
  if (!b) throw notFound('Job');
  if (b.technicianId === techId) return { b, offered: false };
  const [o] = await db.select().from(jobOffers).where(and(eq(jobOffers.bookingId, id), eq(jobOffers.technicianId, techId), eq(jobOffers.status, 'OFFERED')));
  if (!o) throw notFound('Job');
  return { b, offered: true };
}

technicianRouter.get('/jobs/:id', requireTechnician, async (req, res) => {
  const t = await me(req);
  const { b, offered } = await myJob(t.id, (req.params.id as string));
  const d = await bookingDetail(b, 'TECHNICIAN');
  if (offered) return res.json({ ...d, address: { city: d.address.city, pincode: d.address.pincode, locality: d.address.locality }, customerPhone: null, location: null, isOffer: true });
  res.json({ ...d, isOffer: false });
});

technicianRouter.post('/jobs/:id/accept', requireTechnician, async (req, res) => {
  const t = await approved(req);
  const b = await acceptOffer(t.id, (req.params.id as string));
  res.json(await bookingDetail(b, 'TECHNICIAN'));
});
technicianRouter.post('/jobs/:id/reject', requireTechnician, async (req, res) => {
  const t = await me(req);
  const { reason } = parse(z.object({ reason: z.string().max(200).optional() }), req.body ?? {});
  res.json(await rejectOffer(t.id, (req.params.id as string), reason));
});

const step = (to: 'TECHNICIAN_ON_THE_WAY' | 'TECHNICIAN_ARRIVED', from: ('TECHNICIAN_ASSIGNED' | 'TECHNICIAN_ON_THE_WAY')[]) => async (req: any, res: any) => {
  const t = await approved(req);
  const u = await withAfter(async (tx, after) => {
    const b = await lockBooking(tx, (req.params.id as string));
    if (b.technicianId !== t.id) throw forbidden();
    const r = await transition(tx, b, to, from, { type: 'TECHNICIAN', id: t.id });
    if (to === 'TECHNICIAN_ON_THE_WAY') await tx.update(technicians).set({ availability: 'BUSY' }).where(eq(technicians.id, t.id));
    announce(after, r);
    return r;
  });
  res.json(await bookingDetail(u, 'TECHNICIAN'));
};
technicianRouter.post('/jobs/:id/on-the-way', requireTechnician, step('TECHNICIAN_ON_THE_WAY', ['TECHNICIAN_ASSIGNED']));
technicianRouter.post('/jobs/:id/arrived', requireTechnician, step('TECHNICIAN_ARRIVED', ['TECHNICIAN_ASSIGNED', 'TECHNICIAN_ON_THE_WAY']));

/** Start needs the 4-digit code shown in the customer's app (proves the visit happened). */
technicianRouter.post('/jobs/:id/start', requireTechnician, async (req, res) => {
  const t = await approved(req);
  const { code } = parse(z.object({ code: z.string().regex(/^\d{4}$/).optional() }), req.body ?? {});
  const s = await getSettings();
  const u = await withAfter(async (tx, after) => {
    const b = await lockBooking(tx, (req.params.id as string));
    if (b.technicianId !== t.id) throw forbidden();
    if (s.booking.requireStartOtp && b.startCodeEnc) {
      if (!code) throw badRequest('Ask the customer for the 4-digit start code shown in their app.', 'START_CODE_REQUIRED');
      if (!safeEqual(decrypt(b.startCodeEnc), code)) throw badRequest('Incorrect start code.', 'START_CODE_INVALID');
    }
    const r = await transition(tx, b, 'SERVICE_STARTED', ['TECHNICIAN_ARRIVED', 'TECHNICIAN_ON_THE_WAY', 'TECHNICIAN_ASSIGNED'], { type: 'TECHNICIAN', id: t.id });
    await tx.update(technicians).set({ lastLat: null, lastLng: null }).where(eq(technicians.id, t.id)); // stop exposing location once on-site
    announce(after, r);
    return r;
  });
  res.json(await bookingDetail(u, 'TECHNICIAN'));
});

technicianRouter.get('/catalog', requireTechnician, async (req, res) => {
  const t = await me(req);
  const cats = await db.select({ c: technicianSkills.categoryId }).from(technicianSkills).where(eq(technicianSkills.technicianId, t.id));
  if (!cats.length) return res.json([]);
  const rows = await db.select().from(services).where(and(inArray(services.categoryId, cats.map((c) => c.c)), eq(services.active, true), isNull(services.deletedAt))).orderBy(asc(services.sortOrder));
  res.json(rows.map(publicService));
});

technicianRouter.post('/jobs/:id/addons', requireTechnician, async (req, res) => {
  const t = await approved(req);
  const b = parse(z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('SERVICE'), serviceId: z.uuid(), quantity: z.number().int().min(1).max(10).default(1), note: z.string().max(300).optional() }),
    z.object({ kind: z.literal('PART'), name: z.string().trim().min(2).max(160), unitPrice: z.number().int().min(100).max(5_000_000), quantity: z.number().int().min(1).max(10).default(1), warrantyDays: z.number().int().min(0).max(730).optional(), note: z.string().max(300).optional() }),
  ]), req.body);
  res.status(201).json(await requestAddon(t.id, (req.params.id as string), b));
});

technicianRouter.post('/jobs/:id/photos', requireTechnician, upload.single('photo'), async (req, res) => {
  const t = await approved(req);
  const { kind } = parse(z.object({ kind: z.enum(['BEFORE', 'AFTER', 'OTHER']) }), req.body);
  if (!req.file) throw badRequest('Attach a photo.');
  const type = sniffImage(req.file.buffer);
  if (!type) throw badRequest('Only JPG, PNG or WEBP images are allowed.');
  const { b } = await myJob(t.id, (req.params.id as string));
  if (b.technicianId !== t.id || !['TECHNICIAN_ARRIVED', 'SERVICE_STARTED', 'SERVICE_COMPLETED', 'PAYMENT_PENDING'].includes(b.status)) throw conflict('Photos can be added during the job.', 'INVALID_STATUS');
  const [{ n }] = await db.select({ n: count() }).from(bookingPhotos).where(eq(bookingPhotos.bookingId, b.id));
  if (n >= 20) throw badRequest('Photo limit reached for this job.');
  const key = `bookings/${b.id}/${kind.toLowerCase()}-${crypto.randomUUID()}.${type.split('/')[1]}`;
  await storage.put(key, req.file.buffer, type);
  const [p] = await db.insert(bookingPhotos).values({ bookingId: b.id, kind, fileKey: key, uploadedBy: t.id }).returning();
  res.status(201).json({ id: p.id, kind: p.kind, url: await storage.signedUrl(key) });
});

technicianRouter.post('/jobs/:id/complete', requireTechnician, async (req, res) => {
  const t = await approved(req);
  const r = await completeJob(t.id, (req.params.id as string));
  res.json({ ...(await bookingDetail(r.booking, 'TECHNICIAN')), amountDue: r.amountDue });
});
technicianRouter.post('/jobs/:id/collect-cash', requireTechnician, async (req, res) => {
  const t = await approved(req);
  res.json(await bookingDetail(await collectCash(t.id, (req.params.id as string)), 'TECHNICIAN'));
});
/** Technician can't make it — booking goes back into assignment (no fee to customer). */
technicianRouter.post('/jobs/:id/release', requireTechnician, async (req, res) => {
  const t = await approved(req);
  const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(300) }), req.body);
  const u = await withAfter(async (tx, after) => {
    const b = await lockBooking(tx, (req.params.id as string));
    if (b.technicianId !== t.id) throw forbidden();
    const r = await transition(tx, b, 'CONFIRMED', ['TECHNICIAN_ASSIGNED', 'TECHNICIAN_ON_THE_WAY'], { type: 'TECHNICIAN', id: t.id }, `Released by technician: ${reason}`, { technicianId: null });
    await tx.update(jobOffers).set({ status: 'REJECTED' }).where(and(eq(jobOffers.bookingId, b.id), eq(jobOffers.technicianId, t.id)));
    await tx.update(technicians).set({ availability: 'AVAILABLE' }).where(eq(technicians.id, t.id));
    after.push(() => import('../bookings/assignment.service.js').then((m) => m.runAssignment(b.id)));
    announce(after, r);
    return r;
  });
  res.json({ ok: true, status: u.status });
});

async function earnings(techId: string, rateBps: number) {
  const rows = await db.execute<{ day: string; jobs: number; value: number; cash: number }>(sql`
    SELECT to_char(b.completed_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day, COUNT(*)::int AS jobs,
      COALESCE(SUM(b.items_total - b.coupon_discount + b.addons_total),0)::int AS value,
      COALESCE(SUM((SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.booking_id = b.id AND p.provider = 'cash' AND p.collected_by = ${techId})),0)::int AS cash
    FROM bookings b WHERE b.technician_id = ${techId} AND b.status = 'COMPLETED' AND b.completed_at > now() - interval '60 days'
    GROUP BY 1 ORDER BY 1 DESC`);
  const days = rows.rows.map((r) => ({ day: r.day, jobs: Number(r.jobs), serviceValue: Number(r.value), earning: Math.round((Number(r.value) * rateBps) / 10_000), cashCollected: Number(r.cash) }));
  const today = istDate();
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const sum = (f: (d: (typeof days)[number]) => boolean) => days.filter(f).reduce((a, d) => ({ jobs: a.jobs + d.jobs, earning: a.earning + d.earning, cash: a.cash + d.cashCollected }), { jobs: 0, earning: 0, cash: 0 });
  return { days, summary: { today: sum((d) => d.day === today), week: sum((d) => d.day >= weekAgo), last60Days: sum(() => true), payoutRateBps: rateBps } };
}
technicianRouter.get('/earnings', requireTechnician, async (req, res) => {
  const t = await me(req);
  res.json(await earnings(t.id, t.payoutRateBps));
});

technicianRouter.post('/documents', requireTechnician, upload.single('file'), async (req, res) => {
  const t = await me(req);
  const { type } = parse(z.object({ type: z.enum(['ID_PROOF', 'ADDRESS_PROOF', 'PHOTO', 'SKILL_CERT']) }), req.body);
  if (!req.file) throw badRequest('Attach a file.');
  const mime = type === 'PHOTO' ? sniffImage(req.file.buffer) : sniffDocument(req.file.buffer);
  if (!mime) throw badRequest(type === 'PHOTO' ? 'Upload a JPG, PNG or WEBP photo.' : 'Upload a PDF or image.');
  const key = `technicians/${t.id}/${type.toLowerCase()}-${crypto.randomUUID()}.${mime.split('/')[1]}`;
  await storage.put(key, req.file.buffer, mime);
  const [d] = await db.insert(technicianDocuments).values({ technicianId: t.id, type, fileKey: key }).returning();
  if (type === 'PHOTO') await db.update(technicians).set({ photoUrl: key }).where(eq(technicians.id, t.id));
  res.status(201).json({ id: d.id, type: d.type, status: d.status });
});

technicianRouter.get('/notifications', requireTechnician, async (req, res) => {
  const rows = await db.select().from(notifications).where(eq(notifications.userId, req.user!.sub)).orderBy(desc(notifications.createdAt)).limit(100);
  res.json({ items: rows, unread: rows.filter((r) => !r.readAt).length });
});
technicianRouter.post('/notifications/read', requireTechnician, async (req, res) => {
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, req.user!.sub), isNull(notifications.readAt)));
  res.json({ ok: true });
});

/** Categories + serviceable pincodes for the registration form. */
technicianRouter.get('/onboarding-options', requireTechnician, async (_req, res) => {
  const [cats, pins] = await Promise.all([
    db.select({ id: categories.id, name: categories.name }).from(categories).where(and(eq(categories.active, true), isNull(categories.deletedAt))).orderBy(asc(categories.sortOrder)),
    db.select({ pincode: pincodes.pincode, area: pincodes.area }).from(pincodes).where(eq(pincodes.active, true)).orderBy(asc(pincodes.pincode)),
  ]);
  res.json({ categories: cats, pincodes: pins });
});

