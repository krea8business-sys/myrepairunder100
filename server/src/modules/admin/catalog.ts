import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import crypto from 'node:crypto';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { categories, offers, servicePriceHistory, services, subcategories, timeSlots } from '../../db/schema.js';
import { requireAdmin } from '../../lib/auth.js';
import { parse } from '../../lib/validate.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { storage, sniffImage } from '../../providers/storage.js';
import { invalidateSearchIndex } from '../catalog/search.js';
import { env } from '../../config/env.js';

export const adminCatalogRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024, files: 1 } });
const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens');
const rupeesToPaise = z.number().min(0).max(1_000_000).transform((r) => Math.round(r * 100));
const uniqueViolation = (e: unknown) => (e as { code?: string })?.code === '23505';

// ───────────── Categories ─────────────
const categorySchema = z.object({
  slug, name: z.string().trim().min(2).max(120), shortDescription: z.string().max(240).optional().nullable(), icon: z.string().max(40).default('wrench'),
  imageUrl: z.string().url().optional().nullable(), seoTitle: z.string().max(160).optional().nullable(), seoDescription: z.string().max(320).optional().nullable(),
  sortOrder: z.number().int().default(0), active: z.boolean().default(true),
});
adminCatalogRouter.get('/categories', requireAdmin('catalog.manage'), async (_req, res) => {
  const cats = await db.select().from(categories).where(isNull(categories.deletedAt)).orderBy(asc(categories.sortOrder));
  const subs = await db.select().from(subcategories).where(isNull(subcategories.deletedAt)).orderBy(asc(subcategories.sortOrder));
  res.json(cats.map((c) => ({ ...c, subcategories: subs.filter((s) => s.categoryId === c.id) })));
});
adminCatalogRouter.post('/categories', requireAdmin('catalog.manage'), async (req, res) => {
  const b = parse(categorySchema, req.body);
  try {
    const [c] = await db.insert(categories).values(b).returning();
    await audit({ req, action: 'category.create', entity: 'category', entityId: c.id, after: c });
    invalidateSearchIndex(); res.status(201).json(c);
  } catch (e) { if (uniqueViolation(e)) throw conflict('Slug already in use.'); throw e; }
});
adminCatalogRouter.put('/categories/:id', requireAdmin('catalog.manage'), async (req, res) => {
  const b = parse(categorySchema.partial(), req.body);
  const [before] = await db.select().from(categories).where(eq(categories.id, (req.params.id as string)));
  if (!before) throw notFound('Category');
  const [c] = await db.update(categories).set(b).where(eq(categories.id, (req.params.id as string))).returning();
  await audit({ req, action: 'category.update', entity: 'category', entityId: c.id, before, after: c });
  invalidateSearchIndex(); res.json(c);
});
adminCatalogRouter.delete('/categories/:id', requireAdmin('catalog.manage'), async (req, res) => {
  const [c] = await db.update(categories).set({ deletedAt: new Date(), active: false, slug: `deleted-${crypto.randomBytes(4).toString('hex')}` }).where(eq(categories.id, (req.params.id as string))).returning();
  if (!c) throw notFound('Category');
  await db.update(services).set({ active: false }).where(eq(services.categoryId, c.id));
  await audit({ req, action: 'category.delete', entity: 'category', entityId: c.id });
  invalidateSearchIndex(); res.json({ ok: true });
});

const subSchema = z.object({ categoryId: z.uuid(), slug, name: z.string().trim().min(2).max(120), sortOrder: z.number().int().default(0), active: z.boolean().default(true) });
adminCatalogRouter.post('/subcategories', requireAdmin('catalog.manage'), async (req, res) => {
  const b = parse(subSchema, req.body);
  try { const [s] = await db.insert(subcategories).values(b).returning(); await audit({ req, action: 'subcategory.create', entity: 'subcategory', entityId: s.id, after: s }); res.status(201).json(s); }
  catch (e) { if (uniqueViolation(e)) throw conflict('Slug already used in this category.'); throw e; }
});
adminCatalogRouter.put('/subcategories/:id', requireAdmin('catalog.manage'), async (req, res) => {
  const [s] = await db.update(subcategories).set(parse(subSchema.partial(), req.body)).where(eq(subcategories.id, (req.params.id as string))).returning();
  if (!s) throw notFound('Subcategory');
  await audit({ req, action: 'subcategory.update', entity: 'subcategory', entityId: s.id, after: s }); res.json(s);
});
adminCatalogRouter.delete('/subcategories/:id', requireAdmin('catalog.manage'), async (req, res) => {
  const [s] = await db.update(subcategories).set({ deletedAt: new Date(), active: false, slug: `deleted-${crypto.randomBytes(4).toString('hex')}` }).where(eq(subcategories.id, (req.params.id as string))).returning();
  if (!s) throw notFound('Subcategory');
  await db.update(services).set({ subcategoryId: null }).where(eq(services.subcategoryId, s.id));
  await audit({ req, action: 'subcategory.delete', entity: 'subcategory', entityId: s.id }); res.json({ ok: true });
});

