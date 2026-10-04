import { Router } from 'express';
import { z } from 'zod';
import { and, asc, eq, isNull, sql, lte, gte, or } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { categories, subcategories, services, offers, coupons, timeSlots } from '../../db/schema.js';
import { notFound } from '../../lib/errors.js';
import { parse } from '../../lib/validate.js';
import { getSettings } from '../settings/settings.service.js';
import { testMode } from '../../config/env.js';
import { searchServices } from './search.js';
import { track } from '../analytics/track.js';
import { verifyUserToken } from '../../lib/auth.js';
import type { Request } from 'express';
import { publicService } from './serialize.js';
export { publicService };

export const catalogRouter = Router();

const activeService = and(eq(services.active, true), isNull(services.deletedAt));
const optionalUserId = (req: Request) => { const h = req.headers.authorization; if (!h?.startsWith('Bearer ')) return null; try { return verifyUserToken(h.slice(7)).sub; } catch { return null; } };

async function categoryList() {
  const rows = await db.select({
    c: categories,
    startingPrice: sql<number>`(SELECT MIN(COALESCE(s.discount_price, s.base_price)) FROM services s WHERE s.category_id = "categories"."id" AND s.active AND s.deleted_at IS NULL)`.mapWith(Number),
    serviceCount: sql<number>`(SELECT COUNT(*) FROM services s WHERE s.category_id = "categories"."id" AND s.active AND s.deleted_at IS NULL)`.mapWith(Number),
  }).from(categories).where(and(eq(categories.active, true), isNull(categories.deletedAt))).orderBy(asc(categories.sortOrder));
  return rows.map(({ c, startingPrice, serviceCount }) => ({
    id: c.id, slug: c.slug, name: c.name, shortDescription: c.shortDescription, icon: c.icon, imageUrl: c.imageUrl, startingPrice: startingPrice || null, serviceCount,
  }));
}

async function liveOffers() {
  const now = new Date();
  return db.select().from(offers).where(and(eq(offers.active, true),
    or(isNull(offers.startsAt), lte(offers.startsAt, now)), or(isNull(offers.endsAt), gte(offers.endsAt, now)))).orderBy(asc(offers.sortOrder));
}

/** One round-trip for the home screen (important on slow mobile networks). */
catalogRouter.get('/home', async (_req, res) => {
  const s = await getSettings();
  const [cats, popular, offerRows] = await Promise.all([
    categoryList(),
    db.select().from(services).where(and(activeService, eq(services.popular, true))).orderBy(asc(services.sortOrder)).limit(12),
    liveOffers(),
  ]);
  res.set('Cache-Control', 'public, max-age=15');
  res.json({
    company: { name: s.company.name, tagline: s.company.tagline, supportPhone: s.company.supportPhone, whatsapp: s.company.whatsapp, publicStats: s.company.publicStats },
    categories: cats,
    popular: s.features.popularOnHome ? popular.map(publicService) : [],
    offers: s.features.offersOnHome ? offerRows : [],
    referral: s.referral.enabled ? { referrerReward: s.referral.referrerRewardPaise, refereeReward: s.referral.refereeRewardPaise } : null,
    whyChooseUs: s.features.whyChooseUsOnHome ? s.features.whyChooseUs : [],
    features: s.features,
    testMode,
  });
});

catalogRouter.get('/categories', async (_req, res) => { res.set('Cache-Control', 'public, max-age=60'); res.json(await categoryList()); });

