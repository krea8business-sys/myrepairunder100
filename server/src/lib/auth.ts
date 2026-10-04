import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { forbidden, unauthorized } from './errors.js';

export type AppRole = 'CUSTOMER' | 'TECHNICIAN';
export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'SUPPORT';

export interface UserClaims { sub: string; role: AppRole; tid?: string; typ: 'user' }
export interface AdminClaims { sub: string; role: AdminRole; typ: 'admin' }

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { user?: UserClaims; admin?: AdminClaims; rawBody?: Buffer }
  }
}

const ISS = 'myrepairunder100';

export const signUserAccess = (c: Omit<UserClaims, 'typ'>) =>
  jwt.sign({ ...c, typ: 'user' }, env.JWT_ACCESS_SECRET, { expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'], issuer: ISS, audience: 'app' });
export const signAdminAccess = (c: Omit<AdminClaims, 'typ'>) =>
  jwt.sign({ ...c, typ: 'admin' }, env.JWT_ADMIN_SECRET, { expiresIn: '8h', issuer: ISS, audience: 'admin' });

export function verifyUserToken(token: string): UserClaims {
  const c = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: ISS, audience: 'app', algorithms: ['HS256'] }) as UserClaims;
  if (c.typ !== 'user') throw unauthorized();
  return c;
}
function bearer(req: Request) {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7) : null;
}

export function requireUser(...roles: AppRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const t = bearer(req);
    if (!t) return next(unauthorized());
    try {
      const c = verifyUserToken(t);
      if (roles.length && !roles.includes(c.role)) return next(forbidden());
      req.user = c;
      next();
    } catch { next(unauthorized('Session expired. Please log in again.')); }
  };
}
export const requireCustomer = requireUser('CUSTOMER');
export const requireTechnician = requireUser('TECHNICIAN');

/** Role → permissions. SUPPORT is read-mostly and cannot touch money, prices or settings. */
export const PERMISSIONS = {
  'dashboard.view': ['SUPER_ADMIN', 'ADMIN', 'SUPPORT'],
  'bookings.view': ['SUPER_ADMIN', 'ADMIN', 'SUPPORT'],
  'bookings.manage': ['SUPER_ADMIN', 'ADMIN', 'SUPPORT'],
  'bookings.cancel': ['SUPER_ADMIN', 'ADMIN'],
  'customers.view': ['SUPER_ADMIN', 'ADMIN', 'SUPPORT'],
  'customers.manage': ['SUPER_ADMIN', 'ADMIN'],
  'technicians.view': ['SUPER_ADMIN', 'ADMIN', 'SUPPORT'],
  'technicians.manage': ['SUPER_ADMIN', 'ADMIN'],
  'catalog.manage': ['SUPER_ADMIN', 'ADMIN'],
  'areas.manage': ['SUPER_ADMIN', 'ADMIN'],
  'coupons.manage': ['SUPER_ADMIN', 'ADMIN'],
  'wallet.view': ['SUPER_ADMIN', 'ADMIN', 'SUPPORT'],
  'wallet.adjust': ['SUPER_ADMIN', 'ADMIN'],
  'payments.view': ['SUPER_ADMIN', 'ADMIN'],
  'payments.refund': ['SUPER_ADMIN', 'ADMIN'],
  'referrals.manage': ['SUPER_ADMIN', 'ADMIN'],
  'reviews.moderate': ['SUPER_ADMIN', 'ADMIN', 'SUPPORT'],
  'support.manage': ['SUPER_ADMIN', 'ADMIN', 'SUPPORT'],
  'warranty.manage': ['SUPER_ADMIN', 'ADMIN', 'SUPPORT'],
  'notifications.send': ['SUPER_ADMIN', 'ADMIN'],
  'settings.manage': ['SUPER_ADMIN'],
  'admins.manage': ['SUPER_ADMIN'],
  'audit.view': ['SUPER_ADMIN', 'ADMIN'],
  'reports.view': ['SUPER_ADMIN', 'ADMIN'],
} as const satisfies Record<string, readonly AdminRole[]>;
export type Permission = keyof typeof PERMISSIONS;
export const can = (role: AdminRole, p: Permission) => (PERMISSIONS[p] as readonly AdminRole[]).includes(role);

export function requireAdmin(permission?: Permission) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const t = bearer(req);
    if (!t) return next(unauthorized());
    try {
      const c = jwt.verify(t, env.JWT_ADMIN_SECRET, { issuer: ISS, audience: 'admin', algorithms: ['HS256'] }) as AdminClaims;
      if (c.typ !== 'admin') return next(unauthorized());
      if (permission && !can(c.role, permission)) return next(forbidden());
      req.admin = c;
      next();
    } catch { next(unauthorized('Admin session expired.')); }
  };
}