// ───────────── Services (prices entered in rupees in the admin UI, stored in paise) ─────────────
const serviceSchema = z.object({
  categoryId: z.uuid(), subcategoryId: z.uuid().optional().nullable(), slug, name: z.string().trim().min(2).max(160),
  shortDescription: z.string().max(300).optional().nullable(), description: z.string().max(5000).optional().nullable(),
  includes: z.array(z.string().max(200)).max(20).default([]), excludes: z.array(z.string().max(200)).max(20).default([]),
  terms: z.string().max(3000).optional().nullable(), sparePartsPolicy: z.string().max(1000).optional().nullable(),
  durationMins: z.number().int().min(5).max(1440).default(60), warrantyDays: z.number().int().min(0).max(730).default(0),
  basePrice: rupeesToPaise, discountPrice: rupeesToPaise.optional().nullable(), isStartingPrice: z.boolean().default(true),
  taxRateBps: z.number().int().min(0).max(5000).optional().nullable(), maxQuantity: z.number().int().min(1).max(20).default(5),
  popular: z.boolean().default(false), keywords: z.array(z.string().trim().toLowerCase().max(40)).max(40).default([]),
  sortOrder: z.number().int().default(0), active: z.boolean().default(true),
}).refine((s) => s.discountPrice == null || s.discountPrice <= s.basePrice, { message: 'Offer price must be less than or equal to base price', path: ['discountPrice'] });

adminCatalogRouter.get('/services', requireAdmin('catalog.manage'), async (req, res) => {
  const q = parse(z.object({ categoryId: z.uuid().optional() }), req.query);
  res.json(await db.select().from(services).where(and(isNull(services.deletedAt), q.categoryId ? eq(services.categoryId, q.categoryId) : undefined)).orderBy(asc(services.categoryId), asc(services.sortOrder)));
});
adminCatalogRouter.get('/services/:id', requireAdmin('catalog.manage'), async (req, res) => {
  const [s] = await db.select().from(services).where(eq(services.id, (req.params.id as string)));
  if (!s) throw notFound('Service');
  const history = await db.select().from(servicePriceHistory).where(eq(servicePriceHistory.serviceId, s.id)).orderBy(asc(servicePriceHistory.createdAt));
  res.json({ ...s, priceHistory: history });
});
adminCatalogRouter.post('/services', requireAdmin('catalog.manage'), async (req, res) => {
  const b = parse(serviceSchema, req.body);
  try {
    const s = await db.transaction(async (tx) => {
      const [s] = await tx.insert(services).values(b).returning();
      await tx.insert(servicePriceHistory).values({ serviceId: s.id, basePrice: s.basePrice, discountPrice: s.discountPrice, changedBy: req.admin!.sub });
      await audit({ req, action: 'service.create', entity: 'service', entityId: s.id, after: s }, tx);
      return s;
    });
    invalidateSearchIndex(); res.status(201).json(s);
  } catch (e) { if (uniqueViolation(e)) throw conflict('Slug already in use.'); throw e; }
});
adminCatalogRouter.put('/services/:id', requireAdmin('catalog.manage'), async (req, res) => {
  const b = parse(serviceSchema, req.body);
  const s = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(services).where(eq(services.id, (req.params.id as string)));
    if (!before || before.deletedAt) throw notFound('Service');
    const [s] = await tx.update(services).set(b).where(eq(services.id, (req.params.id as string))).returning();
    if (before.basePrice !== s.basePrice || before.discountPrice !== s.discountPrice)
      await tx.insert(servicePriceHistory).values({ serviceId: s.id, basePrice: s.basePrice, discountPrice: s.discountPrice, changedBy: req.admin!.sub });
    await audit({ req, action: 'service.update', entity: 'service', entityId: s.id, before, after: s }, tx);
    return s;
  });
  invalidateSearchIndex(); res.json(s);
});
/** Quick toggles from the list view (enable/disable, popular, price). */
adminCatalogRouter.patch('/services/:id', requireAdmin('catalog.manage'), async (req, res) => {
  const b = parse(z.object({ active: z.boolean().optional(), popular: z.boolean().optional(), basePrice: rupeesToPaise.optional(), discountPrice: rupeesToPaise.optional().nullable(), sortOrder: z.number().int().optional() }), req.body);
  const s = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(services).where(eq(services.id, (req.params.id as string)));
    if (!before) throw notFound('Service');
    const base = b.basePrice ?? before.basePrice; const disc = b.discountPrice === undefined ? before.discountPrice : b.discountPrice;
    if (disc != null && disc > base) throw badRequest('Offer price must be less than or equal to base price');
    const [s] = await tx.update(services).set(b).where(eq(services.id, (req.params.id as string))).returning();
    if (b.basePrice !== undefined || b.discountPrice !== undefined) await tx.insert(servicePriceHistory).values({ serviceId: s.id, basePrice: s.basePrice, discountPrice: s.discountPrice, changedBy: req.admin!.sub });
    await audit({ req, action: 'service.patch', entity: 'service', entityId: s.id, before: Object.fromEntries(Object.keys(b).map((k) => [k, (before as Record<string, unknown>)[k]])), after: b }, tx);
    return s;
  });
  invalidateSearchIndex(); res.json(s);
});
adminCatalogRouter.delete('/services/:id', requireAdmin('catalog.manage'), async (req, res) => {
  const [s] = await db.update(services).set({ deletedAt: new Date(), active: false, slug: `deleted-${crypto.randomBytes(4).toString('hex')}` }).where(eq(services.id, (req.params.id as string))).returning();
  if (!s) throw notFound('Service');
  await audit({ req, action: 'service.delete', entity: 'service', entityId: s.id });
  invalidateSearchIndex(); res.json({ ok: true });
});
/** Public service images (served via /public-files). */
adminCatalogRouter.post('/services/:id/image', requireAdmin('catalog.manage'), upload.single('image'), async (req, res) => {
  if (!req.file) throw badRequest('Attach an image.');
  const type = sniffImage(req.file.buffer);
  if (!type) throw badRequest('Only JPG, PNG or WEBP.');
  const key = `public/services/${(req.params.id as string)}-${crypto.randomUUID()}.${type.split('/')[1]}`;
  await storage.put(key, req.file.buffer, type);
  const imageUrl = env.STORAGE_PROVIDER === 'local' ? `${env.PUBLIC_BASE_URL}/${key.replace(/^public\//, 'public-files/')}` : await storage.signedUrl(key, 7 * 86400);
  const [s] = await db.update(services).set({ imageUrl }).where(eq(services.id, (req.params.id as string))).returning();
  if (!s) throw notFound('Service');
  res.json(s);
});

