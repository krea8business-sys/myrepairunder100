import { and, eq, lt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { bookings } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import { expireOffers, runAssignment } from '../modules/bookings/assignment.service.js';
import { cancelBooking } from '../modules/bookings/booking.service.js';
import { expirePromoLots } from '../modules/wallet/wallet.service.js';

/**
 * Lightweight in-process scheduler. With several API replicas set RUN_JOBS=false on all but one
 * (or run `npm run worker` as a separate process). Every job is idempotent.
 */
async function safe(name: string, fn: () => Promise<unknown>) {
  try { await fn(); } catch (e) { logger.error(e, `job ${name} failed`); }
}

export async function expireUnpaidBookings() {
  const due = await db.select({ id: bookings.id }).from(bookings).where(and(eq(bookings.status, 'PENDING'), lt(bookings.paymentExpiresAt, new Date())));
  for (const b of due) await safe('expire-unpaid', () => cancelBooking(b.id, { type: 'SYSTEM' }, 'Payment not completed in time'));
  return due.length;
}

/** Retry assignment for confirmed bookings that have no open offers (e.g. technicians came online later). */
export async function retryStuckAssignments() {
  const stuck = await db.select({ id: bookings.id }).from(bookings).where(and(eq(bookings.status, 'CONFIRMED'), eq(bookings.needsManualAssignment, false)));
  for (const b of stuck) await safe('retry-assign', async () => {
    const { jobOffers } = await import('../db/schema.js');
    const open = await db.select({ id: jobOffers.id }).from(jobOffers).where(and(eq(jobOffers.bookingId, b.id), eq(jobOffers.status, 'OFFERED')));
    if (!open.length) await runAssignment(b.id);
  });
}

export function startJobs() {
  const every = (ms: number, name: string, fn: () => Promise<unknown>) => setInterval(() => void safe(name, fn), ms).unref();
  every(30_000, 'expire-offers', expireOffers);
  every(60_000, 'expire-unpaid', expireUnpaidBookings);
  every(120_000, 'retry-assign', retryStuckAssignments);
  every(3_600_000, 'expire-promo', expirePromoLots);
  logger.info('background jobs started');
}
