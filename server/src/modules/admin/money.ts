import { Router } from 'express';
import { z } from 'zod';
import { and, count, desc, eq, ilike, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { coupons, payments, referrals, users, walletTransactions, wallets, bookings, refunds } from '../../db/schema.js';
import { requireAdmin } from '../../lib/auth.js';
import { parse } from '../../lib/validate.js';
import { conflict, notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { credit, debit } from '../wallet/wallet.service.js';
import { getSettings } from '../settings/settings.service.js';
import { notify } from '../notifications/notify.js';
import { formatINR } from '../../lib/money.js';

export const adminMoneyRouter = Router();
const pg = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) });

// ───────────── Coupons ─────────────
const couponSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,32}$/, '3–32 letters/numbers'), title: z.string().trim().min(2).max(120), description: z.string().max(300).optional().nullable(),
  discountType: z.enum(['PERCENT', 'FLAT']),
  /** PERCENT: whole percent (e.g. 10). FLAT: rupees. Converted below. */
  value: z.number().positive(), minOrder: z.number().min(0).default(0), maxDiscount: z.number().positive().optional().nullable(),
  startsAt: z.coerce.date().optional().nullable(), expiresAt: z.coerce.date().optional().nullable(),
  usageLimit: z.number().int().positive().optional().nullable(), perUserLimit: z.number().int().min(1).default(1),
  categoryId: z.uuid().optional().nullable(), serviceId: z.uuid().optional().nullable(), newUsersOnly: z.boolean().default(false), showInOffers: z.boolean().default(true), active: z.boolean().default(true),
}).refine((c) => c.discountType === 'FLAT' || c.value <= 100, { message: 'Percent must be ≤ 100', path: ['value'] });
const toDb = (c: z.infer<typeof couponSchema>) => ({
  ...c, value: c.discountType === 'PERCENT' ? Math.round(c.value * 100) : Math.round(c.value * 100),
  minOrder: Math.round(c.minOrder * 100), maxDiscount: c.maxDiscount != null ? Math.round(c.maxDiscount * 100) : null,
});
adminMoneyRouter.get('/coupons', requireAdmin('coupons.manage'), async (_req, res) => {
  res.json(await db.select().from(coupons).where(isNull(coupons.deletedAt)).orderBy(desc(coupons.createdAt)));
});
adminMoneyRouter.post('/coupons', requireAdmin('coupons.manage'), async (req, res) => {
  try {
    const [c] = await db.insert(coupons).values(toDb(parse(couponSchema, req.body))).returning();
    await audit({ req, action: 'coupon.create', entity: 'coupon', entityId: c.id, after: c }); res.status(201).json(c);
  } catch (e) { if ((e as { code?: string }).code === '23505') throw conflict('Coupon code already exists.'); throw e; }
});
adminMoneyRouter.put('/coupons/:id', requireAdmin('coupons.manage'), async (req, res) => {
  const [before] = await db.select().from(coupons).where(eq(coupons.id, (req.params.id as string)));
  if (!before) throw notFound('Coupon');
  const [c] = await db.update(coupons).set(toDb(parse(couponSchema, req.body))).where(eq(coupons.id, (req.params.id as string))).returning();
  await audit({ req, action: 'coupon.update', entity: 'coupon', entityId: c.id, before, after: c }); res.json(c);
});
adminMoneyRouter.delete('/coupons/:id', requireAdmin('coupons.manage'), async (req, res) => {
  const [c] = await db.update(coupons).set({ deletedAt: new Date(), active: false, code: sql`${coupons.code} || '-DEL-' || substr(md5(random()::text),1,4)` }).where(eq(coupons.id, (req.params.id as string))).returning();
  if (!c) throw notFound('Coupon');
  await audit({ req, action: 'coupon.delete', entity: 'coupon', entityId: c.id }); res.json({ ok: true });
});

// ───────────── Wallet (every manual adjustment is audit-logged) ─────────────
adminMoneyRouter.get('/wallet/transactions', requireAdmin('wallet.view'), async (req, res) => {
  const q = parse(pg.extend({ userId: z.uuid().optional(), source: z.string().optional() }), req.query);
  const where = and(q.userId ? eq(walletTransactions.userId, q.userId) : undefined, q.source ? eq(walletTransactions.source, q.source as never) : undefined);
  const rows = await db.select({ t: walletTransactions, name: users.name, phone: users.phone }).from(walletTransactions).innerJoin(users, eq(users.id, walletTransactions.userId)).where(where).orderBy(desc(walletTransactions.createdAt)).limit(q.limit).offset((q.page - 1) * q.limit);
  const [{ n }] = await db.select({ n: count() }).from(walletTransactions).where(where);
  const [{ liability }] = await db.select({ liability: sql<number>`COALESCE(SUM(${wallets.balance}),0)`.mapWith(Number) }).from(wallets);
  res.json({ items: rows.map((r) => ({ ...r.t, customerName: r.name, customerPhone: r.phone })), total: Number(n), liability, page: q.page });
});
adminMoneyRouter.post('/wallet/adjust', requireAdmin('wallet.adjust'), async (req, res) => {
  const b = parse(z.object({
    userId: z.uuid(), type: z.enum(['CREDIT', 'DEBIT', 'PROMO']), amountRupees: z.number().positive().max(100_000), reason: z.string().trim().min(5).max(200),
    requestId: z.string().min(8).max(64), // idempotency from the admin UI
  }), req.body);
  const s = await getSettings();
  const amount = Math.round(b.amountRupees * 100);
  const [u] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, b.userId));
  if (!u || u.role !== 'CUSTOMER') throw notFound('Customer');
  const before = (await db.select().from(wallets).where(eq(wallets.userId, b.userId)))[0]?.balance ?? 0;
  const t = await db.transaction(async (tx) => {
    const key = `admin:${req.admin!.sub}:${b.requestId}`;
    const txn = b.type === 'DEBIT'
      ? await debit(tx, { userId: b.userId, amount, source: 'ADMIN_DEBIT', description: b.reason, idempotencyKey: key, adminId: req.admin!.sub })
      : await credit(tx, { userId: b.userId, amount, source: b.type === 'PROMO' ? 'PROMO' : 'ADMIN_CREDIT', description: b.reason, idempotencyKey: key, adminId: req.admin!.sub, expiresAt: b.type === 'PROMO' ? new Date(Date.now() + s.wallet.promoExpiryDays * 86400_000) : null });
    await audit({ req, action: `wallet.${b.type.toLowerCase()}`, entity: 'wallet', entityId: b.userId, before: { balance: before }, after: { balance: txn.balanceAfter, amount, reason: b.reason, txnId: txn.id } }, tx);
    return txn;
  });
  if (b.type !== 'DEBIT') void notify(b.userId, 'WALLET_CREDIT', 'Wallet credited', `${formatINR(amount)} added to your wallet. ${b.type === 'PROMO' ? `Valid for ${s.wallet.promoExpiryDays} days.` : ''}`.trim());
  res.json(t);
});

