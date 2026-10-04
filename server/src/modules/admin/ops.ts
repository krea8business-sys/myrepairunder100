import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  adminUsers, auditLogs, bookings, cities, pincodes, reviews, supportTickets, technicians, ticketMessages, users, warrantyClaims, zones,
} from '../../db/schema.js';
import { requireAdmin } from '../../lib/auth.js';
import { parse } from '../../lib/validate.js';
import { badRequest, conflict, notFound, unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { getSettings, settingsSchema, updateSettingsSection, type SettingsSection } from '../settings/settings.service.js';
import { notify } from '../notifications/notify.js';
import { recomputeRating } from '../bookings/booking.routes.js';

export const adminOpsRouter = Router();
const pg = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) });

// ───────────── Service areas: cities → zones → pincodes ─────────────
adminOpsRouter.get('/areas', requireAdmin('areas.manage'), async (_req, res) => {
  const [c, z2, p] = await Promise.all([
    db.select().from(cities).orderBy(asc(cities.name)), db.select().from(zones).orderBy(asc(zones.name)),
    db.select({ p: pincodes, technicians: sql<number>`(SELECT COUNT(*) FROM technician_service_areas a WHERE a.pincode = "pincodes"."pincode")`.mapWith(Number) }).from(pincodes).orderBy(asc(pincodes.pincode)),
  ]);
  res.json({ cities: c, zones: z2, pincodes: p.map((r) => ({ ...r.p, technicians: r.technicians })) });
});
adminOpsRouter.post('/cities', requireAdmin('areas.manage'), async (req, res) => {
  const b = parse(z.object({ name: z.string().trim().min(2).max(80), state: z.string().trim().min(2).max(80), active: z.boolean().default(true) }), req.body);
  const [c] = await db.insert(cities).values(b).onConflictDoUpdate({ target: cities.name, set: { state: b.state, active: b.active } }).returning();
  await audit({ req, action: 'city.upsert', entity: 'city', entityId: c.id, after: c }); res.status(201).json(c);
});
adminOpsRouter.patch('/cities/:id', requireAdmin('areas.manage'), async (req, res) => {
  const [c] = await db.update(cities).set(parse(z.object({ active: z.boolean() }), req.body)).where(eq(cities.id, (req.params.id as string))).returning();
  if (!c) throw notFound('City');
  await audit({ req, action: 'city.update', entity: 'city', entityId: c.id, after: c }); res.json(c);
});
adminOpsRouter.post('/zones', requireAdmin('areas.manage'), async (req, res) => {
  const b = parse(z.object({ cityId: z.uuid(), name: z.string().trim().min(2).max(80), active: z.boolean().default(true) }), req.body);
  const [zz] = await db.insert(zones).values(b).onConflictDoNothing().returning();
  if (!zz) throw conflict('Zone already exists in this city.');
  await audit({ req, action: 'zone.create', entity: 'zone', entityId: zz.id, after: zz }); res.status(201).json(zz);
});
adminOpsRouter.patch('/zones/:id', requireAdmin('areas.manage'), async (req, res) => {
  const [zz] = await db.update(zones).set(parse(z.object({ active: z.boolean().optional(), name: z.string().min(2).max(80).optional() }), req.body)).where(eq(zones.id, (req.params.id as string))).returning();
  if (!zz) throw notFound('Zone');
  res.json(zz);
});
/** Add one or many pincodes (comma/space/newline separated). */
adminOpsRouter.post('/pincodes', requireAdmin('areas.manage'), async (req, res) => {
  const b = parse(z.object({ pincodes: z.string().min(6).max(5000), cityId: z.uuid(), zoneId: z.uuid().optional().nullable(), area: z.string().max(120).optional().nullable() }), req.body);
  const list = [...new Set(b.pincodes.split(/[\s,]+/).filter(Boolean))];
  const bad = list.filter((p) => !/^\d{6}$/.test(p));
  if (bad.length) throw badRequest(`Invalid pincode(s): ${bad.slice(0, 5).join(', ')}`);
  const rows = await db.insert(pincodes).values(list.map((p) => ({ pincode: p, cityId: b.cityId, zoneId: b.zoneId ?? null, area: b.area ?? null, active: true })))
    .onConflictDoUpdate({ target: pincodes.pincode, set: { cityId: b.cityId, zoneId: b.zoneId ?? null, active: true, ...(b.area ? { area: b.area } : {}) } }).returning();
  await audit({ req, action: 'pincode.upsert', entity: 'pincode', after: { pincodes: list } }); res.status(201).json(rows);
});
adminOpsRouter.patch('/pincodes/:pincode', requireAdmin('areas.manage'), async (req, res) => {
  const [p] = await db.update(pincodes).set(parse(z.object({ active: z.boolean().optional(), area: z.string().max(120).optional(), zoneId: z.uuid().nullable().optional() }), req.body)).where(eq(pincodes.pincode, (req.params.pincode as string))).returning();
  if (!p) throw notFound('Pincode');
  await audit({ req, action: 'pincode.update', entity: 'pincode', entityId: p.pincode, after: p }); res.json(p);
});

