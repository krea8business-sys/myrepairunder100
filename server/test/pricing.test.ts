import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeQuote, couponDiscountFor, priceAddon } from '../src/modules/pricing/pricing.js';

const line = (id: string, cat: string, price: number, qty = 1, tax = 1800) => ({ serviceId: id, categoryId: cat, name: id, unitPrice: price, quantity: qty, taxRateBps: tax, warrantyDays: 0 });
const wallet = { maxUsePerBookingPaise: 10000, maxUsePercentBps: 5000, minBookingValuePaise: 19900 };

test('no tax, no coupon, no wallet', () => {
  const q = computeQuote({ lines: [line('a', 'ac', 14900), line('b', 'ac', 49900)], tax: { enabled: false, mode: 'INCLUSIVE' }, wallet, walletBalance: 0, useWallet: false });
  assert.equal(q.itemsTotal, 64800); assert.equal(q.grandTotal, 64800); assert.equal(q.taxTotal, 0);
});

test('example from the brief: ₹149 + ₹499 − ₹100 coupon − ₹50 wallet = ₹498', () => {
  const q = computeQuote({
    lines: [line('a', 'ac', 14900), line('b', 'ac', 49900)],
    coupon: { id: 'c', code: 'X', discountType: 'FLAT', value: 10000, maxDiscount: null, minOrder: 0, categoryId: null, serviceId: null },
    tax: { enabled: false, mode: 'INCLUSIVE' }, wallet, walletBalance: 5000, useWallet: true,
  });
  assert.equal(q.couponDiscount, 10000); assert.equal(q.walletUsed, 5000); assert.equal(q.grandTotal, 49800);
  assert.equal(q.lines.reduce((s, l) => s + l.discount, 0), 10000, 'discount fully allocated');
});

test('exclusive GST is added on the discounted amount', () => {
  const q = computeQuote({ lines: [line('a', 'ac', 10000)], coupon: { id: 'c', code: 'X', discountType: 'PERCENT', value: 1000, maxDiscount: null, minOrder: 0, categoryId: null, serviceId: null }, tax: { enabled: true, mode: 'EXCLUSIVE' }, wallet, walletBalance: 0, useWallet: false });
  assert.equal(q.couponDiscount, 1000); assert.equal(q.taxTotal, 1620); assert.equal(q.grandTotal, 10620);
});

test('inclusive GST is reported but not added', () => {
  const q = computeQuote({ lines: [line('a', 'ac', 11800)], tax: { enabled: true, mode: 'INCLUSIVE' }, wallet, walletBalance: 0, useWallet: false });
  assert.equal(q.taxTotal, 1800); assert.equal(q.grandTotal, 11800);
});

test('category-scoped coupon, min order and max discount', () => {
  const c = { id: 'c', code: 'COOL10', discountType: 'PERCENT' as const, value: 1000, maxDiscount: 15000, minOrder: 29900, categoryId: 'ac', serviceId: null };
  assert.match(couponDiscountFor(c, [{ serviceId: 'f', categoryId: 'fridge', gross: 90000 }]).error!, /not valid/);
  assert.match(couponDiscountFor(c, [{ serviceId: 'a', categoryId: 'ac', gross: 14900 }]).error!, /more/);
  assert.equal(couponDiscountFor(c, [{ serviceId: 'a', categoryId: 'ac', gross: 299900 }, { serviceId: 'f', categoryId: 'fridge', gross: 90000 }]).discount, 15000);
});

test('wallet caps: per-booking, percent and minimum booking value', () => {
  const big = computeQuote({ lines: [line('a', 'ac', 100000)], tax: { enabled: false, mode: 'INCLUSIVE' }, wallet, walletBalance: 50000, useWallet: true });
  assert.equal(big.walletUsed, 10000);
  const small = computeQuote({ lines: [line('a', 'ac', 14900)], tax: { enabled: false, mode: 'INCLUSIVE' }, wallet, walletBalance: 50000, useWallet: true });
  assert.equal(small.walletUsed, 0); assert.match(small.walletNote!, /₹199/);
  const pct = computeQuote({ lines: [line('a', 'ac', 20000)], tax: { enabled: false, mode: 'INCLUSIVE' }, wallet, walletBalance: 50000, useWallet: true });
  assert.equal(pct.walletUsed, 10000, '50% of ₹200');
});

test('add-on pricing', () => {
  assert.deepEqual(priceAddon(45000, 2, 1800, { enabled: true, mode: 'EXCLUSIVE' }), { tax: 16200, lineTotal: 106200 });
  assert.deepEqual(priceAddon(45000, 1, 1800, { enabled: false, mode: 'EXCLUSIVE' }), { tax: 0, lineTotal: 45000 });
});
