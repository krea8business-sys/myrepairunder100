import { Router } from 'express';
import { z } from 'zod';
import { and, asc, count, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  addresses, bookings, cartItems, notifications, referrals, services, timeSlots, users, walletTransactions, refreshTokens, pushTokens, wallets,
} from '../../db/schema.js';
import { requireCustomer } from '../../lib/auth.js';
import { parse } from '../../lib/validate.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { checkServiceability } from '../location/location.service.js';
import { buildQuote } from '../pricing/quote.service.js';
import { getSettings } from '../settings/settings.service.js';
import { getBalance } from '../wallet/wallet.service.js';
import { applyReferralLater } from '../referral/referral.service.js';
import { env } from '../../config/env.js';
import { addDays, hhmmToMinutes, istDate, istMinutes } from '../../lib/dates.js';
import { track } from '../analytics/track.js';
import { audit } from '../../lib/audit.js';
import crypto from 'node:crypto';

export const customerRouter = Router();
customerRouter.use(requireCustomer);

// ───────────── Profile ─────────────
customerRouter.get('/', async (req, res) => {
  const [u] = await db.select().from(users).where(eq(users.id, req.user!.sub));
  if (!u) throw notFound('User');
  res.json({ id: u.id, phone: u.phone, name: u.name, email: u.email, referralCode: u.referralCode, createdAt: u.createdAt, walletBalance: await getBalance(u.id) });
});
customerRouter.patch('/', async (req, res) => {
  const b = parse(z.object({ name: z.string().trim().min(2).max(120).optional(), email: z.email().max(200).optional().or(z.literal('')) }), req.body);
  const [u] = await db.update(users).set({ name: b.name, email: b.email || null }).where(eq(users.id, req.user!.sub)).returning();
  res.json({ id: u.id, phone: u.phone, name: u.name, email: u.email });
});

/** Account deletion (DPDP Act): anonymises PII, keeps financial records required by law. */
customerRouter.delete('/', async (req, res) => {
  const uid = req.user!.sub;
  const [{ n: active }] = await db.select({ n: count() }).from(bookings)
    .where(and(eq(bookings.customerId, uid), inArray(bookings.status, ['CONFIRMED', 'TECHNICIAN_ASSIGNED', 'TECHNICIAN_ON_THE_WAY', 'TECHNICIAN_ARRIVED', 'SERVICE_STARTED', 'SERVICE_COMPLETED', 'PAYMENT_PENDING'])));
  if (active > 0) throw conflict('Please complete or cancel your active bookings before deleting your account.', 'ACTIVE_BOOKINGS');
  await db.transaction(async (tx) => {
    await tx.update(users).set({ status: 'DELETED', deletedAt: new Date(), name: null, email: null, phone: `del-${crypto.randomBytes(5).toString('hex')}`, signupDeviceHash: null }).where(eq(users.id, uid));
    await tx.update(addresses).set({ deletedAt: new Date(), contactName: 'Deleted', contactPhone: '-', houseNo: '-', street: null, landmark: null, lat: null, lng: null }).where(eq(addresses.userId, uid));
    await tx.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.userId, uid));
    await tx.delete(pushTokens).where(eq(pushTokens.userId, uid));
    await tx.delete(cartItems).where(eq(cartItems.userId, uid));
    await audit({ actorType: 'CUSTOMER', actorId: uid, action: 'account.deleted', entity: 'user', entityId: uid }, tx);
  });
  res.json({ ok: true });
});

// ───────────── Addresses ─────────────
const addressSchema = z.object({
  label: z.enum(['HOME', 'WORK', 'OTHER']).default('HOME'),
  contactName: z.string().trim().min(2).max(120),
  contactPhone: z.string().trim().regex(/^(\+91)?[6-9]\d{9}$/, 'Enter a valid mobile number'),
  houseNo: z.string().trim().min(1).max(120),
  street: z.string().trim().max(200).optional().nullable(),
  landmark: z.string().trim().max(200).optional().nullable(),
  locality: z.string().trim().max(120).optional().nullable(),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Pincode must be 6 digits'),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  isDefault: z.boolean().optional(),
});
const withServiceability = async (a: typeof addresses.$inferSelect) => ({ ...a, serviceability: await checkServiceability(a.pincode) });

