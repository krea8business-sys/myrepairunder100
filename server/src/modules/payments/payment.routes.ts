import { Router } from 'express';
import { z } from 'zod';
import { requireCustomer } from '../../lib/auth.js';
import { parse } from '../../lib/validate.js';
import { createPaymentForBooking, handleWebhook, verifyPayment } from './payment.service.js';
import { InvalidSignature, paymentsProvider, signMockWebhook } from '../../providers/payments.js';
import { isProd, testMode } from '../../config/env.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { randomToken } from '../../lib/crypto.js';

export const paymentRouter = Router();

paymentRouter.post('/create', requireCustomer, async (req, res) => {
  const { bookingId } = parse(z.object({ bookingId: z.uuid() }), req.body);
  res.json(await createPaymentForBooking(req.user!.sub, bookingId));
});

paymentRouter.post('/verify', requireCustomer, async (req, res) => {
  const { orderId } = parse(z.object({ orderId: z.string().min(5).max(64) }), req.body);
  res.json(await verifyPayment(req.user!.sub, orderId));
});

/** Gateway → server. Signature verified against the RAW body (see app.ts express.raw for this path). */
paymentRouter.post('/webhook', async (req, res) => {
  const sig = (req.headers['x-razorpay-signature'] ?? req.headers['x-mock-signature']) as string | undefined;
  try {
    const r = await handleWebhook(req.body as Buffer, sig);
    res.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof InvalidSignature) return res.status(400).json({ ok: false, error: 'invalid signature' });
    throw e;
  }
});

/**
 * DEV ONLY — simulates the customer finishing checkout on the mock gateway. Disabled in production and
 * whenever a real gateway is configured. It goes through the exact same signed-webhook path.
 */
paymentRouter.post('/mock/complete', requireCustomer, async (req, res) => {
  if ((isProd && !testMode) || paymentsProvider.name !== 'mock') throw notFound();
  const { orderId, outcome, method } = parse(z.object({ orderId: z.string(), outcome: z.enum(['success', 'failure']).default('success'), method: z.enum(['upi', 'card', 'netbanking']).default('upi') }), req.body);
  if (!orderId.startsWith('order_mock_')) throw badRequest('Not a mock order');
  const body = JSON.stringify({ eventId: 'evt_' + randomToken(8), type: outcome === 'success' ? 'payment.captured' : 'payment.failed', orderId, paymentId: 'pay_mock_' + randomToken(8), method, failureReason: outcome === 'failure' ? 'Simulated failure' : undefined });
  res.json(await handleWebhook(Buffer.from(body), signMockWebhook(body)));
});
