import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { and, eq, gt, isNull, sql, count } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { otpRequests, refreshTokens, users, technicians, wallets, pushTokens, adminUsers } from '../../db/schema.js';
import { env, isProd, testMode } from '../../config/env.js';
import { parse } from '../../lib/validate.js';
import { normalizeIndianPhone } from '../../lib/phone.js';
import { hmac, randomDigits, randomToken, safeEqual, sha256 } from '../../lib/crypto.js';
import { badRequest, forbidden, tooMany, unauthorized } from '../../lib/errors.js';
import { requireUser, signAdminAccess, signUserAccess } from '../../lib/auth.js';
import { referralCodeFor } from '../../lib/codes.js';
import { sms } from '../../providers/sms.js';
import { attachReferralAtSignup } from '../referral/referral.service.js';
import { track } from '../analytics/track.js';
import { audit } from '../../lib/audit.js';
import bcrypt from 'bcryptjs';

export const authRouter = Router();

const OTP_TTL_SEC = 300;
const RESEND_COOLDOWN_SEC = 30;
const MAX_SENDS_PER_HOUR = 5;
const MAX_SENDS_PER_IP_HOUR = 20;
const MAX_VERIFY_ATTEMPTS = 5;

const otpHash = (phone: string, code: string) => hmac(env.OTP_HASH_SECRET, `${phone}:${code}`);

authRouter.post('/send-otp', async (req, res) => {
  const { phone: raw } = parse(z.object({ phone: z.string().min(10).max(16) }), req.body);
  const phone = normalizeIndianPhone(raw);
  const hourAgo = new Date(Date.now() - 3600_000);

  const [last] = await db.select({ createdAt: otpRequests.createdAt }).from(otpRequests)
    .where(eq(otpRequests.phone, phone)).orderBy(sql`${otpRequests.createdAt} desc`).limit(1);
  if (last && Date.now() - last.createdAt.getTime() < RESEND_COOLDOWN_SEC * 1000) {
    const wait = RESEND_COOLDOWN_SEC - Math.floor((Date.now() - last.createdAt.getTime()) / 1000);
    throw tooMany(`Please wait ${wait}s before requesting another OTP.`);
  }
  const [{ n: phoneCount }] = await db.select({ n: count() }).from(otpRequests).where(and(eq(otpRequests.phone, phone), gt(otpRequests.createdAt, hourAgo)));
  if (phoneCount >= MAX_SENDS_PER_HOUR) throw tooMany('Too many OTP requests. Try again in an hour.');
  const [{ n: ipCount }] = await db.select({ n: count() }).from(otpRequests).where(and(eq(otpRequests.ip, req.ip ?? ''), gt(otpRequests.createdAt, hourAgo)));
  if (ipCount >= MAX_SENDS_PER_IP_HOUR) throw tooMany('Too many OTP requests from this network.');

  const code = randomDigits(6);
  // Invalidate older unconsumed codes for this phone
  await db.update(otpRequests).set({ consumedAt: new Date() }).where(and(eq(otpRequests.phone, phone), isNull(otpRequests.consumedAt)));
  await db.insert(otpRequests).values({ phone, codeHash: otpHash(phone, code), expiresAt: new Date(Date.now() + OTP_TTL_SEC * 1000), ip: req.ip ?? null });
  await sms.sendOtp(phone, code);

  res.json({
    ok: true, phone, expiresIn: OTP_TTL_SEC, resendIn: RESEND_COOLDOWN_SEC,
    // DEV ONLY: lets you log in locally without an SMS gateway. env.ts refuses to boot production with this on.
    ...(env.OTP_DEV_ECHO && (!isProd || testMode) && sms.name === 'mock' ? { devOtp: code } : {}),
  });
});

const verifySchema = z.object({
  phone: z.string(),
  otp: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits'),
  app: z.enum(['customer', 'technician']).default('customer'),
  referralCode: z.string().trim().toUpperCase().max(16).optional(),
  deviceId: z.string().max(128).optional(),
  name: z.string().trim().max(120).optional(),
});