customerRouter.get('/addresses', async (req, res) => {
  const rows = await db.select().from(addresses).where(and(eq(addresses.userId, req.user!.sub), isNull(addresses.deletedAt))).orderBy(desc(addresses.isDefault), desc(addresses.updatedAt));
  res.json(await Promise.all(rows.map(withServiceability)));
});
customerRouter.post('/addresses', async (req, res) => {
  const b = parse(addressSchema, req.body);
  const uid = req.user!.sub;
  const [{ n }] = await db.select({ n: count() }).from(addresses).where(and(eq(addresses.userId, uid), isNull(addresses.deletedAt)));
  if (n >= 20) throw badRequest('You can save up to 20 addresses.');
  const a = await db.transaction(async (tx) => {
    const makeDefault = b.isDefault ?? n === 0;
    if (makeDefault) await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, uid));
    const [row] = await tx.insert(addresses).values({ ...b, contactPhone: b.contactPhone.replace(/^(\+91)?/, '+91'), userId: uid, isDefault: makeDefault }).returning();
    return row;
  });
  res.status(201).json(await withServiceability(a));
});
customerRouter.put('/addresses/:id', async (req, res) => {
  const b = parse(addressSchema, req.body);
  const uid = req.user!.sub;
  const a = await db.transaction(async (tx) => {
    if (b.isDefault) await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, uid));
    const [row] = await tx.update(addresses).set({ ...b, contactPhone: b.contactPhone.replace(/^(\+91)?/, '+91') })
      .where(and(eq(addresses.id, (req.params.id as string)), eq(addresses.userId, uid), isNull(addresses.deletedAt))).returning();
    return row;
  });
  if (!a) throw notFound('Address');
  res.json(await withServiceability(a));
});
customerRouter.delete('/addresses/:id', async (req, res) => {
  const r = await db.update(addresses).set({ deletedAt: new Date(), isDefault: false }).where(and(eq(addresses.id, (req.params.id as string)), eq(addresses.userId, req.user!.sub))).returning({ id: addresses.id });
  if (!r.length) throw notFound('Address');
  res.json({ ok: true });
});

// ───────────── Cart ─────────────
async function cartResponse(uid: string, couponCode?: string, useWallet?: boolean) {
  const rows = await db.select({ id: cartItems.id, serviceId: cartItems.serviceId, quantity: cartItems.quantity, s: services })
    .from(cartItems).innerJoin(services, eq(services.id, cartItems.serviceId)).where(eq(cartItems.userId, uid)).orderBy(asc(cartItems.createdAt));
  // silently drop items an admin has disabled since they were added
  const unavailable = rows.filter((r) => !r.s.active || r.s.deletedAt);
  if (unavailable.length) await db.delete(cartItems).where(inArray(cartItems.id, unavailable.map((r) => r.id)));
  const quote = await db.transaction((tx) => buildQuote(tx, uid, { couponCode, useWallet }));
  return {
    items: rows.filter((r) => r.s.active && !r.s.deletedAt).map((r) => ({
      id: r.id, serviceId: r.serviceId, quantity: r.quantity, name: r.s.name, unitPrice: r.s.discountPrice ?? r.s.basePrice,
      mrp: r.s.discountPrice != null ? r.s.basePrice : null, isStartingPrice: r.s.isStartingPrice, maxQuantity: r.s.maxQuantity, categoryId: r.s.categoryId, durationMins: r.s.durationMins,
    })),
    removedUnavailable: unavailable.map((r) => r.s.name),
    quote,
  };
}

