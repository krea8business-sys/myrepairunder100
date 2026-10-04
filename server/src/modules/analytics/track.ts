import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { analyticsEvents } from '../../db/schema.js';
import { verifyUserToken } from '../../lib/auth.js';
import { parse } from '../../lib/validate.js';
import { logger } from '../../lib/logger.js';

export const EVENT_NAMES = [
  'app_install', 'registration', 'service_search', 'category_click', 'service_view', 'add_to_cart', 'checkout_started',
  'booking_completed', 'booking_created', 'booking_cancelled', 'payment_success', 'payment_failure', 'referral_conversion', 'wallet_usage',
] as const;

export async function track(name: (typeof EVENT_NAMES)[number], o: { userId?: string | null; anonymousId?: string | null; props?: Record<string, unknown> } = {}) {
  try { await db.insert(analyticsEvents).values({ name, userId: o.userId ?? null, anonymousId: o.anonymousId ?? null, props: o.props ?? {} }); }
  catch (e) { logger.warn(e, 'analytics insert failed'); }
}

/** Client events (installs, clicks, views). Auth optional; no PII accepted in props. */
export const analyticsRouter = Router();
analyticsRouter.post('/events', async (req, res) => {
  const body = parse(z.object({
    anonymousId: z.string().max(64).optional(),
    events: z.array(z.object({ name: z.enum(EVENT_NAMES), props: z.record(z.string(), z.union([z.string().max(200), z.number(), z.boolean(), z.null()])).optional() })).max(50),
  }), req.body);
  let userId: string | null = null;
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) { try { userId = verifyUserToken(h.slice(7)).sub; } catch { /* anonymous */ } }
  if (body.events.length) await db.insert(analyticsEvents).values(body.events.map((e) => ({ name: e.name, props: e.props ?? {}, userId, anonymousId: body.anonymousId ?? null })));
  res.json({ ok: true });
});