// ───────────── Offers / banners ─────────────
const offerSchema = z.object({
  title: z.string().trim().min(2).max(120), subtitle: z.string().max(240).optional().nullable(),
  kind: z.enum(['COUPON', 'SEASONAL', 'NEW_USER', 'REFERRAL', 'CASHBACK']).default('COUPON'), couponCode: z.string().max(32).optional().nullable(),
  ctaLabel: z.string().max(40).optional().nullable(), ctaTarget: z.string().max(200).optional().nullable(), theme: z.enum(['blue', 'orange', 'navy', 'green']).default('blue'),
  sortOrder: z.number().int().default(0), active: z.boolean().default(true),
  startsAt: z.coerce.date().optional().nullable(), endsAt: z.coerce.date().optional().nullable(),
});
adminCatalogRouter.get('/offers', requireAdmin('coupons.manage'), async (_req, res) => { res.json(await db.select().from(offers).orderBy(asc(offers.sortOrder))); });
adminCatalogRouter.post('/offers', requireAdmin('coupons.manage'), async (req, res) => {
  const [o] = await db.insert(offers).values(parse(offerSchema, req.body)).returning();
  await audit({ req, action: 'offer.create', entity: 'offer', entityId: o.id, after: o }); res.status(201).json(o);
});
adminCatalogRouter.put('/offers/:id', requireAdmin('coupons.manage'), async (req, res) => {
  const [o] = await db.update(offers).set(parse(offerSchema.partial(), req.body)).where(eq(offers.id, (req.params.id as string))).returning();
  if (!o) throw notFound('Offer');
  await audit({ req, action: 'offer.update', entity: 'offer', entityId: o.id, after: o }); res.json(o);
});
adminCatalogRouter.delete('/offers/:id', requireAdmin('coupons.manage'), async (req, res) => {
  const r = await db.delete(offers).where(eq(offers.id, (req.params.id as string))).returning();
  if (!r.length) throw notFound('Offer');
  await audit({ req, action: 'offer.delete', entity: 'offer', entityId: (req.params.id as string) }); res.json({ ok: true });
});

// ───────────── Time slots ─────────────
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const slotSchema = z.object({ label: z.string().trim().min(2).max(40), startTime: hhmm, endTime: hhmm, capacity: z.number().int().min(1).max(500).default(20), sortOrder: z.number().int().default(0), active: z.boolean().default(true) })
  .refine((s) => s.startTime < s.endTime, { message: 'End time must be after start time', path: ['endTime'] });
adminCatalogRouter.get('/slots', requireAdmin('settings.manage'), async (_req, res) => { res.json(await db.select().from(timeSlots).orderBy(asc(timeSlots.sortOrder))); });
adminCatalogRouter.post('/slots', requireAdmin('settings.manage'), async (req, res) => {
  const [s] = await db.insert(timeSlots).values(parse(slotSchema, req.body)).returning();
  await audit({ req, action: 'slot.create', entity: 'slot', entityId: s.id, after: s }); res.status(201).json(s);
});
adminCatalogRouter.put('/slots/:id', requireAdmin('settings.manage'), async (req, res) => {
  const [s] = await db.update(timeSlots).set(parse(slotSchema, req.body)).where(eq(timeSlots.id, (req.params.id as string))).returning();
  if (!s) throw notFound('Slot');
  await audit({ req, action: 'slot.update', entity: 'slot', entityId: s.id, after: s }); res.json(s);
});