// ───────────── Settings ─────────────
adminOpsRouter.get('/settings', requireAdmin('dashboard.view'), async (_req, res) => { res.json(await getSettings(true)); });
adminOpsRouter.put('/settings/:section', requireAdmin('settings.manage'), async (req, res) => {
  const section = (req.params.section as string) as SettingsSection;
  if (!(section in settingsSchema.shape)) throw notFound('Settings section');
  const { before, after } = await updateSettingsSection(section, req.body, req.admin!.sub);
  await audit({ req, action: `settings.${section}`, entity: 'settings', entityId: section, before, after });
  res.json(after);
});

// ───────────── Reviews moderation ─────────────
adminOpsRouter.get('/reviews', requireAdmin('reviews.moderate'), async (req, res) => {
  const q = parse(pg, req.query);
  const rows = await db.select({ r: reviews, code: bookings.code, customer: users.name, techCode: technicians.code }).from(reviews)
    .innerJoin(bookings, eq(bookings.id, reviews.bookingId)).innerJoin(users, eq(users.id, reviews.customerId)).leftJoin(technicians, eq(technicians.id, reviews.technicianId))
    .orderBy(desc(reviews.createdAt)).limit(q.limit).offset((q.page - 1) * q.limit);
  res.json(rows.map((r) => ({ ...r.r, bookingCode: r.code, customerName: r.customer, technicianCode: r.techCode })));
});
adminOpsRouter.post('/reviews/:id/visibility', requireAdmin('reviews.moderate'), async (req, res) => {
  const { hidden, reason } = parse(z.object({ hidden: z.boolean(), reason: z.string().max(200).optional() }), req.body);
  const [r] = await db.update(reviews).set({ hidden }).where(eq(reviews.id, (req.params.id as string))).returning();
  if (!r) throw notFound('Review');
  if (r.technicianId) await recomputeRating(db, r.technicianId);
  await audit({ req, action: hidden ? 'review.hide' : 'review.show', entity: 'review', entityId: r.id, after: { reason } }); res.json(r);
});

