/**
 * End-to-end flow test against a real PostgreSQL database (seeded with `npm run db:seed`).
 * Runs the whole lifecycle through the HTTP API exactly as the apps do:
 *   OTP login (+ referral) → home/search → cart → coupon → address → slot → booking → pay (mock gateway, signed webhook)
 *   → auto-assignment → two technicians race to accept → travel + live location → start code → add-on approve/reject
 *   → complete → final payment → warranty → referral reward → review → invoice → admin.
 * Also checks: idempotent booking create, webhook replay, wallet double-spend, OTP rate limiting, RBAC.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as ioClient } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { initRealtime } from '../src/realtime/io.js';
import { pool } from '../src/db/client.js';
import { signMockWebhook } from '../src/providers/payments.js';

let base = '';
let server: http.Server;
const rnd = () => String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
const newPhone = () => '9' + rnd().slice(0, 1).replace(/[0-5]/, '7') + rnd();

async function api(method: string, path: string, body?: unknown, token?: string) {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json: any; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, body: json, headers: r.headers };
}
const ok = (r: { status: number; body: any }, msg = '') => { assert.ok(r.status < 400, `${msg} → ${r.status} ${JSON.stringify(r.body)}`); return r.body; };

async function login(phone: string, app: 'customer' | 'technician' = 'customer', extra: Record<string, unknown> = {}) {
  const s = ok(await api('POST', '/v1/auth/send-otp', { phone }), 'send-otp');
  assert.match(s.devOtp, /^\d{6}$/);
  return ok(await api('POST', '/v1/auth/verify-otp', { phone, otp: s.devOtp, app, ...extra }), 'verify-otp');
}

before(async () => {
  await pool.query(`DELETE FROM otp_requests`); // fresh rate-limit window for the test run
  await pool.query(`UPDATE technicians SET availability = 'AVAILABLE', last_lat = NULL, last_lng = NULL`);
  await pool.query(`UPDATE bookings SET status = 'CANCELLED' WHERE status NOT IN ('COMPLETED','CANCELLED')`); // free technician capacity from earlier runs
  server = http.createServer(createApp());
  initRealtime(server, []);
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => { server.close(); await pool.end(); });

test('full booking lifecycle', async () => {
  // ── Referrer A and referred customer B ──
  const A = await login(newPhone(), 'customer', { name: 'Asha Referrer', deviceId: 'device-A-' + rnd() });
  assert.equal(A.isNew, true);
  const B = await login(newPhone(), 'customer', { name: 'Bharat Customer', referralCode: A.user.referralCode, deviceId: 'device-B-' + rnd() });
  const tB = B.accessToken;

  // wrong OTP is rejected and counted
  const p = newPhone();
  ok(await api('POST', '/v1/auth/send-otp', { phone: p }));
  const bad = await api('POST', '/v1/auth/verify-otp', { phone: p, otp: '000000' });
  assert.equal(bad.status, 400); assert.match(bad.body.error.message, /attempts left/);
  // resend cooldown
  assert.equal((await api('POST', '/v1/auth/send-otp', { phone: p })).status, 429);

  // ── Browse ──
  const home = ok(await api('GET', '/v1/home'));
  assert.equal(home.categories.length, 4);
  assert.ok(home.popular.length > 0);
  const search = ok(await api('GET', '/v1/search?q=' + encodeURIComponent('AC is not cooling')));
  assert.equal(search.categorySlug, 'ac-repair');
  assert.ok(search.results.every((s: any) => s.categoryId === home.categories[0].id), 'search stays in AC');
  assert.match(search.results[0].name, /Checkup|Cooling/);
  const ac = ok(await api('GET', '/v1/categories/ac-repair'));
  const checkup = ac.services.find((s: any) => s.slug === 'ac-checkup');
  const jet = ac.services.find((s: any) => s.slug === 'ac-jet-service');
  assert.equal(checkup.price, 14900);

  // ── Cart (server prices only) ──
  ok(await api('POST', '/v1/me/cart', { serviceId: checkup.id, quantity: 1 }, tB));
  const cart = ok(await api('POST', '/v1/me/cart', { serviceId: jet.id, quantity: 1, price: 1 }, tB)); // client "price" is ignored
  assert.equal(cart.quote.itemsTotal, 14900 + 34900);
  const q = ok(await api('POST', '/v1/me/cart/quote', { couponCode: 'WELCOME50', useWallet: false }, tB));
  assert.equal(q.couponDiscount, 5000); assert.equal(q.grandTotal, 44800);
  const badCoupon = ok(await api('POST', '/v1/me/cart/quote', { couponCode: 'NOPE' }, tB));
  assert.equal(badCoupon.couponError, 'Invalid coupon code.');

  // ── Address + serviceability ──
  assert.equal(ok(await api('GET', '/v1/location/serviceability?pincode=999999')).serviceable, false);
  const addr = ok(await api('POST', '/v1/me/addresses', { label: 'HOME', contactName: 'Bharat', contactPhone: '9876543210', houseNo: 'H-12', street: 'Gali 4', landmark: 'Near Metro', locality: 'Sant Nagar, Burari', city: 'Delhi', state: 'Delhi', pincode: '110084', lat: 28.7375, lng: 77.1966 }, tB));
  assert.equal(addr.serviceability.serviceable, true);

  const slots = ok(await api('GET', '/v1/me/slots', undefined, tB));
  const day = slots.days.find((d: any) => d.label === 'Tomorrow') ?? slots.days[1];
  const slot = day.slots.find((s: any) => s.available);

  // ── Book (idempotent) ──
  const reqId = 'req-' + rnd();
  const payload = { addressId: addr.id, date: day.date, slotId: slot.id, couponCode: 'WELCOME50', useWallet: false, paymentMode: 'PAY_NOW', clientRequestId: reqId, problemDescription: 'Cooling is weak' };
  const created = ok(await api('POST', '/v1/bookings', payload, tB), 'create booking');
  const again = ok(await api('POST', '/v1/bookings', payload, tB), 'retry create');
  assert.equal(created.booking.id, again.booking.id, 'same clientRequestId → same booking');
  const bid = created.booking.id;
  assert.equal(created.booking.status, 'PENDING'); assert.equal(created.requiresPayment, true);
  assert.equal(created.booking.bill.grandTotal, 44800);
  assert.equal(ok(await api('GET', '/v1/me/cart', undefined, tB)).items.length, 0, 'cart cleared');

  // ── Pay (mock gateway → signed webhook) ──
  const order = ok(await api('POST', '/v1/payments/create', { bookingId: bid }, tB));
  assert.equal(order.amount, 44800);
  const forged = await api('POST', '/v1/payments/webhook', { type: 'payment.captured', orderId: order.orderId });
  assert.equal(forged.status, 400, 'unsigned webhook rejected');
  const evt = JSON.stringify({ eventId: 'evt_test_' + rnd(), type: 'payment.captured', orderId: order.orderId, paymentId: 'pay_' + rnd(), method: 'upi' });
  const hook = (await fetch(base + '/v1/payments/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-mock-signature': signMockWebhook(evt) }, body: evt })).json() as Promise<any>;
  assert.equal((await hook).duplicate, false);
  const replay = await (await fetch(base + '/v1/payments/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-mock-signature': signMockWebhook(evt) }, body: evt })).json() as any;
  assert.equal(replay.duplicate, true, 'webhook replay ignored');

  // runAssignment runs post-commit; give it a moment
  await new Promise((r) => setTimeout(r, 400));
  let d = ok(await api('GET', `/v1/bookings/${bid}`, undefined, tB));
  assert.equal(d.status, 'CONFIRMED'); assert.equal(d.bill.amountPaid, 44800);

  // ── Technicians: both AC technicians serving 110084 receive the offer and race ──
  const T1 = await login('+919000000001', 'technician');
  const T3 = await login('+919000000003', 'technician');
  const T2 = await login('+919000000002', 'technician');
  const offers1 = ok(await api('GET', '/v1/technician/jobs?tab=requests', undefined, T1.accessToken));
  const offers3 = ok(await api('GET', '/v1/technician/jobs?tab=requests', undefined, T3.accessToken));
  const offers2 = ok(await api('GET', '/v1/technician/jobs?tab=requests', undefined, T2.accessToken));
  assert.ok(offers1.some((o: any) => o.id === bid) && offers3.some((o: any) => o.id === bid), 'offered to both AC techs');
  assert.ok(!offers2.some((o: any) => o.id === bid), 'not offered to tech without AC skill');
  const offerView = ok(await api('GET', `/v1/technician/jobs/${bid}`, undefined, T1.accessToken));
  assert.equal(offerView.customerPhone, null, 'no customer phone before acceptance');
  assert.equal(offerView.address.houseNo, undefined, 'no exact address before acceptance');

  const [a1, a3] = await Promise.all([
    api('POST', `/v1/technician/jobs/${bid}/accept`, {}, T1.accessToken),
    api('POST', `/v1/technician/jobs/${bid}/accept`, {}, T3.accessToken),
  ]);
  const winners = [a1, a3].filter((r) => r.status === 200);
  assert.equal(winners.length, 1, 'exactly one technician wins');
  assert.equal([a1, a3].find((r) => r.status !== 200)!.body.error.code, 'ALREADY_ASSIGNED');
  const T = a1.status === 200 ? T1 : T3;
  const tT = T.accessToken;

  // live updates over the socket
  const sock = ioClient(base, { auth: { token: tB }, transports: ['websocket'] });
  const joined = await new Promise<any>((r) => sock.emit('booking:join', bid, r));
  assert.equal(joined.ok, true);
  const strangers = ioClient(base, { auth: { token: A.accessToken }, transports: ['websocket'] });
  assert.equal((await new Promise<any>((r) => strangers.emit('booking:join', bid, r))).ok, false, 'other customers cannot subscribe');
  strangers.close();
  const locEvent = new Promise<any>((r) => sock.on('tech:location', r));

  // no location sharing before travel
  assert.equal(ok(await api('POST', '/v1/technician/location', { lat: 28.70, lng: 77.19 }, tT)).stored, false);
  ok(await api('POST', `/v1/technician/jobs/${bid}/on-the-way`, {}, tT));
  assert.equal(ok(await api('POST', '/v1/technician/location', { lat: 28.7301, lng: 77.1902 }, tT)).stored, true);
  const loc = await locEvent;
  assert.equal(loc.bookingId, bid);
  const track = ok(await api('GET', `/v1/bookings/${bid}/tracking`, undefined, tB));
  assert.ok(track.technician && track.eta.mins > 0, 'tracking with ETA');
  sock.close();

  ok(await api('POST', `/v1/technician/jobs/${bid}/arrived`, {}, tT));
  d = ok(await api('GET', `/v1/bookings/${bid}`, undefined, tB));
  assert.match(d.startCode, /^\d{4}$/);
  assert.ok(d.technician.phone, 'customer can call technician during active job');
  const wrong = await api('POST', `/v1/technician/jobs/${bid}/start`, { code: d.startCode === '0000' ? '1111' : '0000' }, tT);
  assert.equal(wrong.body.error.code, 'START_CODE_INVALID');
  ok(await api('POST', `/v1/technician/jobs/${bid}/start`, { code: d.startCode }, tT));

  // ── Add-ons: approve one service, reject one part ──
  const gas = ac.services.find((s: any) => s.slug === 'ac-gas-charging');
  const add1 = ok(await api('POST', `/v1/technician/jobs/${bid}/addons`, { kind: 'SERVICE', serviceId: gas.id, quantity: 1, unitPrice: 1 }, tT));
  assert.equal(add1.unitPrice, gas.price, 'catalog price used, technician cannot override');
  const add2 = ok(await api('POST', `/v1/technician/jobs/${bid}/addons`, { kind: 'PART', name: 'Capacitor 35uF', unitPrice: 45000, quantity: 1, warrantyDays: 90 }, tT));
  assert.equal((await api('POST', `/v1/technician/jobs/${bid}/complete`, {}, tT)).body.error.code, 'ADDON_PENDING');
  ok(await api('POST', `/v1/bookings/${bid}/addons/${add1.id}/decision`, { approve: true }, tB));
  d = ok(await api('POST', `/v1/bookings/${bid}/addons/${add2.id}/decision`, { approve: false }, tB));
  assert.equal(d.bill.addonsTotal, gas.price);
  assert.equal(d.bill.grandTotal, 44800 + gas.price);
  assert.equal((await api('POST', `/v1/bookings/${bid}/addons/${add2.id}/decision`, { approve: true }, tB)).status, 409, 'decision is final');

  // ── Complete → final payment ──
  const done = ok(await api('POST', `/v1/technician/jobs/${bid}/complete`, {}, tT));
  assert.equal(done.status, 'PAYMENT_PENDING'); assert.equal(done.amountDue, gas.price);
  const fin = ok(await api('POST', '/v1/payments/create', { bookingId: bid }, tB));
  assert.equal(fin.amount, gas.price);
  ok(await api('POST', '/v1/payments/mock/complete', { orderId: fin.orderId, outcome: 'success' }, tB));
  ok(await api('POST', '/v1/payments/verify', { orderId: fin.orderId }, tB));
  d = ok(await api('GET', `/v1/bookings/${bid}`, undefined, tB));
  assert.equal(d.status, 'COMPLETED'); assert.equal(d.paymentStatus, 'PAID');
  assert.ok(d.warranty.active && d.warranty.until, 'warranty activated');
  assert.equal(d.startCode, undefined);

  // ── Referral reward (order value ≥ ₹499) ──
  const wA = ok(await api('GET', '/v1/me/wallet', undefined, A.accessToken));
  assert.equal(wA.balance, 10000, 'referrer got ₹100');
  const wB = ok(await api('GET', '/v1/me/wallet', undefined, tB));
  assert.equal(wB.balance, 5000, 'referee got ₹50 welcome');
  const ref = ok(await api('GET', '/v1/me/referral', undefined, A.accessToken));
  assert.equal(ref.stats.rewarded, 1);

  // ── Review + invoice + warranty claim ──
  ok(await api('POST', `/v1/bookings/${bid}/review`, { technicianRating: 5, serviceRating: 4, comment: 'Quick and clean work' }, tB));
  assert.equal((await api('POST', `/v1/bookings/${bid}/review`, { technicianRating: 1, serviceRating: 1 }, tB)).status, 409);
  const inv = await fetch(`${base}/v1/bookings/${bid}/invoice.pdf`, { headers: { authorization: `Bearer ${tB}` } });
  assert.equal(inv.status, 200); assert.equal(inv.headers.get('content-type'), 'application/pdf');
  assert.ok((await inv.arrayBuffer()).byteLength > 1000);
  ok(await api('POST', `/v1/bookings/${bid}/warranty-claim`, { description: 'Cooling dropped again after a week' }, tB));
  // other customers can't see this booking
  assert.equal((await api('GET', `/v1/bookings/${bid}`, undefined, A.accessToken)).status, 404);

  // ── Wallet: concurrent bookings cannot double-spend ₹50 ──
  ok(await api('POST', '/v1/me/cart', { serviceId: checkup.id }, tB));
  const s2 = slots.days[2].slots.find((s: any) => s.available) ?? slot;
  const mk = (id: string) => api('POST', '/v1/bookings', { addressId: addr.id, date: slots.days[2].date, slotId: s2.id, useWallet: true, paymentMode: 'PAY_AFTER_SERVICE', clientRequestId: id }, tB);
  const results = await Promise.all([mk('w1-' + rnd()), mk('w2-' + rnd())]);
  const okOnes = results.filter((r) => r.status === 201);
  const usedTotal = okOnes.reduce((a, r) => a + r.body.booking.bill.walletUsed, 0);
  assert.ok(usedTotal <= 5000, `wallet used ${usedTotal} ≤ balance`);
  const wB2 = ok(await api('GET', '/v1/me/wallet', undefined, tB));
  assert.ok(wB2.balance >= 0); assert.equal(wB2.balance, 5000 - usedTotal);

  // cancel → wallet refunded, no fee before assignment
  const b2 = okOnes[0].body.booking;
  const prev = ok(await api('GET', `/v1/bookings/${b2.id}/cancel-preview`, undefined, tB));
  assert.equal(prev.fee, 0);
  // wait for auto-assignment side effects to settle before cancelling
  await new Promise((r) => setTimeout(r, 300));
  ok(await api('POST', `/v1/bookings/${b2.id}/cancel`, { reason: 'Not needed now' }, tB));
  const wB3 = ok(await api('GET', '/v1/me/wallet', undefined, tB));
  assert.equal(wB3.balance, 5000 - usedTotal + b2.bill.walletUsed);

  // ── Admin ──
  const adm = ok(await api('POST', '/v1/auth/admin/login', { email: 'admin@myrepairunder100.local', password: 'ChangeMe-Dev-2026' }));
  const ta = adm.accessToken;
  assert.equal((await api('GET', '/v1/admin/dashboard', undefined, tB)).status, 401, 'customer token rejected on admin');
  const dash = ok(await api('GET', '/v1/admin/dashboard', undefined, ta));
  assert.ok(dash.metrics.completedBookings >= 1);
  const list = ok(await api('GET', `/v1/admin/bookings?q=${d.code}`, undefined, ta));
  assert.equal(list.items[0].id, bid);
  const custId = B.user.id;
  const adj = ok(await api('POST', '/v1/admin/wallet/adjust', { userId: custId, type: 'PROMO', amountRupees: 25, reason: 'Goodwill credit', requestId: 'adj-' + rnd() }, ta));
  assert.equal(adj.source, 'PROMO');
  const logs = ok(await api('GET', `/v1/admin/audit-logs?entity=wallet&entityId=${custId}`, undefined, ta));
  assert.ok(logs.some((l: any) => l.action === 'wallet.promo'), 'wallet adjustment audited');
  const set = ok(await api('PUT', '/v1/admin/settings/referral', { referrerRewardPaise: 15000 }, ta));
  assert.equal(set.referrerRewardPaise, 15000);
  ok(await api('PUT', '/v1/admin/settings/referral', { referrerRewardPaise: 10000 }, ta));
  const pinFail = await api('PUT', '/v1/admin/settings/referral', { referrerRewardPaise: -5 }, ta);
  assert.equal(pinFail.status, 400, 'settings validated');
});
