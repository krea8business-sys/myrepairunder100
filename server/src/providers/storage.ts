import fs from 'node:fs/promises';
import path from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env.js';
import { hmac, safeEqual } from '../lib/crypto.js';

export interface StorageProvider {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Short-lived URL for private files (photos, documents). */
  signedUrl(key: string, ttlSec?: number): Promise<string>;
  read?(key: string): Promise<Buffer>;
}

const root = path.resolve(env.LOCAL_UPLOAD_DIR);
const safeKey = (key: string) => { const p = path.resolve(root, key); if (!p.startsWith(root + path.sep)) throw new Error('bad key'); return p; };

export const signFileToken = (key: string, exp: number) => hmac(env.FILE_URL_SECRET, `${key}|${exp}`);
export const verifyFileToken = (key: string, exp: number, sig: string) => exp > Date.now() / 1000 && safeEqual(signFileToken(key, exp), sig);

const local: StorageProvider = {
  async put(key, body) { const p = safeKey(key); await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, body); },
  async signedUrl(key, ttl = 900) { const exp = Math.floor(Date.now() / 1000) + ttl; return `${env.PUBLIC_BASE_URL}/files/${encodeURIComponent(key)}?exp=${exp}&sig=${signFileToken(key, exp)}`; },
  async read(key) { return fs.readFile(safeKey(key)); },
};

const s3 = (): StorageProvider => {
  const client = new S3Client({ region: env.S3_REGION, endpoint: env.S3_ENDPOINT, forcePathStyle: !!env.S3_ENDPOINT, credentials: env.S3_ACCESS_KEY_ID ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY! } : undefined });
  return {
    async put(key, body, contentType) { await client.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: 'AES256' })); },
    async signedUrl(key, ttl = 900) { return getSignedUrl(client, new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), { expiresIn: ttl }); },
  };
};

export const storage: StorageProvider = env.STORAGE_PROVIDER === 's3' ? s3() : local;

/** Validates image uploads by magic bytes, not just the client-sent MIME type. */
export function sniffImage(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}
export function sniffDocument(buf: Buffer): string | null {
  if (buf.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  return sniffImage(buf);
}
