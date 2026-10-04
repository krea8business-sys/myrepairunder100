import { and, asc, eq, gt, lte, sql } from 'drizzle-orm';
import { db, type Tx } from '../../db/client.js';
import { wallets, walletTransactions } from '../../db/schema.js';
import { badRequest, conflict } from '../../lib/errors.js';

type Source = (typeof walletTransactions.$inferInsert)['source'];

/**
 * Wallet ledger.
 *  - Every mutation runs inside a DB transaction holding a row lock on `wallets` (SELECT … FOR UPDATE),
 *    so concurrent bookings can never double-spend.
 *  - `idempotency_key` is UNIQUE: replaying the same operation is a no-op (replay protection).
 *  - CHECK (balance >= 0) at the database level makes a negative balance impossible.
 *  - Credits are "lots" with an optional expiry; debits consume earliest-expiring lots first (FIFO).
 */
async function lockWallet(tx: Tx, userId: string) {
  await tx.insert(wallets).values({ userId }).onConflictDoNothing();
  const r = await tx.execute<{ balance: number }>(sql`SELECT balance FROM wallets WHERE user_id = ${userId} FOR UPDATE`);
  return Number(r.rows[0].balance);
}

async function existing(tx: Tx, key: string) {
  const [t] = await tx.select().from(walletTransactions).where(eq(walletTransactions.idempotencyKey, key));
  return t;
}

export async function credit(tx: Tx, a: { userId: string; amount: number; source: Source; description: string; idempotencyKey: string; bookingId?: string | null; expiresAt?: Date | null; adminId?: string | null }) {
  if (!Number.isInteger(a.amount) || a.amount <= 0) throw badRequest('Amount must be positive.');
  const balance = await lockWallet(tx, a.userId);
  const prev = await existing(tx, a.idempotencyKey);
  if (prev) return prev;
  const balanceAfter = balance + a.amount;
  await tx.update(wallets).set({ balance: balanceAfter }).where(eq(wallets.userId, a.userId));
  const [t] = await tx.insert(walletTransactions).values({
    userId: a.userId, type: 'CREDIT', source: a.source, amount: a.amount, balanceAfter, remaining: a.amount,
    expiresAt: a.expiresAt ?? null, bookingId: a.bookingId ?? null, description: a.description, idempotencyKey: a.idempotencyKey, createdByAdmin: a.adminId ?? null,
  }).returning();
  return t;
}

export async function debit(tx: Tx, a: { userId: string; amount: number; source: Source; description: string; idempotencyKey: string; bookingId?: string | null; adminId?: string | null }) {
  if (!Number.isInteger(a.amount) || a.amount <= 0) throw badRequest('Amount must be positive.');
  const balance = await lockWallet(tx, a.userId);
  const prev = await existing(tx, a.idempotencyKey);
  if (prev) return prev;
  if (a.amount > balance) throw conflict('Insufficient wallet balance.', 'WALLET_INSUFFICIENT');

  // consume lots: soonest expiry first, non-expiring last, then oldest
  const lots = await tx.select().from(walletTransactions)
    .where(and(eq(walletTransactions.userId, a.userId), eq(walletTransactions.type, 'CREDIT'), gt(walletTransactions.remaining, 0)))
    .orderBy(sql`${walletTransactions.expiresAt} ASC NULLS LAST`, asc(walletTransactions.createdAt));
  let left = a.amount;
  for (const lot of lots) {
    if (!left) break;
    const take = Math.min(lot.remaining, left);
    await tx.update(walletTransactions).set({ remaining: lot.remaining - take }).where(eq(walletTransactions.id, lot.id));
    left -= take;
  }
  const balanceAfter = balance - a.amount;
  await tx.update(wallets).set({ balance: balanceAfter }).where(eq(wallets.userId, a.userId));
  const [t] = await tx.insert(walletTransactions).values({
    userId: a.userId, type: 'DEBIT', source: a.source, amount: a.amount, balanceAfter, remaining: 0,
    bookingId: a.bookingId ?? null, description: a.description, idempotencyKey: a.idempotencyKey, createdByAdmin: a.adminId ?? null,
  }).returning();
  return t;
}

export async function getBalance(userId: string) {
  const [w] = await db.select().from(wallets).where(eq(wallets.userId, userId));
  return w?.balance ?? 0;
}

/** Background job: expire unspent promotional lots. */
export async function expirePromoLots() {
  const due = await db.select({ id: walletTransactions.id, userId: walletTransactions.userId }).from(walletTransactions)
    .where(and(eq(walletTransactions.type, 'CREDIT'), gt(walletTransactions.remaining, 0), lte(walletTransactions.expiresAt, new Date())));
  for (const lot of due) {
    await db.transaction(async (tx) => {
      const balance = await lockWallet(tx, lot.userId);
      const [fresh] = await tx.select().from(walletTransactions).where(eq(walletTransactions.id, lot.id));
      if (!fresh || fresh.remaining <= 0) return;
      const amount = Math.min(fresh.remaining, balance);
      await tx.update(walletTransactions).set({ remaining: 0 }).where(eq(walletTransactions.id, lot.id));
      if (amount <= 0) return;
      await tx.update(wallets).set({ balance: balance - amount }).where(eq(wallets.userId, lot.userId));
      await tx.insert(walletTransactions).values({ userId: lot.userId, type: 'DEBIT', source: 'EXPIRY', amount, balanceAfter: balance - amount, description: `Expired: ${fresh.description}`, idempotencyKey: `expiry:${lot.id}` });
    });
  }
  return due.length;
}

