import { and, count, eq, inArray, isNull, ne } from 'drizzle-orm';
import { type Tx } from '../../db/client.js';
import { bookings, cartItems, couponRedemptions, coupons, services, categories } from '../../db/schema.js';
import { badRequest } from '../../lib/errors.js';
import { getSettings } from '../settings/settings.service.js';
import { computeQuote, type CouponRule, type PriceLineInput } from './pricing.js';
import { getBalance } from '../wallet/wallet.service.js';

export interface QuoteRequest { items?: { serviceId: string; quantity: number }[]; couponCode?: string | null; useWallet?: boolean }

/** Load live prices for the requested services (or the user's cart). Unknown/disabled services are rejected. */
export async function loadLines(tx: Tx, userId: string, items?: { serviceId: string; quantity: number }[]): Promise<PriceLineInput[]> {
  const s = await getSettings();
  const req = items ?? (await tx.select({ serviceId: cartItems.serviceId, quantity: cartItems.quantity }).from(cartItems).where(eq(cartItems.userId, userId)));
  if (!req.length) return [];
  const ids = [...new Set(req.map((i) => i.serviceId))];
  const rows = await tx.select({ s: services, catActive: categories.active }).from(services)
    .innerJoin(categories, eq(categories.id, services.categoryId))
    .where(and(inArray(services.id, ids), isNull(services.deletedAt)));
  const byId = new Map(rows.map((r) => [r.s.id, r]));
  return req.map((i) => {
    const r = byId.get(i.serviceId);
    if (!r || !r.s.active || !r.catActive) throw badRequest('A service in your cart is no longer available. Please review your cart.', 'SERVICE_UNAVAILABLE');
    if (!Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > r.s.maxQuantity) throw badRequest(`Quantity for ${r.s.name} must be between 1 and ${r.s.maxQuantity}.`);
    return {
      serviceId: r.s.id, categoryId: r.s.categoryId, name: r.s.name,
      unitPrice: r.s.discountPrice ?? r.s.basePrice, quantity: i.quantity,
      taxRateBps: r.s.taxRateBps ?? s.tax.defaultRateBps, warrantyDays: r.s.warrantyDays,
    };
  });
}

/** Server-side coupon validation: dates, limits, per-user limits, new-user rule. Returns rule or error. */
export async function resolveCoupon(tx: Tx, userId: string, code: string): Promise<{ rule: CouponRule | null; error: string | null }> {
  const [c] = await tx.select().from(coupons).where(and(eq(coupons.code, code.trim().toUpperCase()), isNull(coupons.deletedAt)));
  const now = new Date();
  if (!c || !c.active) return { rule: null, error: 'Invalid coupon code.' };
  if (c.startsAt && c.startsAt > now) return { rule: null, error: 'This coupon is not active yet.' };
  if (c.expiresAt && c.expiresAt <= now) return { rule: null, error: 'This coupon has expired.' };
  if (c.usageLimit != null && c.usedCount >= c.usageLimit) return { rule: null, error: 'This coupon has reached its usage limit.' };
  const [{ n: mine }] = await tx.select({ n: count() }).from(couponRedemptions)
    .where(and(eq(couponRedemptions.couponId, c.id), eq(couponRedemptions.userId, userId), ne(couponRedemptions.status, 'RELEASED')));
  if (mine >= c.perUserLimit) return { rule: null, error: 'You have already used this coupon.' };
  if (c.newUsersOnly) {
    const [{ n }] = await tx.select({ n: count() }).from(bookings).where(and(eq(bookings.customerId, userId), ne(bookings.status, 'CANCELLED')));
    if (n > 0) return { rule: null, error: 'This coupon is only for your first booking.' };
  }
  return { rule: { id: c.id, code: c.code, discountType: c.discountType, value: c.value, maxDiscount: c.maxDiscount, minOrder: c.minOrder, categoryId: c.categoryId, serviceId: c.serviceId }, error: null };
}

export async function buildQuote(tx: Tx, userId: string, r: QuoteRequest, walletBalanceOverride?: number) {
  const s = await getSettings();
  const lines = await loadLines(tx, userId, r.items);
  let rule: CouponRule | null = null; let pre: string | null = null;
  if (r.couponCode) {
    if (!s.features.coupons) pre = 'Coupons are not available right now.';
    else ({ rule, error: pre } = await resolveCoupon(tx, userId, r.couponCode));
  }
  const balance = walletBalanceOverride ?? (await getBalance(userId));
  const quote = computeQuote({ lines, coupon: rule, couponPreError: pre, tax: s.tax, wallet: s.wallet, walletBalance: balance, useWallet: !!r.useWallet && s.features.wallet });
  return { ...quote, minOrderValue: s.booking.minOrderValue };
}