customerRouter.get('/cart', async (req, res) => {
  const q = parse(z.object({ coupon: z.string().max(32).optional(), useWallet: z.enum(['true', 'false']).optional() }), req.query);
  res.json(await cartResponse(req.user!.sub, q.coupon, q.useWallet === 'true'));
});
customerRouter.post('/cart', async (req, res) => {
  const b = parse(z.object({ serviceId: z.uuid(), quantity: z.number().int().min(1).max(20).default(1) }), req.body);
  const [s] = await db.select().from(services).where(and(eq(services.id, b.serviceId), eq(services.active, true), isNull(services.deletedAt)));
  if (!s) throw notFound('Service');
  const [{ n }] = await db.select({ n: count() }).from(cartItems).where(eq(cartItems.userId, req.user!.sub));
  if (n >= 15) throw badRequest('Your cart is full.');
  await db.insert(cartItems).values({ userId: req.user!.sub, serviceId: b.serviceId, quantity: Math.min(b.quantity, s.maxQuantity) })
    .onConflictDoUpdate({ target: [cartItems.userId, cartItems.serviceId], set: { quantity: sql`LEAST(${cartItems.quantity} + ${b.quantity}, ${s.maxQuantity})` } });
  void track('add_to_cart', { userId: req.user!.sub, props: { service: s.slug } });
  res.status(201).json(await cartResponse(req.user!.sub));
});
customerRouter.put('/cart', async (req, res) => {
  const b = parse(z.object({ serviceId: z.uuid(), quantity: z.number().int().min(0).max(20) }), req.body);
  if (b.quantity === 0) await db.delete(cartItems).where(and(eq(cartItems.userId, req.user!.sub), eq(cartItems.serviceId, b.serviceId)));
  else {
    const [s] = await db.select({ max: services.maxQuantity }).from(services).where(eq(services.id, b.serviceId));
    if (!s) throw notFound('Service');
    await db.update(cartItems).set({ quantity: Math.min(b.quantity, s.max) }).where(and(eq(cartItems.userId, req.user!.sub), eq(cartItems.serviceId, b.serviceId)));
  }
  res.json(await cartResponse(req.user!.sub));
});
customerRouter.delete('/cart/item/:serviceId', async (req, res) => {
  await db.delete(cartItems).where(and(eq(cartItems.userId, req.user!.sub), eq(cartItems.serviceId, (req.params.serviceId as string))));
  res.json(await cartResponse(req.user!.sub));
});
customerRouter.delete('/cart', async (req, res) => { await db.delete(cartItems).where(eq(cartItems.userId, req.user!.sub)); res.json({ ok: true }); });

/** Server-computed quote for checkout (coupon + wallet preview). */
customerRouter.post('/cart/quote', async (req, res) => {
  const b = parse(z.object({ couponCode: z.string().max(32).optional().nullable(), useWallet: z.boolean().default(false) }), req.body);
  res.json(await db.transaction((tx) => buildQuote(tx, req.user!.sub, { couponCode: b.couponCode, useWallet: b.useWallet })));
});

// ───────────── Slots ─────────────
customerRouter.get('/slots', async (req, res) => {
  const s = await getSettings();
  const slots = await db.select().from(timeSlots).where(eq(timeSlots.active, true)).orderBy(asc(timeSlots.sortOrder));
  const today = istDate();
  const nowMin = istMinutes();
  const days: { date: string; label: string; slots: { id: string; label: string; available: boolean; reason?: string }[] }[] = [];
  const endDate = addDays(today, s.booking.advanceDays);
  const counts = await db.select({ date: bookings.scheduledDate, slotId: bookings.slotId, n: count() }).from(bookings)
    .where(and(sql`${bookings.scheduledDate} BETWEEN ${today} AND ${endDate}`, sql`${bookings.status} <> 'CANCELLED'`)).groupBy(bookings.scheduledDate, bookings.slotId);
  const booked = new Map(counts.map((c) => [`${c.date}|${c.slotId}`, Number(c.n)]));
  for (let i = 0; i <= s.booking.advanceDays; i++) {
    const date = addDays(today, i);
    const dow = new Date(date + 'T00:00:00Z').getUTCDay();
    if (!s.booking.workingDays.includes(dow)) continue;
    days.push({
      date, label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : new Date(date + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }),
      slots: slots.map((t) => {
        const tooSoon = i === 0 && hhmmToMinutes(t.startTime) - nowMin < s.booking.minLeadMinutes;
        const full = (booked.get(`${date}|${t.id}`) ?? 0) >= t.capacity;
        return { id: t.id, label: t.label, available: !tooSoon && !full, reason: tooSoon ? 'Too soon' : full ? 'Fully booked' : undefined };
      }),
    });
  }
  const asapAvailable = s.booking.asapEnabled && nowMin < s.booking.asapCutoffHour * 60 && s.booking.workingDays.includes(new Date(today + 'T00:00:00Z').getUTCDay());
  res.json({ days, asap: { available: asapAvailable, label: 'ASAP (within 2–3 hours)' } });
});

