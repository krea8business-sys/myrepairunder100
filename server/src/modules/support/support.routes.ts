import { Router } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { bookings, supportTickets, ticketMessages } from '../../db/schema.js';
import { requireUser } from '../../lib/auth.js';
import { parse } from '../../lib/validate.js';
import { notFound } from '../../lib/errors.js';
import { ticketCode } from '../../lib/codes.js';
import { emitToAdmins } from '../../realtime/io.js';
import { getSettings } from '../settings/settings.service.js';

export const supportRouter = Router();
supportRouter.use(requireUser());

/** Admin-managed contact details + FAQ (FAQ copy is generic and policy-neutral; edit in code/CMS). */
supportRouter.get('/info', async (_req, res) => {
  const s = await getSettings();
  res.json({
    phone: s.company.supportPhone, whatsapp: s.company.whatsapp, email: s.company.email,
    faq: [
      { q: 'How is the final price decided?', a: 'You pay the listed price for the services you book. If the technician finds something else is needed, they send you the price in the app and nothing is added unless you approve it.' },
      { q: 'Are spare parts included?', a: 'Spare parts are charged separately where applicable. You will see the part and its price in the app before approving.' },
      { q: 'Can I cancel or reschedule?', a: `Yes, from the booking screen. Cancellation is free until ${Math.round(s.cancellation.freeUntilMinutesBefore / 60)} hours before your slot${s.cancellation.feePaise ? `; after that a fee of ₹${s.cancellation.feePaise / 100} may apply` : ''}.` },
      { q: 'How do I use my wallet balance?', a: 'Turn on "Use wallet" at checkout. Limits per booking are shown on the Wallet screen.' },
      { q: 'What does the warranty cover?', a: 'Warranty applies to the work done and parts replaced by us, for the period shown on your invoice. Raise a warranty request from the booking.' },
    ],
  });
});

supportRouter.get('/tickets', async (req, res) => {
  res.json(await db.select().from(supportTickets).where(eq(supportTickets.userId, req.user!.sub)).orderBy(desc(supportTickets.createdAt)).limit(50));
});

supportRouter.post('/tickets', async (req, res) => {
  const b = parse(z.object({
    category: z.enum(['BOOKING', 'PAYMENT', 'TECHNICIAN', 'WARRANTY', 'REFUND', 'OTHER']),
    subject: z.string().trim().min(3).max(160), message: z.string().trim().min(5).max(2000), bookingId: z.uuid().optional().nullable(),
  }), req.body);
  if (b.bookingId) {
    const [bk] = await db.select({ c: bookings.customerId, t: bookings.technicianId }).from(bookings).where(eq(bookings.id, b.bookingId));
    if (!bk || (bk.c !== req.user!.sub && bk.t !== req.user!.tid)) throw notFound('Booking');
  }
  const t = await db.transaction(async (tx) => {
    const [t] = await tx.insert(supportTickets).values({ code: ticketCode(), userId: req.user!.sub, bookingId: b.bookingId ?? null, category: b.category, subject: b.subject }).returning();
    await tx.insert(ticketMessages).values({ ticketId: t.id, authorType: req.user!.role, authorId: req.user!.sub, message: b.message });
    return t;
  });
  emitToAdmins('ticket:new', { id: t.id, code: t.code });
  res.status(201).json(t);
});

supportRouter.get('/tickets/:id', async (req, res) => {
  const [t] = await db.select().from(supportTickets).where(and(eq(supportTickets.id, (req.params.id as string)), eq(supportTickets.userId, req.user!.sub)));
  if (!t) throw notFound('Ticket');
  const messages = await db.select({ id: ticketMessages.id, authorType: ticketMessages.authorType, message: ticketMessages.message, createdAt: ticketMessages.createdAt }).from(ticketMessages).where(eq(ticketMessages.ticketId, t.id)).orderBy(asc(ticketMessages.createdAt));
  res.json({ ...t, messages });
});

supportRouter.post('/tickets/:id/messages', async (req, res) => {
  const { message } = parse(z.object({ message: z.string().trim().min(1).max(2000) }), req.body);
  const [t] = await db.select().from(supportTickets).where(and(eq(supportTickets.id, (req.params.id as string)), eq(supportTickets.userId, req.user!.sub)));
  if (!t) throw notFound('Ticket');
  const [m] = await db.insert(ticketMessages).values({ ticketId: t.id, authorType: req.user!.role, authorId: req.user!.sub, message }).returning();
  if (t.status === 'RESOLVED' || t.status === 'CLOSED') await db.update(supportTickets).set({ status: 'OPEN' }).where(eq(supportTickets.id, t.id));
  emitToAdmins('ticket:message', { ticketId: t.id });
  res.status(201).json(m);
});
