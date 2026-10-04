import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { and, eq, inArray } from 'drizzle-orm';
import { env } from '../config/env.js';
import { verifyUserToken, type UserClaims, type AdminClaims } from '../lib/auth.js';
import { db } from '../db/client.js';
import { bookings, technicians } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import { getSettings } from '../modules/settings/settings.service.js';

let io: Server | null = null;

export const TRACKABLE_STATUSES = ['TECHNICIAN_ASSIGNED', 'TECHNICIAN_ON_THE_WAY', 'TECHNICIAN_ARRIVED', 'SERVICE_STARTED'] as const;

export function initRealtime(server: HttpServer, corsOrigins: string[]) {
  io = new Server(server, { cors: { origin: corsOrigins }, pingInterval: 20_000 });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('unauthorized'));
    try {
      if (socket.handshake.auth?.admin) {
        const c = jwt.verify(token, env.JWT_ADMIN_SECRET, { audience: 'admin', issuer: 'myrepairunder100' }) as AdminClaims;
        socket.data.admin = c;
      } else {
        socket.data.user = verifyUserToken(token);
      }
      next();
    } catch { next(new Error('unauthorized')); }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as UserClaims | undefined;
    if (socket.data.admin) socket.join('admins');
    if (user) {
      socket.join(`user:${user.sub}`);
      if (user.tid) socket.join(`tech:${user.tid}`);
    }

    // Subscribe to a booking's live channel — only the booking's customer or assigned technician.
    socket.on('booking:join', async (bookingId: string, ack?: (r: { ok: boolean }) => void) => {
      try {
        if (socket.data.admin) { socket.join(`booking:${bookingId}`); return ack?.({ ok: true }); }
        if (!user) return ack?.({ ok: false });
        const [b] = await db.select({ customerId: bookings.customerId, technicianId: bookings.technicianId }).from(bookings).where(eq(bookings.id, bookingId));
        const allowed = b && (b.customerId === user.sub || (user.tid && b.technicianId === user.tid));
        if (allowed) socket.join(`booking:${bookingId}`);
        ack?.({ ok: !!allowed });
      } catch { ack?.({ ok: false }); }
    });
    socket.on('booking:leave', (bookingId: string) => socket.leave(`booking:${bookingId}`));

    // Technician live location — accepted ONLY while the technician has an active, trackable job.
    socket.on('tech:location', async (p: { lat: number; lng: number }) => {
      if (!user?.tid || typeof p?.lat !== 'number' || typeof p?.lng !== 'number') return;
      if (Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) return;
      try {
        const active = await db.select({ id: bookings.id }).from(bookings)
          .where(and(eq(bookings.technicianId, user.tid), inArray(bookings.status, ['TECHNICIAN_ON_THE_WAY', 'TECHNICIAN_ARRIVED'])));
        if (!active.length) return; // privacy: no tracking outside active travel
        if (!(await getSettings()).features.liveTracking) return;
        await db.update(technicians).set({ lastLat: p.lat, lastLng: p.lng, lastLocationAt: new Date() }).where(eq(technicians.id, user.tid));
        for (const b of active) io!.to(`booking:${b.id}`).emit('tech:location', { bookingId: b.id, lat: p.lat, lng: p.lng, at: Date.now() });
      } catch (e) { logger.error(e, 'tech:location failed'); }
    });
  });
  return io;
}

export function emitToUser(userId: string, event: string, payload: unknown) { io?.to(`user:${userId}`).emit(event, payload); }
export function emitToTech(techId: string, event: string, payload: unknown) { io?.to(`tech:${techId}`).emit(event, payload); }
export function emitToBooking(bookingId: string, event: string, payload: unknown) { io?.to(`booking:${bookingId}`).emit(event, payload); }
export function emitToAdmins(event: string, payload: unknown) { io?.to('admins').emit(event, payload); }