// ───────────── Wallet ─────────────
customerRouter.get('/wallet', async (req, res) => {
  const uid = req.user!.sub;
  const s = await getSettings();
  const [w] = await db.select().from(wallets).where(eq(wallets.userId, uid));
  const sums = await db.select({ type: walletTransactions.type, source: walletTransactions.source, total: sql<number>`SUM(${walletTransactions.amount})`.mapWith(Number) })
    .from(walletTransactions).where(eq(walletTransactions.userId, uid)).groupBy(walletTransactions.type, walletTransactions.source);
  const sum = (pred: (r: (typeof sums)[number]) => boolean) => sums.filter(pred).reduce((a, r) => a + r.total, 0);
  const expiring = await db.select({ amount: walletTransactions.remaining, expiresAt: walletTransactions.expiresAt }).from(walletTransactions)
    .where(and(eq(walletTransactions.userId, uid), eq(walletTransactions.type, 'CREDIT'), sql`${walletTransactions.remaining} > 0`, sql`${walletTransactions.expiresAt} IS NOT NULL`, lt(walletTransactions.expiresAt, new Date(Date.now() + 30 * 86400_000)))).orderBy(asc(walletTransactions.expiresAt)).limit(1);
  res.json({
    balance: w?.balance ?? 0,
    summary: {
      earned: sum((r) => r.type === 'CREDIT' && r.source !== 'REFUND'),
      used: sum((r) => r.type === 'DEBIT' && r.source === 'BOOKING'),
      refunds: sum((r) => r.type === 'CREDIT' && r.source === 'REFUND'),
      referralRewards: sum((r) => r.type === 'CREDIT' && (r.source === 'REFERRAL_REWARD' || r.source === 'REFERRAL_WELCOME')),
      promotional: sum((r) => r.type === 'CREDIT' && (r.source === 'PROMO' || r.source === 'CASHBACK' || r.source === 'ADMIN_CREDIT')),
    },
    expiringSoon: expiring[0] ?? null,
    rules: { maxUsePerBooking: s.wallet.maxUsePerBookingPaise, maxUsePercentBps: s.wallet.maxUsePercentBps, minBookingValue: s.wallet.minBookingValuePaise },
  });
});
customerRouter.get('/wallet/transactions', async (req, res) => {
  const q = parse(z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(20) }), req.query);
  const rows = await db.select({ id: walletTransactions.id, type: walletTransactions.type, source: walletTransactions.source, amount: walletTransactions.amount, balanceAfter: walletTransactions.balanceAfter, bookingId: walletTransactions.bookingId, description: walletTransactions.description, status: walletTransactions.status, expiresAt: walletTransactions.expiresAt, createdAt: walletTransactions.createdAt })
    .from(walletTransactions).where(eq(walletTransactions.userId, req.user!.sub)).orderBy(desc(walletTransactions.createdAt)).limit(q.limit).offset((q.page - 1) * q.limit);
  res.json({ items: rows, page: q.page, hasMore: rows.length === q.limit });
});
/** Preview how much wallet can be applied to the current cart (actual debit happens at booking). */
customerRouter.post('/wallet/apply', async (req, res) => {
  const b = parse(z.object({ couponCode: z.string().max(32).optional().nullable() }), req.body);
  const q = await db.transaction((tx) => buildQuote(tx, req.user!.sub, { couponCode: b.couponCode, useWallet: true }));
  res.json({ walletUsed: q.walletUsed, walletAvailable: q.walletAvailable, note: q.walletNote, grandTotal: q.grandTotal });
});

