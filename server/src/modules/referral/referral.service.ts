import { and, count, eq, gte, ne, sql } from 'drizzle-orm';
import { db, type Tx } from '../../db/client.js';
import { bookings, referrals, users } from '../../db/schema.js';
import { getSettings } from '../settings/settings.service.js';
import { credit } from '../wallet/wallet.service.js';
import { notify } from '../notifications/notify.js';
import { badRequest, conflict } from '../../lib/errors.js';
import { formatINR } from '../../lib/money.js';
import { track } from '../analytics/track.js';

type NewUser = typeof users.$inferSelect;

/**
 * Records "B was referred by A" at signup (or within the apply window).
 * Fraud rules: no self-referral, one referral per referee (UNIQUE), referrer must be an active customer,
 * same-device signups are blocked (if enabled). Rewards are only paid after a qualifying COMPLETED booking.
 */
export async function attachReferralAtSignup(tx: Tx, referee: NewUser, rawCode: string, deviceHash: string | null) {
  const s = (await getSettings()).referral;
  if (!s.enabled) return null;
  const code = rawCode.trim().toUpperCase();
  const [referrer] = await tx.select().from(users).where(and(eq(users.referralCode, code), eq(users.role, 'CUSTOMER')));
  if (!referrer || referrer.status !== 'ACTIVE') throw badRequest('Invalid referral code.', 'REFERRAL_INVALID');
  if (referrer.id === referee.id || referrer.phone === referee.phone) throw badRequest('You cannot use your own referral code.', 'REFERRAL_SELF');

  let status: 'PENDING' | 'BLOCKED' = 'PENDING';
  let blockReason: string | null = null;
  if (s.blockSameDevice && deviceHash) {
    const [dup] = await tx.select({ n: count() }).from(users)
      .where(and(eq(users.signupDeviceHash, deviceHash), ne(users.id, referee.id)));
    if (dup.n > 0) { status = 'BLOCKED'; blockReason = 'Device already registered to another account'; }
  }
  const [r] = await tx.insert(referrals).values({ referrerId: referrer.id, refereeId: referee.id, code, status, blockReason })
    .onConflictDoNothing({ target: referrals.refereeId }).returning();
  return r ?? null;
}

/** Apply a code after signup (within the configured window, before any booking). */
export async function applyReferralLater(userId: string, code: string) {
  const s = (await getSettings()).referral;
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) throw badRequest('User not found');
  const ageDays = (Date.now() - u.createdAt.getTime()) / 86400_000;
  if (ageDays > s.applyWindowDays) throw badRequest(`Referral codes can only be applied within ${s.applyWindowDays} days of signing up.`, 'REFERRAL_WINDOW');
  const [{ n }] = await db.select({ n: count() }).from(bookings).where(eq(bookings.customerId, userId));
  if (n > 0) throw badRequest('Referral codes can only be applied before your first booking.', 'REFERRAL_TOO_LATE');
  const [existingRef] = await db.select().from(referrals).where(eq(referrals.refereeId, userId));
  if (existingRef) throw conflict('A referral code is already applied to your account.', 'REFERRAL_EXISTS');
  return db.transaction((tx) => attachReferralAtSignup(tx, u, code, u.signupDeviceHash));
}

/** Called inside the booking-completion transaction. Idempotent through wallet idempotency keys. */
export async function maybeRewardReferral(tx: Tx, booking: { id: string; customerId: string; grandTotal: number; walletUsed: number }, after: Array<() => unknown>) {
  const s = (await getSettings()).referral;
  if (!s.enabled) return;
  const r = await tx.execute<{ id: string; referrer_id: string; status: string }>(
    sql`SELECT id, referrer_id, status FROM referrals WHERE referee_id = ${booking.customerId} FOR UPDATE`);
  const ref = r.rows[0];
  if (!ref || ref.status !== 'PENDING') return;

  const value = booking.grandTotal + booking.walletUsed; // order value (wallet counts, coupon doesn't)
  if (value < s.minBookingValuePaise) return; // not a qualifying booking — wait for the next one

  const [referrer] = await tx.select().from(users).where(eq(users.id, ref.referrer_id));
  if (!referrer || referrer.status !== 'ACTIVE') {
    await tx.update(referrals).set({ status: 'BLOCKED', blockReason: 'Referrer inactive' }).where(eq(referrals.id, ref.id));
    return;
  }
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const [{ n }] = await tx.select({ n: count() }).from(referrals)
    .where(and(eq(referrals.referrerId, ref.referrer_id), eq(referrals.status, 'REWARDED'), gte(referrals.rewardedAt, monthStart)));
  const expiresAt = new Date(Date.now() + s.rewardExpiryDays * 86400_000);
  const referrerReward = n < s.monthlyLimit ? s.referrerRewardPaise : 0;

  if (referrerReward > 0) {
    await credit(tx, { userId: ref.referrer_id, amount: referrerReward, source: 'REFERRAL_REWARD', description: 'Referral reward — your friend completed their first service', idempotencyKey: `referral:${ref.id}:referrer`, expiresAt, bookingId: null });
  }
  if (s.refereeRewardPaise > 0) {
    await credit(tx, { userId: booking.customerId, amount: s.refereeRewardPaise, source: 'REFERRAL_WELCOME', description: 'Welcome reward for joining through a referral', idempotencyKey: `referral:${ref.id}:referee`, expiresAt, bookingId: booking.id });
  }
  await tx.update(referrals).set({
    status: 'REWARDED', rewardedAt: new Date(), qualifyingBookingId: booking.id, referrerReward, refereeReward: s.refereeRewardPaise,
    blockReason: referrerReward === 0 ? 'Referrer monthly limit reached — referrer not rewarded' : null,
  }).where(eq(referrals.id, ref.id));

  // side effects run only after the surrounding transaction commits
  after.push(() => {
    if (referrerReward > 0) void notify(ref.referrer_id, 'REFERRAL_REWARD', 'Referral reward received 🎉', `${formatINR(referrerReward)} added to your wallet.`);
    if (s.refereeRewardPaise > 0) void notify(booking.customerId, 'WALLET_CREDIT', 'Welcome reward added', `${formatINR(s.refereeRewardPaise)} added to your wallet.`);
    void track('referral_conversion', { userId: booking.customerId, props: { referralId: ref.id } });
  });
}