// ───────────── Support tickets ─────────────
adminOpsRouter.get('/tickets', requireAdmin('support.manage'), async (req, res) => {
  const q = parse(pg.extend({ status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional() }), req.query);
  const rows = await db.select({ t: supportTickets, name: users.name, phone: users.phone, role: users.role, bookingCode: bookings.code }).from(supportTickets)
    .innerJoin(users, eq(users.id, supportTickets.userId)).leftJoin(bookings, eq(bookings.id, supportTickets.bookingId))
    .where(q.status ? eq(supportTickets.status, q.status) : undefined).orderBy(desc(supportTickets.updatedAt)).limit(q.limit).offset((q.page - 1) * q.limit);
  const counts = await db.select({ status: supportTickets.status, n: count() }).from(supportTickets).groupBy(supportTickets.status);
  res.json({ items: rows.map((r) => ({ ...r.t, userName: r.name, userPhone: r.phone, userRole: r.role, bookingCode: r.bookingCode })), counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])) });
});
adminOpsRouter.get('/tickets/:id', requireAdmin('support.manage'), async (req, res) => {
  const [t] = await db.select({ t: supportTickets, name: users.name, phone: users.phone, bookingCode: bookings.code }).from(supportTickets).innerJoin(users, eq(users.id, supportTickets.userId)).leftJoin(bookings, eq(bookings.id, supportTickets.bookingId)).where(eq(supportTickets.id, (req.params.id as string)));
  if (!t) throw notFound('Ticket');
  const messages = await db.select().from(ticketMessages).where(eq(ticketMessages.ticketId, t.t.id)).orderBy(asc(ticketMessages.createdAt));
  res.json({ ...t.t, userName: t.name, userPhone: t.phone, bookingCode: t.bookingCode, messages });
});
adminOpsRouter.post('/tickets/:id/reply', requireAdmin('support.manage'), async (req, res) => {
  const b = parse(z.object({ message: z.string().trim().min(1).max(2000), status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional() }), req.body);
  const [t] = await db.select().from(supportTickets).where(eq(supportTickets.id, (req.params.id as string)));
  if (!t) throw notFound('Ticket');
  await db.insert(ticketMessages).values({ ticketId: t.id, authorType: 'ADMIN', authorId: req.admin!.sub, message: b.message });
  await db.update(supportTickets).set({ status: b.status ?? (t.status === 'OPEN' ? 'IN_PROGRESS' : t.status), assignedAdminId: req.admin!.sub }).where(eq(supportTickets.id, t.id));
  void notify(t.userId, 'SUPPORT_REPLY', `Reply on ${t.code}`, b.message.slice(0, 140), { ticketId: t.id });
  res.json({ ok: true });
});
adminOpsRouter.post('/tickets/:id/status', requireAdmin('support.manage'), async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']) }), req.body);
  const [t] = await db.update(supportTickets).set({ status }).where(eq(supportTickets.id, (req.params.id as string))).returning();
  if (!t) throw notFound('Ticket');
  res.json(t);
});

// ───────────── Warranty claims ─────────────
adminOpsRouter.get('/warranty-claims', requireAdmin('warranty.manage'), async (_req, res) => {
  const rows = await db.select({ c: warrantyClaims, code: bookings.code, until: bookings.warrantyUntil, name: users.name, phone: users.phone }).from(warrantyClaims)
    .innerJoin(bookings, eq(bookings.id, warrantyClaims.bookingId)).innerJoin(users, eq(users.id, warrantyClaims.userId)).orderBy(desc(warrantyClaims.createdAt)).limit(200);
  res.json(rows.map((r) => ({ ...r.c, bookingCode: r.code, warrantyUntil: r.until, customerName: r.name, customerPhone: r.phone })));
});
adminOpsRouter.post('/warranty-claims/:id/decision', requireAdmin('warranty.manage'), async (req, res) => {
  const b = parse(z.object({ status: z.enum(['APPROVED', 'REJECTED', 'RESOLVED']), adminNote: z.string().trim().min(3).max(1000) }), req.body);
  const [c] = await db.update(warrantyClaims).set(b).where(eq(warrantyClaims.id, (req.params.id as string))).returning();
  if (!c) throw notFound('Warranty claim');
  void notify(c.userId, 'WARRANTY_UPDATE', `Warranty request ${b.status.toLowerCase()}`, b.adminNote.slice(0, 140), { bookingId: c.bookingId });
  await audit({ req, action: 'warranty.decision', entity: 'warranty_claim', entityId: c.id, after: b }); res.json(c);
});

// ───────────── Broadcast notifications ─────────────
adminOpsRouter.post('/notifications/broadcast', requireAdmin('notifications.send'), async (req, res) => {
  const b = parse(z.object({ audience: z.enum(['ALL_CUSTOMERS', 'ALL_TECHNICIANS']), type: z.enum(['COUPON_AVAILABLE', 'GENERAL']).default('GENERAL'), title: z.string().trim().min(3).max(120), body: z.string().trim().min(3).max(300) }), req.body);
  const role = b.audience === 'ALL_CUSTOMERS' ? 'CUSTOMER' : 'TECHNICIAN';
  const recipients = await db.select({ id: users.id }).from(users).where(and(eq(users.role, role), eq(users.status, 'ACTIVE')));
  // fire-and-forget in batches; for very large audiences move this to a queue worker
  void (async () => { for (const r of recipients) await notify(r.id, b.type, b.title, b.body); })();
  await audit({ req, action: 'notification.broadcast', entity: 'notification', after: { ...b, recipients: recipients.length } });
  res.json({ queued: recipients.length });
});