// ───────────── Referral ─────────────
customerRouter.get('/referral', async (req, res) => {
  const uid = req.user!.sub;
  const s = (await getSettings()).referral;
  const [u] = await db.select({ code: users.referralCode }).from(users).where(eq(users.id, uid));
  const stats = await db.select({ status: referrals.status, n: count(), earned: sql<number>`COALESCE(SUM(${referrals.referrerReward}),0)`.mapWith(Number) })
    .from(referrals).where(eq(referrals.referrerId, uid)).groupBy(referrals.status);
  const get = (st: string) => stats.find((x) => x.status === st);
  const [mine] = await db.select().from(referrals).where(eq(referrals.refereeId, uid));
  const link = `${env.WEB_BASE_URL}/ref/${u.code}`;
  const shareText = `Book AC, fridge, washing machine & microwave repairs with MyRepairUnder100. Use my code ${u.code} when you sign up${s.refereeRewardPaise ? ` and get ₹${s.refereeRewardPaise / 100} in your wallet after your first service` : ''}. ${link}`;
  res.json({
    enabled: s.enabled, code: u.code, link, shareText,
    rules: { referrerReward: s.referrerRewardPaise, refereeReward: s.refereeRewardPaise, minBookingValue: s.minBookingValuePaise, monthlyLimit: s.monthlyLimit },
    stats: { invited: stats.reduce((a, x) => a + Number(x.n), 0), pending: Number(get('PENDING')?.n ?? 0), rewarded: Number(get('REWARDED')?.n ?? 0), earned: stats.reduce((a, x) => a + x.earned, 0) },
    appliedCode: mine ? { code: mine.code, status: mine.status } : null,
  });
});
customerRouter.post('/referral/apply', async (req, res) => {
  const { code } = parse(z.object({ code: z.string().trim().min(4).max(16) }), req.body);
  const r = await applyReferralLater(req.user!.sub, code);
  res.json({ ok: true, status: r?.status ?? 'PENDING', message: r?.status === 'BLOCKED' ? 'This code could not be applied to your account.' : 'Referral code applied. Rewards are credited after your first completed service.' });
});
customerRouter.get('/referral/history', async (req, res) => {
  const rows = await db.select({ id: referrals.id, status: referrals.status, reward: referrals.referrerReward, createdAt: referrals.createdAt, rewardedAt: referrals.rewardedAt, name: users.name })
    .from(referrals).innerJoin(users, eq(users.id, referrals.refereeId)).where(eq(referrals.referrerId, req.user!.sub)).orderBy(desc(referrals.createdAt)).limit(100);
  // privacy: only first name of the referred friend
  res.json(rows.map((r) => ({ ...r, name: r.name ? r.name.split(' ')[0] : 'Friend' })));
});

// ───────────── Notifications ─────────────
customerRouter.get('/notifications', async (req, res) => {
  const rows = await db.select().from(notifications).where(eq(notifications.userId, req.user!.sub)).orderBy(desc(notifications.createdAt)).limit(100);
  res.json({ items: rows, unread: rows.filter((r) => !r.readAt).length });
});
customerRouter.post('/notifications/read', async (req, res) => {
  const b = parse(z.object({ ids: z.array(z.uuid()).max(100).optional() }), req.body ?? {});
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, req.user!.sub), isNull(notifications.readAt), b.ids?.length ? inArray(notifications.id, b.ids) : undefined));
  res.json({ ok: true });
});
