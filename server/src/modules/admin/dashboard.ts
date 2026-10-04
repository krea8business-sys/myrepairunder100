import { Router } from 'express';
import { z } from 'zod';
import { and, count, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { bookings, pincodes, referrals, technicians, users, wallets, analyticsEvents } from '../../db/schema.js';
import { requireAdmin } from '../../lib/auth.js';
import { parse } from '../../lib/validate.js';
import { istDate, addDays } from '../../lib/dates.js';

export const adminDashboardRouter = Router();

adminDashboardRouter.get('/dashboard', requireAdmin('dashboard.view'), async (_req, res) => {
  const today = istDate();
  const from = addDays(today, -13);
  const n = (r: { n: number }[]) => Number(r[0]?.n ?? 0);
  const [
    total, todayB, pending, completed, cancelled, revenue, liability, refRewards, activeTech, customers, areas, manual,
  ] = await Promise.all([
    db.select({ n: count() }).from(bookings),
    db.select({ n: count() }).from(bookings).where(eq(bookings.scheduledDate, today)),
    db.select({ n: count() }).from(bookings).where(sql`${bookings.status} IN ('PENDING','CONFIRMED')`),
    db.select({ n: count() }).from(bookings).where(eq(bookings.status, 'COMPLETED')),
    db.select({ n: count() }).from(bookings).where(eq(bookings.status, 'CANCELLED')),
    db.select({ n: sql<number>`COALESCE(SUM(amount - refunded_amount),0)` }).from(sql`payments`).where(sql`status IN ('PAID','PARTIALLY_REFUNDED')`),
    db.select({ n: sql<number>`COALESCE(SUM(${wallets.balance}),0)` }).from(wallets),
    db.select({ n: sql<number>`COALESCE(SUM(${referrals.referrerReward} + ${referrals.refereeReward}),0)` }).from(referrals).where(eq(referrals.status, 'REWARDED')),
    db.select({ n: count() }).from(technicians).where(and(eq(technicians.status, 'APPROVED'), sql`${technicians.availability} <> 'OFFLINE'`)),
    db.select({ n: count() }).from(users).where(and(eq(users.role, 'CUSTOMER'), eq(users.status, 'ACTIVE'))),
    db.select({ n: count() }).from(pincodes).where(eq(pincodes.active, true)),
    db.select({ n: count() }).from(bookings).where(and(eq(bookings.needsManualAssignment, true), eq(bookings.status, 'CONFIRMED'))),
  ]);

  const byDay = await db.execute<{ day: string; bookings: number; revenue: number }>(sql`
    WITH d AS (SELECT generate_series(${from}::date, ${today}::date, '1 day')::date AS day)
    SELECT to_char(d.day,'YYYY-MM-DD') AS day,
      (SELECT COUNT(*) FROM bookings b WHERE (b.created_at AT TIME ZONE 'Asia/Kolkata')::date = d.day)::int AS bookings,
      (SELECT COALESCE(SUM(p.amount - p.refunded_amount),0) FROM payments p WHERE p.status IN ('PAID','PARTIALLY_REFUNDED') AND (p.created_at AT TIME ZONE 'Asia/Kolkata')::date = d.day)::int AS revenue
    FROM d ORDER BY d.day`);
  const topServices = await db.execute<{ name: string; n: number; value: number }>(sql`
    SELECT i.name, SUM(i.quantity)::int AS n, SUM(i.line_total)::int AS value FROM booking_items i JOIN bookings b ON b.id = i.booking_id
    WHERE b.status <> 'CANCELLED' AND b.created_at > now() - interval '30 days' GROUP BY i.name ORDER BY n DESC LIMIT 8`);
  const byLocation = await db.execute<{ pincode: string; area: string | null; n: number }>(sql`
    SELECT b.pincode, p.area, COUNT(*)::int AS n FROM bookings b LEFT JOIN pincodes p ON p.pincode = b.pincode
    WHERE b.created_at > now() - interval '30 days' GROUP BY b.pincode, p.area ORDER BY n DESC LIMIT 8`);
  const techPerf = await db.execute<{ code: string; name: string | null; completed: number; rating: number; rating_count: number; cancelled: number }>(sql`
    SELECT t.code, u.name, t.completed_jobs AS completed, t.rating_avg AS rating, t.rating_count,
      (SELECT COUNT(*) FROM booking_status_history h WHERE h.actor_id = t.id AND h.note LIKE 'Released by technician%')::int AS cancelled
    FROM technicians t JOIN users u ON u.id = t.user_id WHERE t.status = 'APPROVED' ORDER BY t.completed_jobs DESC LIMIT 10`);

  res.json({
    metrics: {
      totalBookings: n(total), todaysBookings: n(todayB), pendingBookings: n(pending), completedBookings: n(completed), cancelledBookings: n(cancelled),
      revenue: Number(revenue[0].n), walletLiability: Number(liability[0].n), referralRewards: Number(refRewards[0].n),
      activeTechnicians: n(activeTech), customers: n(customers), serviceAreas: n(areas), needsManualAssignment: n(manual),
    },
    charts: {
      byDay: byDay.rows.map((r) => ({ day: r.day, bookings: Number(r.bookings), revenue: Number(r.revenue) })),
      topServices: topServices.rows.map((r) => ({ name: r.name, count: Number(r.n), value: Number(r.value) })),
      byLocation: byLocation.rows.map((r) => ({ pincode: r.pincode, area: r.area, count: Number(r.n) })),
      technicianPerformance: techPerf.rows.map((r) => ({ code: r.code, name: r.name, completed: Number(r.completed), rating: r.rating_count ? Math.round(Number(r.rating) * 10) / 10 : null, ratingCount: Number(r.rating_count), released: Number(r.cancelled) })),
    },
  });
});

/** Funnel + event counts for the analytics page. */
adminDashboardRouter.get('/analytics', requireAdmin('reports.view'), async (req, res) => {
  const { days } = parse(z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }), req.query);
  const since = new Date(Date.now() - days * 86400_000);
  const rows = await db.select({ name: analyticsEvents.name, n: count() }).from(analyticsEvents).where(gte(analyticsEvents.createdAt, since)).groupBy(analyticsEvents.name);
  const get = (k: string) => Number(rows.find((r) => r.name === k)?.n ?? 0);
  const topSearches = await db.execute<{ q: string; n: number; zero: number }>(sql`
    SELECT lower(props->>'q') AS q, COUNT(*)::int AS n, SUM(CASE WHEN (props->>'results')::int = 0 THEN 1 ELSE 0 END)::int AS zero
    FROM analytics_events WHERE name = 'service_search' AND created_at >= ${since} GROUP BY 1 ORDER BY n DESC LIMIT 15`);
  res.json({
    days,
    events: Object.fromEntries(rows.map((r) => [r.name, Number(r.n)])),
    funnel: [
      { step: 'Service views', n: get('service_view') }, { step: 'Add to cart', n: get('add_to_cart') }, { step: 'Checkout started', n: get('checkout_started') },
      { step: 'Booking created', n: get('booking_created') }, { step: 'Booking completed', n: get('booking_completed') },
    ],
    topSearches: topSearches.rows,
  });
});

