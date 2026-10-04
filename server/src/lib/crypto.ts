import crypto from 'node:crypto';
import { env } from '../config/env.js';

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const hmac = (secret: string, s: string) => crypto.createHmac('sha256', secret).update(s).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const randomDigits = (n: number) => Array.from({ length: n }, () => crypto.randomInt(0, 10)).join('');

/** Constant-time comparison of two hex/ascii strings. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a); const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

// 32 random bytes (base64) is preferred; any other secret string ≥32 chars is stretched with SHA-256
// (lets hosting platforms such as Render generate the value automatically).
const rawKey = Buffer.from(env.DATA_ENCRYPTION_KEY, 'base64');
const key = rawKey.length === 32 ? rawKey : crypto.createHash('sha256').update(env.DATA_ENCRYPTION_KEY).digest();

/** AES-256-GCM. Output: base64(iv | tag | ciphertext). Used for PII at rest (service addresses). */
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}
export function decrypt(blob: string): string {
  const buf = Buffer.from(blob, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
}
export const encryptJson = (o: unknown) => encrypt(JSON.stringify(o));
export const decryptJson = <T>(s: string): T => JSON.parse(decrypt(s)) as T;
