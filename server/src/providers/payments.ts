import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { hmac, randomToken, safeEqual } from '../lib/crypto.js';

export interface CreatedOrder { orderId: string; amount: number; currency: 'INR'; keyId: string | null; provider: string }
export interface WebhookEvent { eventId: string; type: 'payment.captured' | 'payment.failed' | 'refund.processed' | 'other'; orderId?: string; paymentId?: string; method?: string; amount?: number; failureReason?: string; raw: unknown }
export interface PaymentProvider {
  name: 'razorpay' | 'mock';
  createOrder(amountPaise: number, receipt: string, notes: Record<string, string>): Promise<CreatedOrder>;
  /** Server-to-server status check (never trust the client). */
  fetchOrderPayment(orderId: string): Promise<{ status: 'PAID' | 'FAILED' | 'PENDING'; paymentId?: string; method?: string }>;
  verifyWebhook(rawBody: Buffer, signature: string | undefined): WebhookEvent;
  refund(paymentId: string, amountPaise: number): Promise<{ refundId: string }>;
}

class InvalidSignature extends Error {}
export { InvalidSignature };

const razorpay = (): PaymentProvider => {
  const auth = 'Basic ' + Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
  const api = async (path: string, init?: RequestInit) => {
    const r = await fetch('https://api.razorpay.com/v1' + path, { ...init, headers: { authorization: auth, 'content-type': 'application/json', ...(init?.headers ?? {}) } });
    const body = await r.json();
    if (!r.ok) throw new Error(`Razorpay ${r.status}: ${JSON.stringify(body)}`);
    return body as any;
  };
  return {
    name: 'razorpay',
    async createOrder(amount, receipt, notes) {
      const o = await api('/orders', { method: 'POST', body: JSON.stringify({ amount, currency: 'INR', receipt, notes, payment_capture: 1 }) });
      return { orderId: o.id, amount, currency: 'INR', keyId: env.RAZORPAY_KEY_ID!, provider: 'razorpay' };
    },
    async fetchOrderPayment(orderId) {
      const list = await api(`/orders/${orderId}/payments`);
      const captured = list.items?.find((p: any) => p.status === 'captured');
      if (captured) return { status: 'PAID', paymentId: captured.id, method: captured.method };
      if (list.items?.length && list.items.every((p: any) => p.status === 'failed')) return { status: 'FAILED' };
      return { status: 'PENDING' };
    },
    verifyWebhook(raw, sig) {
      const expected = hmac(env.RAZORPAY_WEBHOOK_SECRET!, raw.toString('utf8'));
      if (!sig || !safeEqual(expected, sig)) throw new InvalidSignature('Invalid Razorpay signature');
      const e = JSON.parse(raw.toString('utf8'));
      const p = e.payload?.payment?.entity; const rf = e.payload?.refund?.entity;
      const type = e.event === 'payment.captured' || e.event === 'order.paid' ? 'payment.captured'
        : e.event === 'payment.failed' ? 'payment.failed' : e.event === 'refund.processed' ? 'refund.processed' : 'other';
      return { eventId: e.id ?? `${e.event}:${p?.id ?? rf?.id}`, type, orderId: p?.order_id, paymentId: p?.id ?? rf?.payment_id, method: p?.method, amount: p?.amount ?? rf?.amount, failureReason: p?.error_description, raw: e };
    },
    async refund(paymentId, amount) {
      const r = await api(`/payments/${paymentId}/refund`, { method: 'POST', body: JSON.stringify({ amount, speed: 'normal' }) });
      return { refundId: r.id };
    },
  };
};

/**
 * MOCK provider — LOCAL DEVELOPMENT ONLY (blocked in production by env.ts).
 * Orders are completed through POST /payments/mock/complete, which signs a webhook exactly like a real gateway would.
 */
const mockState = new Map<string, { status: 'PAID' | 'FAILED' | 'PENDING'; paymentId?: string; method?: string }>();
const mock: PaymentProvider = {
  name: 'mock',
  async createOrder(amount) { const orderId = 'order_mock_' + randomToken(9); mockState.set(orderId, { status: 'PENDING' }); return { orderId, amount, currency: 'INR', keyId: null, provider: 'mock' }; },
  async fetchOrderPayment(orderId) { return mockState.get(orderId) ?? { status: 'PENDING' }; },
  verifyWebhook(raw, sig) {
    const expected = hmac(env.MOCK_PAYMENT_WEBHOOK_SECRET, raw.toString('utf8'));
    if (!sig || !safeEqual(expected, sig)) throw new InvalidSignature('Invalid mock signature');
    const e = JSON.parse(raw.toString('utf8'));
    if (e.type === 'payment.captured') mockState.set(e.orderId, { status: 'PAID', paymentId: e.paymentId, method: e.method });
    if (e.type === 'payment.failed') mockState.set(e.orderId, { status: 'FAILED' });
    return { ...e, raw: e };
  },
  async refund() { return { refundId: 'rfnd_mock_' + crypto.randomBytes(6).toString('hex') }; },
};

export const paymentsProvider: PaymentProvider = env.PAYMENT_PROVIDER === 'razorpay' ? razorpay() : mock;
export const signMockWebhook = (body: string) => hmac(env.MOCK_PAYMENT_WEBHOOK_SECRET, body);
