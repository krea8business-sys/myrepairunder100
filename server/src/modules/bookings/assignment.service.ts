import { and, eq, lt, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { bookingItems, bookings, jobOffers, technicians, users } from '../../db/schema.js';
import { conflict, forbidden, notFound, badRequest } from '../../lib/errors.js';
import { haversineKm } from '../../lib/geo.js';
import { getSettings } from '../settings/settings.service.js';
import { notify } from '../notifications/notify.js';
import { emitToAdmins, emitToBooking, emitToTech } from '../../realtime/io.js';
import { logger } from '../../lib/logger.js';
import { announce, issueStartCode, lockBooking, transition, withAfter } from './booking.service.js';

/**
 * Automatic assignment.
 * 1. Find eligible technicians: APPROVED, AVAILABLE, skilled in every category in the booking,
 *    serving the booking's pincode, under the daily job limit, within max distance (when location known).
 * 2. Score = distance · workload · rating (weights in Admin → Settings → Assignment).
 * 3. Offer the job to the top N at once; the first to accept wins. Acceptance is a single conditional
 *    UPDATE … WHERE technician_id IS NULL, so two technicians can never both claim it.
 * 4. Offers expire after a TTL; then the next batch is offered. After max rounds → admin queue.
 */
export async function runAssignment(bookingId: string) {
  const s = await getSettings();
  if (!s.assignment.autoAssign) {
    await db.update(bookings).set({ needsManualAssignment: true }).where(eq(bookings.id, bookingId));
    emitToAdmins('booking:needs-assignment', { bookingId });
    return { offered: 0 };
  }
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b || b.status !== 'CONFIRMED' || b.technicianId) return { offered: 0 };
  if (b.assignmentRound >= s.assignment.maxRounds) return escalate(b.id, b.code, 'No technician accepted in time');

  const cats = [...new Set((await db.select({ c: bookingItems.categoryId }).from(bookingItems).where(eq(bookingItems.bookingId, b.id))).map((r) => r.c))];

  const candidates = await db.execute<{ id: string; user_id: string; rating_avg: number; rating_count: number; last_lat: number | null; last_lng: number | null; load: number }>(sql`
    SELECT t.id, t.user_id, t.rating_avg, t.rating_count, t.last_lat, t.last_lng,
      (SELECT COUNT(*) FROM bookings b2 WHERE b2.technician_id = t.id AND b2.scheduled_date = ${b.scheduledDate}
         AND b2.status NOT IN ('CANCELLED','COMPLETED'))::int AS load
    FROM technicians t
    JOIN users u ON u.id = t.user_id AND u.status = 'ACTIVE'
    WHERE t.status = 'APPROVED' AND t.availability = 'AVAILABLE'
      AND EXISTS (SELECT 1 FROM technician_service_areas a WHERE a.technician_id = t.id AND a.pincode = ${b.pincode})
      AND (SELECT COUNT(DISTINCT k.category_id) FROM technician_skills k WHERE k.technician_id = t.id AND k.category_id IN ${cats}) = ${cats.length}
      AND NOT EXISTS (SELECT 1 FROM job_offers o WHERE o.booking_id = ${b.id} AND o.technician_id = t.id)`);

  const { weights, maxDistanceKm, maxJobsPerDay, offerBatchSize, offerTtlMinutes } = s.assignment;
  const scored = candidates.rows
    .map((c) => {
      const km = b.lat != null && b.lng != null && c.last_lat != null && c.last_lng != null ? haversineKm({ lat: b.lat, lng: b.lng }, { lat: c.last_lat, lng: c.last_lng }) : null;
      const distScore = km == null ? 0.5 : Math.max(0, 1 - km / maxDistanceKm);
      const loadScore = Math.max(0, 1 - Number(c.load) / maxJobsPerDay);
      const ratingScore = c.rating_count > 0 ? c.rating_avg / 5 : 0.7; // new technicians get a fair neutral score
      return { ...c, km, score: weights.distance * distScore + weights.workload * loadScore + weights.rating * ratingScore };
    })
    .filter((c) => Number(c.load) < maxJobsPerDay && (c.km == null || c.km <= maxDistanceKm))
    .sort((a, b2) => b2.score - a.score)
    .slice(0, offerBatchSize);

  const round = b.assignmentRound + 1;
  await db.update(bookings).set({ assignmentRound: round }).where(eq(bookings.id, b.id));
  if (!scored.length) return escalate(b.id, b.code, 'No eligible technician available');

  const expiresAt = new Date(Date.now() + offerTtlMinutes * 60_000);
  await db.insert(jobOffers).values(scored.map((c) => ({ bookingId: b.id, technicianId: c.id, round, score: c.score, distanceKm: c.km, expiresAt }))).onConflictDoNothing();
  for (const c of scored) {
    emitToTech(c.id, 'job:offer', { bookingId: b.id, code: b.code, expiresAt });
    void notify(c.user_id, 'JOB_OFFER', `New job request · ${b.code}`, `${b.slotLabel} on ${b.scheduledDate} in ${b.pincode}. Accept within ${offerTtlMinutes} min.`, { bookingId: b.id });
  }
  logger.info({ booking: b.code, round, offered: scored.length }, 'job offered');
  return { offered: scored.length };
}

