import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import path from 'node:path';
import { env, isProd } from './config/env.js';
import { logger } from './lib/logger.js';
import { AppError } from './lib/errors.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { catalogRouter } from './modules/catalog/catalog.routes.js';
import { locationRouter } from './modules/location/location.routes.js';
import { customerRouter } from './modules/customer/customer.routes.js';
import { bookingRouter } from './modules/bookings/booking.routes.js';
import { paymentRouter } from './modules/payments/payment.routes.js';
import { technicianRouter } from './modules/technician/technician.routes.js';
import { supportRouter } from './modules/support/support.routes.js';
import { analyticsRouter } from './modules/analytics/track.js';
import { adminRouter } from './modules/admin/index.js';
import { storage, verifyFileToken } from './providers/storage.js';
import { pool } from './db/client.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // the admin dashboard (static Next.js export) is served from /admin on this same server
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'", "'unsafe-inline'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:', 'blob:', 'https:'], connectSrc: ["'self'", 'ws:', 'wss:'],
      frameAncestors: ["'none'"], objectSrc: ["'none'"],
    } },
  }));
  const origins = env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  app.use(cors({ origin: (o, cb) => cb(null, !o || origins.includes(o) || (!isProd && /^http:\/\/localhost:\d+$/.test(o))), credentials: false }));
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));

  // Webhook needs the RAW body for signature verification — mount before express.json
  app.use('/v1/payments/webhook', express.raw({ type: '*/*', limit: '1mb' }));
  app.use(express.json({ limit: '200kb' }));

  // Global API rate limit + stricter auth limits (OTP abuse protection on top of per-phone DB limits)
  app.use('/v1', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }));
  app.use('/v1/auth', rateLimit({ windowMs: 15 * 60_000, limit: 40, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again later.' } } }));

  app.get('/health', async (_req, res) => {
    try { await pool.query('select 1'); res.json({ ok: true }); } catch { res.status(503).json({ ok: false }); }
  });

  app.use('/v1/auth', authRouter);
  app.use('/v1', catalogRouter);
  app.use('/v1/location', locationRouter);
  app.use('/v1/me', customerRouter);
  app.use('/v1/bookings', bookingRouter);
  app.use('/v1/payments', paymentRouter);
  app.use('/v1/technician', technicianRouter);
  app.use('/v1/support', supportRouter);
  app.use('/v1/analytics', analyticsRouter);
  app.use('/v1/admin', adminRouter);

  // Private files (local storage): short-lived HMAC-signed URLs only.
  app.get('/files/:key', async (req, res) => {
    const key = (req.params.key as string); const exp = Number(req.query.exp); const sig = String(req.query.sig ?? '');
    if (!verifyFileToken(key, exp, sig) || !storage.read) return res.status(403).end();
    try {
      const buf = await storage.read(key);
      const ext = path.extname(key).slice(1);
      res.type(ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`).set('Cache-Control', 'private, max-age=600').send(buf);
    } catch { res.status(404).end(); }
  });
  // Admin dashboard (static export of apps/admin) at /admin
  const adminDir = path.resolve(env.ADMIN_DIR);
  app.get('/', (_req, res) => res.redirect('/admin/'));
  app.use('/admin', express.static(adminDir, { extensions: ['html'], maxAge: '5m' }));
  app.get(/^\/admin(\/.*)?$/, (_req, res) => res.status(404).sendFile(path.join(adminDir, '404.html'), (e) => e && res.status(404).send('Admin dashboard not built. Run: npm run build -w apps/admin')));
  // Public catalog images (local storage only)
  app.use('/public-files', express.static(path.resolve(env.LOCAL_UPLOAD_DIR, 'public'), { maxAge: '7d', fallthrough: false }));

  app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } }));

  const onError: ErrorRequestHandler = (err, req, res, _next) => {
    if (err instanceof AppError) return res.status(err.status).json({ error: { code: err.code, message: err.message, details: isProd ? undefined : err.details } });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Invalid JSON body.' } });
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: { code: 'FILE_TOO_LARGE', message: 'File is too large.' } });
    if (err?.code === '23505') return res.status(409).json({ error: { code: 'DUPLICATE', message: 'This already exists.' } });
    if (err?.code === '23514' && String(err?.constraint).includes('wallet')) return res.status(409).json({ error: { code: 'WALLET_INSUFFICIENT', message: 'Insufficient wallet balance.' } });
    req.log.error(err);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } });
  };
  app.use(onError);
  return app;
}
