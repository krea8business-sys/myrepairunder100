import { asc, eq, desc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  bookingAddons, bookingItems, bookingPhotos, bookingStatusHistory, bookings, payments, refunds, reviews, technicians, users, warrantyClaims, type AddressSnapshot,
} from '../../db/schema.js';
import { decrypt, decryptJson } from '../../lib/crypto.js';
import { storage } from '../../providers/storage.js';
import { TRACKABLE_STATUSES } from '../../realtime/io.js';
import { maskPhone } from '../../lib/phone.js';

type Booking = typeof bookings.$inferSelect;
type Viewer = 'CUSTOMER' | 'TECHNICIAN' | 'ADMIN';

/** One shape for every client, with fields trimmed by who is looking (least privilege). */
export async function bookingDetail(b: Booking, viewer: Viewer) {
  const [items, addons, history, photos, pays, rfs, [review], claims] = await Promise.all([
    db.select().from(bookingItems).where(eq(bookingItems.bookingId, b.id)),
    db.select().from(bookingAddons).where(eq(bookingAddons.bookingId, b.id)).orderBy(asc(bookingAddons.createdAt)),
    db.select().from(bookingStatusHistory).where(eq(bookingStatusHistory.bookingId, b.id)).orderBy(asc(bookingStatusHistory.id)),
    db.select().from(bookingPhotos).where(eq(bookingPhotos.bookingId, b.id)).orderBy(asc(bookingPhotos.createdAt)),
    db.select().from(payments).where(eq(payments.bookingId, b.id)).orderBy(desc(payments.createdAt)),
    db.select().from(refunds).where(eq(refunds.bookingId, b.id)),
    db.select().from(reviews).where(eq(reviews.bookingId, b.id)),
    db.select().from(warrantyClaims).where(eq(warrantyClaims.bookingId, b.id)),
  ]);
  const address = decryptJson<AddressSnapshot>(b.addressEnc);

  let technician = null;
  if (b.technicianId) {
    const [t] = await db.select({ t: technicians, name: users.name, phone: users.phone }).from(technicians).innerJoin(users, eq(users.id, technicians.userId)).where(eq(technicians.id, b.technicianId));
    if (t) {
      const active = (TRACKABLE_STATUSES as readonly string[]).includes(b.status) || b.status === 'PAYMENT_PENDING';
      technician = {
        id: t.t.id, code: t.t.code, name: t.name, photoUrl: t.t.photoUrl, experienceYears: t.t.experienceYears,
        rating: t.t.ratingCount > 0 ? Math.round(t.t.ratingAvg * 10) / 10 : null, ratingCount: t.t.ratingCount, completedJobs: t.t.completedJobs,
        // phone only while the job is active (privacy)
        phone: viewer === 'ADMIN' || active ? t.phone : null,
      };
    }
  }

  // the customer sees the start code only while waiting for the technician to begin
  const showStartCode = viewer === 'CUSTOMER' && b.startCodeEnc && ['TECHNICIAN_ASSIGNED', 'TECHNICIAN_ON_THE_WAY', 'TECHNICIAN_ARRIVED'].includes(b.status);
  const techCanSeeCustomer = viewer !== 'TECHNICIAN' || !['COMPLETED', 'CANCELLED'].includes(b.status) || (b.completedAt && Date.now() - b.completedAt.getTime() < 86400_000);

  return {
    id: b.id, code: b.code, status: b.status, paymentStatus: b.paymentStatus, paymentMode: b.paymentMode,
    scheduledDate: b.scheduledDate, slotLabel: b.slotLabel, isAsap: b.isAsap, problemDescription: b.problemDescription,
    address: techCanSeeCustomer ? address : { city: address.city, pincode: address.pincode, locality: address.locality },
    customerPhone: viewer === 'CUSTOMER' ? undefined : techCanSeeCustomer ? address.contactPhone : maskPhone(address.contactPhone),
    location: b.lat != null && techCanSeeCustomer ? { lat: b.lat, lng: b.lng } : null,
    items: items.map((i) => ({ id: i.id, serviceId: i.serviceId, name: i.name, unitPrice: i.unitPrice, quantity: i.quantity, discount: i.discount, tax: i.tax, lineTotal: i.lineTotal, warrantyDays: i.warrantyDays })),
    addons: addons.map((a) => ({ id: a.id, kind: a.kind, name: a.name, note: a.note, unitPrice: a.unitPrice, quantity: a.quantity, tax: a.tax, lineTotal: a.lineTotal, status: a.status, warrantyDays: a.warrantyDays, createdAt: a.createdAt })),
    bill: {
      itemsTotal: b.itemsTotal, couponDiscount: b.couponDiscount, addonsTotal: b.addonsTotal, taxTotal: b.taxTotal, taxInclusive: b.taxInclusive,
      walletUsed: b.walletUsed, grandTotal: b.grandTotal, amountPaid: b.amountPaid, amountDue: Math.max(0, b.grandTotal - b.amountPaid), cancellationFee: b.cancellationFee,
    },
    technician,
    startCode: showStartCode ? decrypt(b.startCodeEnc!) : undefined,
    timeline: history.map((h) => ({ status: h.toStatus, at: h.createdAt, note: viewer === 'ADMIN' ? h.note : h.note && !h.note.startsWith('Assigned by') ? h.note : null, actor: viewer === 'ADMIN' ? h.actorType : undefined })),
    photos: await Promise.all(photos.map(async (p) => ({ id: p.id, kind: p.kind, url: await storage.signedUrl(p.fileKey), createdAt: p.createdAt }))),
    payments: pays.map((p) => ({ id: p.id, purpose: p.purpose, provider: p.provider, method: p.method, amount: p.amount, refundedAmount: p.refundedAmount, status: p.status, createdAt: p.createdAt })),
    refunds: rfs.map((r) => ({ id: r.id, amount: r.amount, destination: r.destination, status: r.status, createdAt: r.createdAt })),
    review: review ? { technicianRating: review.technicianRating, serviceRating: review.serviceRating, comment: review.comment } : null,
    warranty: { until: b.warrantyUntil, active: !!b.warrantyUntil && b.warrantyUntil >= new Date().toISOString().slice(0, 10), claims: claims.map((c) => ({ id: c.id, status: c.status, description: c.description, adminNote: c.adminNote, createdAt: c.createdAt })) },
    cancelledBy: b.cancelledBy, cancelReason: b.cancelReason, completedAt: b.completedAt, createdAt: b.createdAt,
    canCancel: viewer === 'CUSTOMER' && ['PENDING', 'CONFIRMED', 'TECHNICIAN_ASSIGNED', 'TECHNICIAN_ON_THE_WAY'].includes(b.status),
    canReschedule: viewer === 'CUSTOMER' && ['PENDING', 'CONFIRMED', 'TECHNICIAN_ASSIGNED'].includes(b.status),
    canTrack: (TRACKABLE_STATUSES as readonly string[]).includes(b.status),
    needsManualAssignment: viewer === 'ADMIN' ? b.needsManualAssignment : undefined,
    adminNotes: viewer === 'ADMIN' ? b.adminNotes : undefined,
    paymentExpiresAt: b.paymentExpiresAt,
  };
}

export function bookingSummary(b: Booking & { serviceNames?: string | null; technicianName?: string | null }) {
  return {
    id: b.id, code: b.code, status: b.status, paymentStatus: b.paymentStatus, scheduledDate: b.scheduledDate, slotLabel: b.slotLabel, isAsap: b.isAsap,
    services: b.serviceNames ?? '', technicianName: b.technicianName ?? null, grandTotal: b.grandTotal, amountDue: Math.max(0, b.grandTotal - b.amountPaid),
    pincode: b.pincode, city: b.city, createdAt: b.createdAt, warrantyUntil: b.warrantyUntil,
  };
}
