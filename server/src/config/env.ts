import 'dotenv/config';
import { z } from 'zod';

/**
 * All runtime configuration is read from environment variables and validated at boot.
 * Never hard-code credentials. See server/.env.example for every key.
 */
const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => v === true || v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  /** Public URL of this API. On Render it is filled automatically from RENDER_EXTERNAL_URL. */
  PUBLIC_BASE_URL: z.string().default(process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:4000'),
  /**
   * TEST MODE — for trying the apps on real phones before going live: allows the mock SMS (OTP shown in the app)
   * and mock payment gateway even when NODE_ENV=production. The apps show a "Test mode" banner. Never use with real customers.
   */
  TEST_MODE: bool.default(false),
  /** Folder with the built admin dashboard (served at /admin). */
  ADMIN_DIR: z.string().default('../apps/admin/out'),
  WEB_BASE_URL: z.string().default('https://myrepairunder100.example'),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:8081,http://localhost:8082'),

  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: bool.default(false),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ADMIN_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  OTP_HASH_SECRET: z.string().min(32),
  FILE_URL_SECRET: z.string().min(32),
  /** 32-byte key, base64, used to encrypt sensitive columns (AES-256-GCM). */
  DATA_ENCRYPTION_KEY: z.string().min(32),

  // OTP / SMS
  SMS_PROVIDER: z.enum(['mock', 'msg91', 'twilio']).default('mock'),
  /** DEV ONLY: echo OTP in API response when SMS_PROVIDER=mock and NODE_ENV!=production */
  OTP_DEV_ECHO: bool.default(false),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_TEMPLATE_ID: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM: z.string().optional(),

  // Payments
  PAYMENT_PROVIDER: z.enum(['mock', 'razorpay']).default('mock'),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  MOCK_PAYMENT_WEBHOOK_SECRET: z.string().default('mock-webhook-secret-dev-only'),

  // Maps
  MAPS_PROVIDER: z.enum(['mock', 'google']).default('mock'),
  GOOGLE_MAPS_SERVER_KEY: z.string().optional(),

  // Push
  PUSH_PROVIDER: z.enum(['log', 'expo']).default('log'),
  EXPO_ACCESS_TOKEN: z.string().optional(),

  // Storage
  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  LOCAL_UPLOAD_DIR: z.string().default('./uploads'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  // Background jobs (assignment expiry, promo expiry). Disable when running multiple
  // API replicas and run `npm run worker` once instead.
  RUN_JOBS: bool.default(true),
  LOG_LEVEL: z.string().default('info'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', z.treeifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';

export const testMode = env.TEST_MODE;
if (isProd && !env.TEST_MODE) {
  const problems: string[] = [];
  if (env.SMS_PROVIDER === 'mock') problems.push('SMS_PROVIDER=mock is not allowed in production');
  if (env.PAYMENT_PROVIDER === 'mock') problems.push('PAYMENT_PROVIDER=mock is not allowed in production');
  if (env.OTP_DEV_ECHO) problems.push('OTP_DEV_ECHO must be false in production');
  if (env.PAYMENT_PROVIDER === 'razorpay' && (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET || !env.RAZORPAY_WEBHOOK_SECRET))
    problems.push('Razorpay keys missing');
  if (problems.length) {
    // eslint-disable-next-line no-console
    console.error('Refusing to start in production:\n - ' + problems.join('\n - '));
    process.exit(1);
  }
}
