import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

export interface PushMessage { to: string[]; title: string; body: string; data?: Record<string, unknown> }
export interface PushProvider { name: string; send(m: PushMessage): Promise<{ invalidTokens: string[] }> }

/** Expo push service — works for both Android (FCM) and iOS (APNs) builds made with EAS. */
const expo: PushProvider = {
  name: 'expo',
  async send(m) {
    if (!m.to.length) return { invalidTokens: [] };
    const r = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}) },
      body: JSON.stringify(m.to.map((to) => ({ to, title: m.title, body: m.body, data: m.data, sound: 'default', priority: 'high' }))),
    });
    const j: any = await r.json().catch(() => ({}));
    const invalid = (j.data ?? []).map((t: any, i: number) => (t.details?.error === 'DeviceNotRegistered' ? m.to[i] : null)).filter(Boolean);
    return { invalidTokens: invalid };
  },
};
const log: PushProvider = { name: 'log', async send(m) { logger.info({ to: m.to.length, title: m.title }, '[LOG PUSH] ' + m.body); return { invalidTokens: [] }; } };

export const push: PushProvider = env.PUSH_PROVIDER === 'expo' ? expo : log;