async function escalate(bookingId: string, code: string, reason: string) {
  await db.update(bookings).set({ needsManualAssignment: true }).where(eq(bookings.id, bookingId));
  emitToAdmins('booking:needs-assignment', { bookingId, code, reason });
  return { offered: 0, escalated: reason };
}

export async function acceptOffer(techId: string, bookingId: string) {
  return withAfter(async (tx, after) => {
    const [tech] = await tx.select().from(technicians).where(eq(technicians.id, techId));
    if (!tech || tech.status !== 'APPROVED') throw forbidden('Your account must be approved by admin before accepting jobs.');
    // Lock the booking row FIRST (consistent lock order → no deadlocks between racing technicians)
    const current = await lockBooking(tx, bookingId);
    if (current.technicianId || current.status !== 'CONFIRMED') {
      await tx.update(jobOffers).set({ status: 'CANCELLED', respondedAt: new Date() }).where(and(eq(jobOffers.bookingId, bookingId), eq(jobOffers.technicianId, techId), eq(jobOffers.status, 'OFFERED')));
      throw conflict('Another technician has already accepted this job.', 'ALREADY_ASSIGNED');
    }
    const r = await tx.execute<{ id: string; status: string; expires_at: Date }>(sql`
      SELECT id, status, expires_at FROM job_offers WHERE booking_id = ${bookingId} AND technician_id = ${techId} FOR UPDATE`);
    const offer = r.rows[0];
    if (!offer) throw notFound('Job request');
    if (offer.status !== 'OFFERED') throw conflict('This job request is no longer available.', 'OFFER_CLOSED');
    if (new Date(offer.expires_at) < new Date()) throw conflict('This job request has expired.', 'OFFER_EXPIRED');

    // ATOMIC CLAIM — only one technician can ever succeed
    const claimed = await tx.update(bookings)
      .set({ technicianId: techId, status: 'TECHNICIAN_ASSIGNED', needsManualAssignment: false, version: sql`${bookings.version} + 1` })
      .where(and(eq(bookings.id, bookingId), sql`${bookings.technicianId} IS NULL`, eq(bookings.status, 'CONFIRMED')))
      .returning();
    if (!claimed.length) {
      await tx.update(jobOffers).set({ status: 'CANCELLED', respondedAt: new Date() }).where(eq(jobOffers.id, offer.id));
      throw conflict('Another technician has already accepted this job.', 'ALREADY_ASSIGNED');
    }
    const b = claimed[0];
    const { bookingStatusHistory } = await import('../../db/schema.js');
    await tx.insert(bookingStatusHistory).values({ bookingId, fromStatus: 'CONFIRMED', toStatus: 'TECHNICIAN_ASSIGNED', actorType: 'TECHNICIAN', actorId: techId, note: 'Accepted job request' });
    await tx.update(jobOffers).set({ status: 'ACCEPTED', respondedAt: new Date() }).where(eq(jobOffers.id, offer.id));
    const others = await tx.update(jobOffers).set({ status: 'CANCELLED' })
      .where(and(eq(jobOffers.bookingId, bookingId), eq(jobOffers.status, 'OFFERED'))).returning({ technicianId: jobOffers.technicianId });
    await issueStartCode(tx, bookingId);
    after.push(() => { for (const o of others) emitToTech(o.technicianId, 'job:taken', { bookingId }); });
    announce(after, b, { technicianId: techId });
    return b;
  });
}

