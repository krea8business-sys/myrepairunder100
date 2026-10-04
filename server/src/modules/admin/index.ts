import { Router } from 'express';
import { adminDashboardRouter } from './dashboard.js';
import { adminBookingsRouter } from './bookings.js';
import { adminCatalogRouter } from './catalog.js';
import { adminPeopleRouter } from './people.js';
import { adminMoneyRouter } from './money.js';
import { adminOpsRouter } from './ops.js';

/** Every admin route is guarded by requireAdmin(permission) — see lib/auth.ts PERMISSIONS. */
export const adminRouter = Router();
adminRouter.use(adminDashboardRouter, adminBookingsRouter, adminCatalogRouter, adminPeopleRouter, adminMoneyRouter, adminOpsRouter);