catalogRouter.get('/categories/:idOrSlug', async (req, res) => {
  const key = (req.params.idOrSlug as string);
  const isUuid = /^[0-9a-f-]{36}$/i.test(key);
  const [c] = await db.select().from(categories).where(and(isUuid ? eq(categories.id, key) : eq(categories.slug, key), eq(categories.active, true), isNull(categories.deletedAt)));
  if (!c) throw notFound('Category');
  const [subs, svcs] = await Promise.all([
    db.select().from(subcategories).where(and(eq(subcategories.categoryId, c.id), eq(subcategories.active, true), isNull(subcategories.deletedAt))).orderBy(asc(subcategories.sortOrder)),
    db.select().from(services).where(and(eq(services.categoryId, c.id), activeService)).orderBy(asc(services.sortOrder)),
  ]);
  void track('category_click', { userId: optionalUserId(req), props: { category: c.slug } });
  res.json({
    category: { id: c.id, slug: c.slug, name: c.name, shortDescription: c.shortDescription, icon: c.icon, imageUrl: c.imageUrl, seoTitle: c.seoTitle, seoDescription: c.seoDescription },
    subcategories: subs.map((s) => ({ id: s.id, slug: s.slug, name: s.name })),
    services: svcs.map(publicService),
  });
});
catalogRouter.get('/categories/:id/services', async (req, res) => {
  const svcs = await db.select().from(services).where(and(eq(services.categoryId, (req.params.id as string)), activeService)).orderBy(asc(services.sortOrder));
  res.json(svcs.map(publicService));
});

catalogRouter.get('/services/:idOrSlug', async (req, res) => {
  const key = (req.params.idOrSlug as string);
  const isUuid = /^[0-9a-f-]{36}$/i.test(key);
  const [s] = await db.select().from(services).where(and(isUuid ? eq(services.id, key) : eq(services.slug, key), activeService));
  if (!s) throw notFound('Service');
  const [cat] = await db.select({ name: categories.name, slug: categories.slug }).from(categories).where(eq(categories.id, s.categoryId));
  const related = await db.select().from(services).where(and(eq(services.categoryId, s.categoryId), activeService, sql`${services.id} <> ${s.id}`)).orderBy(asc(services.sortOrder)).limit(4);
  void track('service_view', { userId: optionalUserId(req), props: { service: s.slug } });
  res.json({ service: publicService(s), category: cat, related: related.map(publicService) });
});

catalogRouter.get('/search', async (req, res) => {
  const { q } = parse(z.object({ q: z.string().trim().min(1).max(100) }), req.query);
  const result = await searchServices(q);
  void track('service_search', { userId: optionalUserId(req), props: { q: q.slice(0, 80), results: result.results.length } });
  res.json(result);
});

catalogRouter.get('/offers', async (_req, res) => {
  const now = new Date();
  const [o, c] = await Promise.all([
    liveOffers(),
    db.select({ code: coupons.code, title: coupons.title, description: coupons.description, discountType: coupons.discountType, value: coupons.value, minOrder: coupons.minOrder, maxDiscount: coupons.maxDiscount, expiresAt: coupons.expiresAt, newUsersOnly: coupons.newUsersOnly })
      .from(coupons).where(and(eq(coupons.active, true), eq(coupons.showInOffers, true), isNull(coupons.deletedAt), or(isNull(coupons.expiresAt), gte(coupons.expiresAt, now)), or(isNull(coupons.startsAt), lte(coupons.startsAt, now)))),
  ]);
  res.json({ offers: o, coupons: c });
});

/** Public config the apps need (no secrets). */
catalogRouter.get('/config', async (_req, res) => {
  const s = await getSettings();
  const slots = await db.select().from(timeSlots).where(eq(timeSlots.active, true)).orderBy(asc(timeSlots.sortOrder));
  res.json({
    testMode,
    features: { ...s.features, referEarn: s.referral.enabled, cashPayment: s.payments.cashEnabled, asap: s.booking.asapEnabled },
    company: s.company,
    payments: s.payments, booking: { advanceDays: s.booking.advanceDays, asapEnabled: s.booking.asapEnabled },
    tax: { enabled: s.tax.enabled, label: s.tax.label, mode: s.tax.mode },
    slots: slots.map((t) => ({ id: t.id, label: t.label, startTime: t.startTime, endTime: t.endTime })),
    cancellation: s.cancellation,
  });
});