export async function rejectOffer(techId: string, bookingId: string, reason?: string) {
  const r = await db.update(jobOffers).set({ status: 'REJECTED', respondedAt: new Date() })
    .where(and(eq(jobOffers.bookingId, bookingId), eq(jobOffers.technicianId, techId), eq(jobOffers.status, 'OFFERED'))).returning();
  if (!r.length) throw conflict('This job request is no longer available.', 'OFFER_CLOSED');
  logger.info({ bookingId, techId, reason }, 'offer rejected');
  await maybeNextRound(bookingId);
  return { ok: true };
}

async function maybeNextRound(bookingId: string) {
  const open = await db.select({ id: jobOffers.id }).from(jobOffers).where(and(eq(jobOffers.bookingId, bookingId), eq(jobOffers.status, 'OFFERED')));
  if (!open.length) await runAssignment(bookingId);
}

/** Background: expire stale offers and move to the next round. */
export async function expireOffers() {
  const expired = await db.update(jobOffers).set({ status: 'EXPIRED' })
    .where(and(eq(jobOffers.status, 'OFFERED'), lt(jobOffers.expiresAt, new Date()))).returning({ bookingId: jobOffers.bookingId, technicianId: jobOffers.technicianId });
  for (const e of expired) emitToTech(e.technicianId, 'job:expired', { bookingId: e.bookingId });
  for (const id of new Set(expired.map((e) => e.bookingId))) await maybeNextRound(id);
  return expired.length;
}

/** Admin manual assign / reassign. */
export async function adminAssign(bookingId: string, techId: string, adminId: string) {
  return withAfter(async (tx, after) => {
    const b = await lockBooking(tx, bookingId);
    const [tech] = await tx.select({ t: technicians, u: users }).from(technicians).innerJoin(users, eq(users.id, technicians.userId)).where(eq(technicians.id, techId));
    if (!tech) throw notFound('Technician');
    if (tech.t.status !== 'APPROVED') throw badRequest('Only approved technicians can be assigned.');
    if (b.technicianId === techId) return b;
    const prev = b.technicianId;
    const u = await transition(tx, b, 'TECHNICIAN_ASSIGNED', ['CONFIRMED', 'TECHNICIAN_ASSIGNED', 'TECHNICIAN_ON_THE_WAY'], { type: 'ADMIN', id: adminId },
      prev ? 'Reassigned by admin' : 'Assigned by admin', { technicianId: techId, needsManualAssignment: false });
    await tx.update(jobOffers).set({ status: 'CANCELLED' }).where(and(eq(jobOffers.bookingId, bookingId), eq(jobOffers.status, 'OFFERED')));
    if (!b.startCodeEnc) await issueStartCode(tx, bookingId);
    after.push(() => {
      emitToTech(techId, 'job:assigned', { bookingId });
      void notify(tech.u.id, 'JOB_ASSIGNED', `New job assigned · ${b.code}`, `${b.slotLabel} on ${b.scheduledDate}, pincode ${b.pincode}.`, { bookingId });
      if (prev) { emitToTech(prev, 'job:cancelled', { bookingId, reason: 'reassigned' }); emitToBooking(bookingId, 'booking:reassigned', {}); }
    });
    announce(after, u, { technicianId: techId });
    return u;
  });
}