// ───────────── Payments & refunds ─────────────
adminMoneyRouter.get('/payments', requireAdmin('payments.view'), async (req, res) => {
  const q = parse(pg.extend({ status: z.string().optional(), q: z.string().max(40).optional() }), req.query);
  const where = and(q.status ? eq(payments.status, q.status as never) : undefined, q.q ? ilike(bookings.code, `%${q.q.replace(/[%_]/g, '')}%`) : undefined);
  const rows = await db.select({ p: payments, code: bookings.code, customer: users.name }).from(payments).innerJoin(bookings, eq(bookings.id, payments.bookingId)).innerJoin(users, eq(users.id, payments.userId))
    .where(where).orderBy(desc(payments.createdAt)).limit(q.limit).offset((q.page - 1) * q.limit);
  const [{ n }] = await db.select({ n: count() }).from(payments).innerJoin(bookings, eq(bookings.id, payments.bookingId)).where(where);
  const rfs = await db.select({ r: refunds, code: bookings.code }).from(refunds).innerJoin(bookings, eq(bookings.id, refunds.bookingId)).orderBy(desc(refunds.createdAt)).limit(50);
  res.json({ items: rows.map((r) => ({ ...r.p, bookingCode: r.code, customerName: r.customer })), total: Number(n), refunds: rfs.map((r) => ({ ...r.r, bookingCode: r.code })) });
});

// ───────────── Referrals ─────────────
adminMoneyRouter.get('/referrals', requireAdmin('referrals.manage'), async (req, res) => {
  const q = parse(pg.extend({ status: z.enum(['PENDING', 'REWARDED', 'BLOCKED', 'EXPIRED']).optional() }), req.query);
  const referrer = db.$with('referrer').as(db.select({ id: users.id, name: users.name, phone: users.phone }).from(users));
  const rows = await db.with(referrer).select({ r: referrals, refereeName: users.name, refereePhone: users.phone, referrerName: referrer.name, referrerPhone: referrer.phone })
    .from(referrals).innerJoin(users, eq(users.id, referrals.refereeId)).innerJoin(referrer, eq(referrer.id, referrals.referrerId))
    .where(q.status ? eq(referrals.status, q.status) : undefined).orderBy(desc(referrals.createdAt)).limit(q.limit).offset((q.page - 1) * q.limit);
  const stats = await db.select({ status: referrals.status, n: count(), rewards: sql<number>`COALESCE(SUM(${referrals.referrerReward} + ${referrals.refereeReward}),0)`.mapWith(Number) }).from(referrals).groupBy(referrals.status);
  const st = (s: string) => stats.find((x) => x.status === s);
  res.json({
    stats: { total: stats.reduce((a, x) => a + Number(x.n), 0), successful: Number(st('REWARDED')?.n ?? 0), pending: Number(st('PENDING')?.n ?? 0), blocked: Number(st('BLOCKED')?.n ?? 0), rewardsIssued: st('REWARDED')?.rewards ?? 0 },
    items: rows.map((r) => ({ ...r.r, refereeName: r.refereeName, refereePhone: r.refereePhone, referrerName: r.referrerName, referrerPhone: r.referrerPhone })),
    rules: (await getSettings()).referral,
  });
});
adminMoneyRouter.post('/referrals/:id/block', requireAdmin('referrals.manage'), async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(200) }), req.body);
  const [r] = await db.update(referrals).set({ status: 'BLOCKED', blockReason: reason }).where(and(eq(referrals.id, (req.params.id as string)), eq(referrals.status, 'PENDING'))).returning();
  if (!r) throw conflict('Only pending referrals can be blocked.');
  await audit({ req, action: 'referral.block', entity: 'referral', entityId: r.id, after: { reason } }); res.json(r);
});
adminMoneyRouter.post('/referrals/:id/unblock', requireAdmin('referrals.manage'), async (req, res) => {
  const [r] = await db.update(referrals).set({ status: 'PENDING', blockReason: null }).where(and(eq(referrals.id, (req.params.id as string)), eq(referrals.status, 'BLOCKED'))).returning();
  if (!r) throw conflict('Only blocked referrals can be unblocked.');
  await audit({ req, action: 'referral.unblock', entity: 'referral', entityId: r.id }); res.json(r);
});