// ───────────── Audit logs ─────────────
adminOpsRouter.get('/audit-logs', requireAdmin('audit.view'), async (req, res) => {
  const q = parse(pg.extend({ entity: z.string().max(48).optional(), entityId: z.string().max(64).optional() }), req.query);
  const rows = await db.select({ l: auditLogs, adminName: adminUsers.name }).from(auditLogs).leftJoin(adminUsers, eq(adminUsers.id, auditLogs.actorId))
    .where(and(q.entity ? eq(auditLogs.entity, q.entity) : undefined, q.entityId ? eq(auditLogs.entityId, q.entityId) : undefined))
    .orderBy(desc(auditLogs.id)).limit(q.limit).offset((q.page - 1) * q.limit);
  res.json(rows.map((r) => ({ ...r.l, actorName: r.adminName })));
});

// ───────────── Admin users ─────────────
adminOpsRouter.get('/admins', requireAdmin('admins.manage'), async (_req, res) => {
  res.json(await db.select({ id: adminUsers.id, email: adminUsers.email, name: adminUsers.name, role: adminUsers.role, active: adminUsers.active, lastLoginAt: adminUsers.lastLoginAt }).from(adminUsers).orderBy(asc(adminUsers.createdAt)));
});
const strongPassword = z.string().min(12, 'At least 12 characters').max(200).regex(/[A-Z]/, 'Add an uppercase letter').regex(/[a-z]/, 'Add a lowercase letter').regex(/\d/, 'Add a number');
adminOpsRouter.post('/admins', requireAdmin('admins.manage'), async (req, res) => {
  const b = parse(z.object({ email: z.email().toLowerCase(), name: z.string().min(2).max(120), role: z.enum(['SUPER_ADMIN', 'ADMIN', 'SUPPORT']), password: strongPassword }), req.body);
  const [a] = await db.insert(adminUsers).values({ email: b.email, name: b.name, role: b.role, passwordHash: await bcrypt.hash(b.password, 12), mustChangePassword: true }).onConflictDoNothing().returning();
  if (!a) throw conflict('An admin with this email already exists.');
  await audit({ req, action: 'admin.create', entity: 'admin_user', entityId: a.id, after: { email: a.email, role: a.role } });
  res.status(201).json({ id: a.id, email: a.email, role: a.role });
});
adminOpsRouter.patch('/admins/:id', requireAdmin('admins.manage'), async (req, res) => {
  const b = parse(z.object({ active: z.boolean().optional(), role: z.enum(['SUPER_ADMIN', 'ADMIN', 'SUPPORT']).optional() }), req.body);
  if ((req.params.id as string) === req.admin!.sub) throw badRequest('You cannot change your own role or status.');
  const [a] = await db.update(adminUsers).set(b).where(eq(adminUsers.id, (req.params.id as string))).returning();
  if (!a) throw notFound('Admin');
  await audit({ req, action: 'admin.update', entity: 'admin_user', entityId: a.id, after: b }); res.json({ ok: true });
});
adminOpsRouter.post('/me/password', requireAdmin(), async (req, res) => {
  const b = parse(z.object({ currentPassword: z.string(), newPassword: strongPassword }), req.body);
  const [a] = await db.select().from(adminUsers).where(eq(adminUsers.id, req.admin!.sub));
  if (!a || !(await bcrypt.compare(b.currentPassword, a.passwordHash))) throw unauthorized('Current password is incorrect.');
  await db.update(adminUsers).set({ passwordHash: await bcrypt.hash(b.newPassword, 12), mustChangePassword: false }).where(eq(adminUsers.id, a.id));
  await audit({ req, action: 'admin.password_change', entity: 'admin_user', entityId: a.id }); res.json({ ok: true });
});
adminOpsRouter.get('/me', requireAdmin(), async (req, res) => {
  const [a] = await db.select({ id: adminUsers.id, email: adminUsers.email, name: adminUsers.name, role: adminUsers.role, mustChangePassword: adminUsers.mustChangePassword }).from(adminUsers).where(eq(adminUsers.id, req.admin!.sub));
  if (!a) throw unauthorized();
  res.json(a);
});