authRouter.post('/verify-otp', async (req, res) => {
  const body = parse(verifySchema, req.body);
  const phone = normalizeIndianPhone(body.phone);

  const [otp] = await db.select().from(otpRequests)
    .where(and(eq(otpRequests.phone, phone), isNull(otpRequests.consumedAt), gt(otpRequests.expiresAt, new Date())))
    .orderBy(sql`${otpRequests.createdAt} desc`).limit(1);
  if (!otp) throw badRequest('OTP expired. Please request a new one.', 'OTP_EXPIRED');
  if (otp.attempts >= MAX_VERIFY_ATTEMPTS) throw tooMany('Too many wrong attempts. Request a new OTP.');

  if (!safeEqual(otp.codeHash, otpHash(phone, body.otp))) {
    // atomic increment (brute-force protection)
    await db.update(otpRequests).set({ attempts: sql`${otpRequests.attempts} + 1` }).where(eq(otpRequests.id, otp.id));
    const left = MAX_VERIFY_ATTEMPTS - otp.attempts - 1;
    throw badRequest(left > 0 ? `Incorrect OTP. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many wrong attempts. Request a new OTP.', 'OTP_INVALID');
  }
  // consume exactly once
  const consumed = await db.update(otpRequests).set({ consumedAt: new Date() })
    .where(and(eq(otpRequests.id, otp.id), isNull(otpRequests.consumedAt))).returning({ id: otpRequests.id });
  if (!consumed.length) throw badRequest('OTP already used.', 'OTP_USED');

  const role = body.app === 'technician' ? 'TECHNICIAN' : 'CUSTOMER';
  let [user] = await db.select().from(users).where(and(eq(users.phone, phone), eq(users.role, role)));
  let isNew = false;
  if (user?.status === 'BLOCKED') throw forbidden('This account is blocked. Please contact support.');

  if (!user) {
    isNew = true;
    const deviceHash = body.deviceId ? sha256('device:' + body.deviceId) : null;
    user = await db.transaction(async (tx) => {
      let created;
      // retry on the (very unlikely) referral-code collision
      for (let i = 0; i < 5 && !created; i++) {
        [created] = await tx.insert(users).values({ phone, role, name: body.name || null, referralCode: referralCodeFor(), signupDeviceHash: deviceHash })
          .onConflictDoNothing({ target: users.referralCode }).returning();
      }
      if (!created) throw new Error('could not allocate referral code');
      if (role === 'CUSTOMER') {
        await tx.insert(wallets).values({ userId: created.id }).onConflictDoNothing();
        if (body.referralCode) await attachReferralAtSignup(tx, created, body.referralCode, deviceHash);
      }
      return created;
    });
    await track('registration', { userId: user.id, props: { app: body.app, referred: !!body.referralCode } });
  }

  let tid: string | undefined;
  let technician = null;
  if (role === 'TECHNICIAN') {
    [technician] = await db.select().from(technicians).where(eq(technicians.userId, user.id));
    tid = technician?.id;
    if (technician?.status === 'SUSPENDED') throw forbidden('Your technician account is suspended. Contact the admin.');
  }

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  const tokens = await issueTokens(user.id, role, tid, req.headers['user-agent']);
  res.json({
    ...tokens, isNew,
    user: { id: user.id, phone: user.phone, name: user.name, role: user.role, referralCode: user.referralCode },
    technician: technician ? { id: technician.id, code: technician.code, status: technician.status } : null,
    needsTechnicianRegistration: role === 'TECHNICIAN' && !technician,
  });
});

export async function issueTokens(userId: string, role: 'CUSTOMER' | 'TECHNICIAN', tid?: string, ua?: string, family?: string) {
  const refreshToken = randomToken(48);
  await db.insert(refreshTokens).values({
    userId, tokenHash: sha256(refreshToken), family: family ?? crypto.randomUUID(), userAgent: ua?.slice(0, 300) ?? null,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400_000),
  });
  return { accessToken: signUserAccess({ sub: userId, role, tid }), refreshToken };
}

/** Rotating refresh tokens with reuse detection (a replayed token revokes the whole session family). */
authRouter.post('/refresh', async (req, res) => {
  const { refreshToken } = parse(z.object({ refreshToken: z.string().min(20) }), req.body);
  const [row] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, sha256(refreshToken)));
  if (!row) throw unauthorized();
  if (row.revokedAt) {
    await db.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.family, row.family), isNull(refreshTokens.revokedAt)));
    throw unauthorized('Session ended. Please log in again.');
  }
  if (row.expiresAt < new Date()) throw unauthorized();
  const revoked = await db.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.id, row.id), isNull(refreshTokens.revokedAt))).returning();
  if (!revoked.length) throw unauthorized();
  const [user] = await db.select().from(users).where(eq(users.id, row.userId));
  if (!user || user.status !== 'ACTIVE') throw unauthorized();
  let tid: string | undefined;
  if (user.role === 'TECHNICIAN') {
    const [t] = await db.select({ id: technicians.id, status: technicians.status }).from(technicians).where(eq(technicians.userId, user.id));
    if (t?.status === 'SUSPENDED') throw forbidden('Account suspended.');
    tid = t?.id;
  }
  res.json(await issueTokens(user.id, user.role, tid, req.headers['user-agent'], row.family));
});

authRouter.post('/logout', async (req, res) => {
  const { refreshToken } = parse(z.object({ refreshToken: z.string().optional(), pushToken: z.string().optional() }), req.body ?? {});
  if (refreshToken) await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.tokenHash, sha256(refreshToken)));
  if (req.body?.pushToken) await db.delete(pushTokens).where(eq(pushTokens.token, req.body.pushToken));
  res.json({ ok: true });
});

authRouter.post('/push-token', requireUser(), async (req, res) => {
  const { token, platform } = parse(z.object({ token: z.string().min(10).max(300), platform: z.enum(['ios', 'android', 'web']).optional() }), req.body);
  await db.insert(pushTokens).values({ userId: req.user!.sub, token, platform }).onConflictDoUpdate({ target: pushTokens.token, set: { userId: req.user!.sub } });
  res.json({ ok: true });
});

// ───────────── Admin login (email + password, lockout) ─────────────
authRouter.post('/admin/login', async (req, res) => {
  const { email, password } = parse(z.object({ email: z.string().trim().toLowerCase().pipe(z.email()), password: z.string().min(1).max(200) }), req.body);
  const [a] = await db.select().from(adminUsers).where(sql`lower(trim(${adminUsers.email})) = ${email}`);
  const fail = () => unauthorized('Invalid email or password.');
  if (!a || !a.active) { await bcrypt.compare(password, '$2a$12$abcdefghijklmnopqrstuuOIr4bYdS7mZ4Y0m8vAa0Fh0tXw1xGq2'); throw fail(); }
  if (a.lockedUntil && a.lockedUntil > new Date()) throw tooMany('Account locked after failed attempts. Try again later.');
  if (!(await bcrypt.compare(password, a.passwordHash))) {
    const failed = a.failedLogins + 1;
    await db.update(adminUsers).set({ failedLogins: failed >= 5 ? 0 : failed, lockedUntil: failed >= 5 ? new Date(Date.now() + 15 * 60_000) : null }).where(eq(adminUsers.id, a.id));
    throw fail();
  }
  await db.update(adminUsers).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(adminUsers.id, a.id));
  await audit({ req, actorType: 'ADMIN', actorId: a.id, action: 'admin.login', entity: 'admin_user', entityId: a.id });
  res.json({ accessToken: signAdminAccess({ sub: a.id, role: a.role }), admin: { id: a.id, name: a.name, email: a.email, role: a.role, mustChangePassword: a.mustChangePassword } });
});
