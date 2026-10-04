/** Feature switches: changed through the admin API, enforced by the server, visible in /config. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/client.js';
import { invalidateSettings } from '../src/modules/settings/settings.service.js';

let base = ''; let server: http.Server;
const api = async (m: string, p: string, body?: unknown, t?: string) => {
  const r = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) as any };
};
before(async () => { server = http.createServer(createApp()); await new Promise<void>((r) => server.listen(0, r)); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
after(async () => { server.close(); await pool.end(); });

test('admin switches change app behaviour', async () => {
  const adm = (await api('POST', '/v1/auth/admin/login', { email: 'admin@myrepairunder100.local', password: 'ChangeMe-Dev-2026' })).body.accessToken;
  const phone = '97' + String(Date.now()).slice(-8);
  await pool.query('DELETE FROM otp_requests WHERE phone = $1', ['+91' + phone]);
  const otp = (await api('POST', '/v1/auth/send-otp', { phone })).body.devOtp;
  const c = (await api('POST', '/v1/auth/verify-otp', { phone, otp })).body.accessToken;
  const ac = (await api('GET', '/v1/categories/ac-repair')).body.services.find((x: any) => x.price >= 19900);
  await api('POST', '/v1/me/cart', { serviceId: ac.id }, c);

  try {
    const off = await api('PUT', '/v1/admin/settings/features', { coupons: false, chat: false, wallet: false, offersOnHome: false, homeNotice: 'Closed on Diwali' }, adm);
    assert.equal(off.status, 200);
    invalidateSettings();
    const cfg = (await api('GET', '/v1/config')).body;
    assert.equal(cfg.features.coupons, false); assert.equal(cfg.features.chat, false);
    const home = (await api('GET', '/v1/home')).body;
    assert.equal(home.offers.length, 0); assert.equal(home.features.homeNotice, 'Closed on Diwali');
    const q = (await api('POST', '/v1/me/cart/quote', { couponCode: 'WELCOME50', useWallet: true }, c)).body;
    assert.equal(q.couponError, 'Coupons are not available right now.');
    assert.equal(q.walletUsed, 0);
    // support role cannot change features
    assert.equal((await api('PUT', '/v1/admin/settings/features', { coupons: true })).status, 401);
  } finally {
    await api('PUT', '/v1/admin/settings/features', { coupons: true, chat: true, wallet: true, offersOnHome: true, homeNotice: '' }, adm);
    invalidateSettings();
  }
  const q2 = (await api('POST', '/v1/me/cart/quote', { couponCode: 'WELCOME50' }, c)).body;
  assert.equal(q2.couponDiscount, 5000);
  // admin dashboard is served by the API
  const page = await fetch(base + '/admin/features/');
  assert.equal(page.status, 200);
});
