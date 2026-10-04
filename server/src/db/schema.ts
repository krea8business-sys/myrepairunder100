/**
 * MyRepairUnder100 — relational schema (PostgreSQL, Drizzle ORM).
 *
 * Conventions
 *  - All money is stored as INTEGER PAISE (₹1 = 100). Never floats.
 *  - Percentages are stored as basis points (18% = 1800).
 *  - UUID primary keys; human-readable codes (MRU-XXXXXX) for bookings/tickets.
 *  - created_at / updated_at on every mutable table; deleted_at for soft deletes.
 */
import { sql } from 'drizzle-orm';
import {
  pgTable, pgEnum, uuid, text, varchar, integer, boolean, timestamp, jsonb, date,
  doublePrecision, primaryKey, uniqueIndex, index, check, bigserial,
} from 'drizzle-orm/pg-core';

const ts = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
};
const id = () => uuid('id').primaryKey().defaultRandom();

// ───────────────────────── Enums ─────────────────────────
export const userRole = pgEnum('user_role', ['CUSTOMER', 'TECHNICIAN']);
export const adminRole = pgEnum('admin_role', ['SUPER_ADMIN', 'ADMIN', 'SUPPORT']);
export const userStatus = pgEnum('user_status', ['ACTIVE', 'BLOCKED', 'DELETED']);
export const addressLabel = pgEnum('address_label', ['HOME', 'WORK', 'OTHER']);
export const technicianStatus = pgEnum('technician_status', ['PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED']);
export const availability = pgEnum('technician_availability', ['AVAILABLE', 'BUSY', 'OFFLINE']);
export const bookingStatus = pgEnum('booking_status', [
  'PENDING', 'CONFIRMED', 'TECHNICIAN_ASSIGNED', 'TECHNICIAN_ON_THE_WAY', 'TECHNICIAN_ARRIVED',
  'SERVICE_STARTED', 'SERVICE_COMPLETED', 'PAYMENT_PENDING', 'COMPLETED', 'CANCELLED',
]);
export const paymentStatus = pgEnum('payment_status', ['PENDING', 'PROCESSING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED']);
export const paymentMode = pgEnum('payment_mode', ['PAY_NOW', 'PAY_AFTER_SERVICE']);
export const cancelledBy = pgEnum('cancelled_by', ['CUSTOMER', 'TECHNICIAN', 'ADMIN', 'SYSTEM']);
export const addonKind = pgEnum('addon_kind', ['SERVICE', 'PART']);
export const approvalStatus = pgEnum('approval_status', ['PENDING', 'APPROVED', 'REJECTED']);
export const offerStatus = pgEnum('job_offer_status', ['OFFERED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED']);
export const walletTxnType = pgEnum('wallet_txn_type', ['CREDIT', 'DEBIT']);
export const walletTxnSource = pgEnum('wallet_txn_source', [
  'REFERRAL_REWARD', 'REFERRAL_WELCOME', 'PROMO', 'CASHBACK', 'REFUND', 'BOOKING', 'ADMIN_CREDIT', 'ADMIN_DEBIT', 'EXPIRY', 'REVERSAL',
]);
export const referralStatus = pgEnum('referral_status', ['PENDING', 'REWARDED', 'BLOCKED', 'EXPIRED']);
export const discountType = pgEnum('discount_type', ['PERCENT', 'FLAT']);
export const redemptionStatus = pgEnum('redemption_status', ['RESERVED', 'REDEEMED', 'RELEASED']);
export const ticketStatus = pgEnum('ticket_status', ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']);
export const ticketCategory = pgEnum('ticket_category', ['BOOKING', 'PAYMENT', 'TECHNICIAN', 'WARRANTY', 'REFUND', 'OTHER']);
export const warrantyClaimStatus = pgEnum('warranty_claim_status', ['REQUESTED', 'APPROVED', 'REJECTED', 'RESOLVED']);
export const refundStatus = pgEnum('refund_status', ['PENDING', 'PROCESSED', 'FAILED']);
export const refundDestination = pgEnum('refund_destination', ['WALLET', 'SOURCE']);
export const photoKind = pgEnum('photo_kind', ['BEFORE', 'AFTER', 'OTHER']);
export const docStatus = pgEnum('document_status', ['PENDING', 'VERIFIED', 'REJECTED']);
export const actorType = pgEnum('actor_type', ['CUSTOMER', 'TECHNICIAN', 'ADMIN', 'SYSTEM']);

// ───────────────────────── Identity ─────────────────────────
export const users = pgTable('users', {
  id: id(),
  phone: varchar('phone', { length: 15 }).notNull(), // E.164, +91XXXXXXXXXX
  name: varchar('name', { length: 120 }),
  email: varchar('email', { length: 200 }),
  role: userRole('role').notNull().default('CUSTOMER'),
  status: userStatus('status').notNull().default('ACTIVE'),
  referralCode: varchar('referral_code', { length: 16 }).notNull(),
  /** SHA-256 of the app-generated install id; used only to detect duplicate referral accounts. */
  signupDeviceHash: varchar('signup_device_hash', { length: 64 }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...ts,
}, (t) => [
  uniqueIndex('users_phone_role_uq').on(t.phone, t.role),
  uniqueIndex('users_referral_code_uq').on(t.referralCode),
  index('users_device_idx').on(t.signupDeviceHash),
]);

export const otpRequests = pgTable('otp_requests', {
  id: id(),
  phone: varchar('phone', { length: 15 }).notNull(),
  codeHash: varchar('code_hash', { length: 64 }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  ip: varchar('ip', { length: 64 }),
  createdAt: ts.createdAt,
}, (t) => [index('otp_phone_created_idx').on(t.phone, t.createdAt), index('otp_ip_created_idx').on(t.ip, t.createdAt)]);

export const refreshTokens = pgTable('refresh_tokens', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 64 }).notNull(),
  family: uuid('family').notNull(),
  userAgent: text('user_agent'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: ts.createdAt,
}, (t) => [uniqueIndex('refresh_token_hash_uq').on(t.tokenHash), index('refresh_user_idx').on(t.userId)]);

export const adminUsers = pgTable('admin_users', {
  id: id(),
  email: varchar('email', { length: 200 }).notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  role: adminRole('role').notNull().default('ADMIN'),
  active: boolean('active').notNull().default(true),
  failedLogins: integer('failed_logins').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  ...ts,
}, (t) => [uniqueIndex('admin_email_uq').on(t.email)]);

export const pushTokens = pgTable('push_tokens', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull(),
  platform: varchar('platform', { length: 16 }),
  createdAt: ts.createdAt,
}, (t) => [uniqueIndex('push_token_uq').on(t.token)]);

// ───────────────────────── Geography / serviceability ─────────────────────────
export const cities = pgTable('cities', {
  id: id(),
  name: varchar('name', { length: 80 }).notNull(),
  state: varchar('state', { length: 80 }).notNull(),
  active: boolean('active').notNull().default(true),
  ...ts,
}, (t) => [uniqueIndex('city_name_uq').on(t.name)]);

export const zones = pgTable('zones', {
  id: id(),
  cityId: uuid('city_id').notNull().references(() => cities.id),
  name: varchar('name', { length: 80 }).notNull(),
  active: boolean('active').notNull().default(true),
  ...ts,
}, (t) => [uniqueIndex('zone_city_name_uq').on(t.cityId, t.name)]);

export const pincodes = pgTable('pincodes', {
  pincode: varchar('pincode', { length: 6 }).primaryKey(),
  zoneId: uuid('zone_id').references(() => zones.id),
  cityId: uuid('city_id').notNull().references(() => cities.id),
  area: varchar('area', { length: 120 }),
  active: boolean('active').notNull().default(true),
  ...ts,
});

export const addresses = pgTable('addresses', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  label: addressLabel('label').notNull().default('HOME'),
  contactName: varchar('contact_name', { length: 120 }).notNull(),
  contactPhone: varchar('contact_phone', { length: 15 }).notNull(),
  houseNo: varchar('house_no', { length: 120 }).notNull(),
  street: varchar('street', { length: 200 }),
  landmark: varchar('landmark', { length: 200 }),
  locality: varchar('locality', { length: 120 }),
  city: varchar('city', { length: 80 }).notNull(),
  state: varchar('state', { length: 80 }).notNull(),
  pincode: varchar('pincode', { length: 6 }).notNull(),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  isDefault: boolean('is_default').notNull().default(false),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...ts,
}, (t) => [index('address_user_idx').on(t.userId)]);

// ───────────────────────── Catalog ─────────────────────────
export const categories = pgTable('categories', {
  id: id(),
  slug: varchar('slug', { length: 80 }).notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  shortDescription: varchar('short_description', { length: 240 }),
  icon: varchar('icon', { length: 40 }).notNull().default('wrench'),
  imageUrl: text('image_url'),
  seoTitle: varchar('seo_title', { length: 160 }),
  seoDescription: varchar('seo_description', { length: 320 }),
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...ts,
}, (t) => [uniqueIndex('category_slug_uq').on(t.slug)]);

export const subcategories = pgTable('subcategories', {
  id: id(),
  categoryId: uuid('category_id').notNull().references(() => categories.id),
  slug: varchar('slug', { length: 80 }).notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...ts,
}, (t) => [uniqueIndex('subcategory_cat_slug_uq').on(t.categoryId, t.slug)]);

export const services = pgTable('services', {
  id: id(),
  categoryId: uuid('category_id').notNull().references(() => categories.id),
  subcategoryId: uuid('subcategory_id').references(() => subcategories.id),
  slug: varchar('slug', { length: 120 }).notNull(),
  name: varchar('name', { length: 160 }).notNull(),
  shortDescription: varchar('short_description', { length: 300 }),
  description: text('description'),
  includes: jsonb('includes').$type<string[]>().notNull().default([]),
  excludes: jsonb('excludes').$type<string[]>().notNull().default([]),
  terms: text('terms'),
  sparePartsPolicy: text('spare_parts_policy'),
  durationMins: integer('duration_mins').notNull().default(60),
  warrantyDays: integer('warranty_days').notNull().default(0),
  /** Base (MRP) price in paise. */
  basePrice: integer('base_price').notNull(),
  /** Optional offer price in paise; when set, this is what the customer pays. */
  discountPrice: integer('discount_price'),
  /** true → shown as "Starting at ₹X" (final amount may increase after inspection with customer approval). */
  isStartingPrice: boolean('is_starting_price').notNull().default(true),
  /** Tax override in bps; null → use global tax setting. */
  taxRateBps: integer('tax_rate_bps'),
  maxQuantity: integer('max_quantity').notNull().default(5),
  popular: boolean('popular').notNull().default(false),
  keywords: jsonb('keywords').$type<string[]>().notNull().default([]),
  imageUrl: text('image_url'),
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...ts,
}, (t) => [
  uniqueIndex('service_slug_uq').on(t.slug),
  index('service_category_idx').on(t.categoryId, t.active),
  check('service_price_positive', sql`${t.basePrice} >= 0 AND (${t.discountPrice} IS NULL OR ${t.discountPrice} >= 0)`),
]);

/** Price change history for auditability ("service_prices"). */
export const servicePriceHistory = pgTable('service_price_history', {
  id: id(),
  serviceId: uuid('service_id').notNull().references(() => services.id),
  basePrice: integer('base_price').notNull(),
  discountPrice: integer('discount_price'),
  changedBy: uuid('changed_by'),
  createdAt: ts.createdAt,
}, (t) => [index('price_hist_service_idx').on(t.serviceId)]);

export const timeSlots = pgTable('time_slots', {
  id: id(),
  label: varchar('label', { length: 40 }).notNull(),
  startTime: varchar('start_time', { length: 5 }).notNull(), // HH:MM IST
  endTime: varchar('end_time', { length: 5 }).notNull(),
  capacity: integer('capacity').notNull().default(20),
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  ...ts,
});

export const offers = pgTable('offers', {
  id: id(),
  title: varchar('title', { length: 120 }).notNull(),
  subtitle: varchar('subtitle', { length: 240 }),
  kind: varchar('kind', { length: 24 }).notNull().default('COUPON'), // COUPON | SEASONAL | NEW_USER | REFERRAL | CASHBACK
  couponCode: varchar('coupon_code', { length: 32 }),
  ctaLabel: varchar('cta_label', { length: 40 }),
  ctaTarget: varchar('cta_target', { length: 200 }), // e.g. category:ac-repair | referral
  theme: varchar('theme', { length: 16 }).notNull().default('blue'),
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  ...ts,
});

export const settings = pgTable('settings', {
  key: varchar('key', { length: 64 }).primaryKey(),
  value: jsonb('value').notNull(),
  updatedBy: uuid('updated_by'),
  updatedAt: ts.updatedAt,
});

// ───────────────────────── Cart ─────────────────────────
export const cartItems = pgTable('cart_items', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  serviceId: uuid('service_id').notNull().references(() => services.id),
  quantity: integer('quantity').notNull().default(1),
  ...ts,
}, (t) => [uniqueIndex('cart_user_service_uq').on(t.userId, t.serviceId), check('cart_qty', sql`${t.quantity} > 0`)]);

// ───────────────────────── Technicians ─────────────────────────
export const technicians = pgTable('technicians', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id),
  code: varchar('code', { length: 16 }).notNull(),
  status: technicianStatus('status').notNull().default('PENDING'),
  availability: availability('availability').notNull().default('OFFLINE'),
  photoUrl: text('photo_url'),
  experienceYears: integer('experience_years'),
  bio: text('bio'),
  ratingAvg: doublePrecision('rating_avg').notNull().default(0),
  ratingCount: integer('rating_count').notNull().default(0),
  completedJobs: integer('completed_jobs').notNull().default(0),
  /** Commission the technician earns, bps of service value (configurable per technician). */
  payoutRateBps: integer('payout_rate_bps').notNull().default(7000),
  lastLat: doublePrecision('last_lat'),
  lastLng: doublePrecision('last_lng'),
  lastLocationAt: timestamp('last_location_at', { withTimezone: true }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  ...ts,
}, (t) => [uniqueIndex('tech_user_uq').on(t.userId), uniqueIndex('tech_code_uq').on(t.code), index('tech_status_idx').on(t.status, t.availability)]);

export const technicianSkills = pgTable('technician_skills', {
  technicianId: uuid('technician_id').notNull().references(() => technicians.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').notNull().references(() => categories.id),
}, (t) => [primaryKey({ columns: [t.technicianId, t.categoryId] })]);

export const technicianServiceAreas = pgTable('technician_service_areas', {
  technicianId: uuid('technician_id').notNull().references(() => technicians.id, { onDelete: 'cascade' }),
  pincode: varchar('pincode', { length: 6 }).notNull().references(() => pincodes.pincode),
}, (t) => [primaryKey({ columns: [t.technicianId, t.pincode] }), index('tsa_pincode_idx').on(t.pincode)]);

export const technicianDocuments = pgTable('technician_documents', {
  id: id(),
  technicianId: uuid('technician_id').notNull().references(() => technicians.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 32 }).notNull(), // ID_PROOF | ADDRESS_PROOF | PHOTO | SKILL_CERT
  fileKey: text('file_key').notNull(),
  status: docStatus('status').notNull().default('PENDING'),
  reviewedBy: uuid('reviewed_by'),
  ...ts,
});

// ───────────────────────── Bookings ─────────────────────────
export type AddressSnapshot = {
  contactName: string; contactPhone: string; houseNo: string; street?: string | null; landmark?: string | null;
  locality?: string | null; city: string; state: string; pincode: string; lat?: number | null; lng?: number | null;
};

export const bookings = pgTable('bookings', {
  id: id(),
  code: varchar('code', { length: 16 }).notNull(),
  customerId: uuid('customer_id').notNull().references(() => users.id),
  technicianId: uuid('technician_id').references(() => technicians.id),
  addressId: uuid('address_id').references(() => addresses.id),
  /** Encrypted JSON (AES-256-GCM) of AddressSnapshot — address is PII. */
  addressEnc: text('address_enc').notNull(),
  pincode: varchar('pincode', { length: 6 }).notNull(),
  city: varchar('city', { length: 80 }).notNull(),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  scheduledDate: date('scheduled_date').notNull(),
  slotId: uuid('slot_id').references(() => timeSlots.id),
  slotLabel: varchar('slot_label', { length: 40 }).notNull(),
  isAsap: boolean('is_asap').notNull().default(false),
  problemDescription: text('problem_description'),
  status: bookingStatus('status').notNull().default('PENDING'),
  paymentMode: paymentMode('payment_mode').notNull(),
  paymentStatus: paymentStatus('payment_status').notNull().default('PENDING'),
  // money (paise)
  itemsTotal: integer('items_total').notNull(),
  addonsTotal: integer('addons_total').notNull().default(0),
  couponDiscount: integer('coupon_discount').notNull().default(0),
  walletUsed: integer('wallet_used').notNull().default(0),
  taxTotal: integer('tax_total').notNull().default(0),
  /** true → taxTotal is the tax component already included in prices (shown as 'incl. GST'). */
  taxInclusive: boolean('tax_inclusive').notNull().default(true),
  cancellationFee: integer('cancellation_fee').notNull().default(0),
  grandTotal: integer('grand_total').notNull(), // payable after coupon + wallet, incl. tax and approved add-ons
  amountPaid: integer('amount_paid').notNull().default(0),
  couponId: uuid('coupon_id'),
  needsManualAssignment: boolean('needs_manual_assignment').notNull().default(false),
  assignmentRound: integer('assignment_round').notNull().default(0),
  cancelledBy: cancelledBy('cancelled_by'),
  cancelReason: text('cancel_reason'),
  adminNotes: text('admin_notes'),
  /** 4-digit code the customer shows the technician to start the job (encrypted). */
  startCodeEnc: text('start_code_enc'),
  /** Client-generated id → creating the same booking twice (double tap / retry) is impossible. */
  clientRequestId: varchar('client_request_id', { length: 64 }),
  paymentExpiresAt: timestamp('payment_expires_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  warrantyUntil: date('warranty_until'),
  version: integer('version').notNull().default(0),
  ...ts,
}, (t) => [
  uniqueIndex('booking_code_uq').on(t.code),
  uniqueIndex('booking_client_req_uq').on(t.customerId, t.clientRequestId),
  index('booking_customer_idx').on(t.customerId, t.createdAt),
  index('booking_technician_idx').on(t.technicianId, t.status),
  index('booking_status_date_idx').on(t.status, t.scheduledDate),
  index('booking_pincode_idx').on(t.pincode),
  check('booking_money_nonneg', sql`${t.grandTotal} >= 0 AND ${t.walletUsed} >= 0 AND ${t.amountPaid} >= 0`),
]);

export const bookingItems = pgTable('booking_items', {
  id: id(),
  bookingId: uuid('booking_id').notNull().references(() => bookings.id, { onDelete: 'cascade' }),
  serviceId: uuid('service_id').notNull().references(() => services.id),
  categoryId: uuid('category_id').notNull().references(() => categories.id),
  name: varchar('name', { length: 160 }).notNull(),
  unitPrice: integer('unit_price').notNull(),
  quantity: integer('quantity').notNull(),
  taxRateBps: integer('tax_rate_bps').notNull().default(0),
  discount: integer('discount').notNull().default(0),
  tax: integer('tax').notNull().default(0),
  lineTotal: integer('line_total').notNull(),
  warrantyDays: integer('warranty_days').notNull().default(0),
}, (t) => [index('booking_items_booking_idx').on(t.bookingId)]);

export const bookingAddons = pgTable('booking_addons', {
  id: id(),
  bookingId: uuid('booking_id').notNull().references(() => bookings.id, { onDelete: 'cascade' }),
  kind: addonKind('kind').notNull(),
  serviceId: uuid('service_id').references(() => services.id),
  name: varchar('name', { length: 160 }).notNull(),
  note: text('note'),
  unitPrice: integer('unit_price').notNull(),
  quantity: integer('quantity').notNull().default(1),
  taxRateBps: integer('tax_rate_bps').notNull().default(0),
  tax: integer('tax').notNull().default(0),
  lineTotal: integer('line_total').notNull(),
  warrantyDays: integer('warranty_days').notNull().default(0),
  status: approvalStatus('status').notNull().default('PENDING'),
  requestedBy: uuid('requested_by').notNull(),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  ...ts,
}, (t) => [index('booking_addons_booking_idx').on(t.bookingId), check('addon_price_nonneg', sql`${t.unitPrice} >= 0`)]);

export const bookingStatusHistory = pgTable('booking_status_history', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  bookingId: uuid('booking_id').notNull().references(() => bookings.id, { onDelete: 'cascade' }),
  fromStatus: bookingStatus('from_status'),
  toStatus: bookingStatus('to_status').notNull(),
  actorType: actorType('actor_type').notNull(),
  actorId: uuid('actor_id'),
  note: text('note'),
  createdAt: ts.createdAt,
}, (t) => [index('bsh_booking_idx').on(t.bookingId)]);

export const bookingPhotos = pgTable('booking_photos', {
  id: id(),
  bookingId: uuid('booking_id').notNull().references(() => bookings.id, { onDelete: 'cascade' }),
  kind: photoKind('kind').notNull(),
  fileKey: text('file_key').notNull(),
  uploadedBy: uuid('uploaded_by').notNull(),
  createdAt: ts.createdAt,
}, (t) => [index('booking_photos_booking_idx').on(t.bookingId)]);

export const bookingMessages = pgTable('booking_messages', {
  id: id(),
  bookingId: uuid('booking_id').notNull().references(() => bookings.id, { onDelete: 'cascade' }),
  senderType: actorType('sender_type').notNull(),
  senderId: uuid('sender_id'),
  message: text('message').notNull(),
  createdAt: ts.createdAt,
}, (t) => [index('booking_msg_booking_idx').on(t.bookingId, t.createdAt)]);

/** Offers of a booking to technicians (auto-assignment). Acceptance is atomic on bookings.technician_id. */
export const jobOffers = pgTable('job_offers', {
  id: id(),
  bookingId: uuid('booking_id').notNull().references(() => bookings.id, { onDelete: 'cascade' }),
  technicianId: uuid('technician_id').notNull().references(() => technicians.id),
  status: offerStatus('status').notNull().default('OFFERED'),
  round: integer('round').notNull().default(1),
  score: doublePrecision('score'),
  distanceKm: doublePrecision('distance_km'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  createdAt: ts.createdAt,
}, (t) => [
  uniqueIndex('job_offer_booking_tech_uq').on(t.bookingId, t.technicianId),
  index('job_offer_tech_status_idx').on(t.technicianId, t.status),
  index('job_offer_expiry_idx').on(t.status, t.expiresAt),
]);

// ───────────────────────── Payments ─────────────────────────
export const payments = pgTable('payments', {
  id: id(),
  bookingId: uuid('booking_id').notNull().references(() => bookings.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  purpose: varchar('purpose', { length: 16 }).notNull(), // ADVANCE | FINAL
  provider: varchar('provider', { length: 16 }).notNull(), // razorpay | mock | cash
  providerOrderId: varchar('provider_order_id', { length: 64 }),
  providerPaymentId: varchar('provider_payment_id', { length: 64 }),
  method: varchar('method', { length: 24 }), // upi | card | netbanking | wallet | cash
  amount: integer('amount').notNull(),
  refundedAmount: integer('refunded_amount').notNull().default(0),
  currency: varchar('currency', { length: 3 }).notNull().default('INR'),
  status: paymentStatus('status').notNull().default('PENDING'),
  failureReason: text('failure_reason'),
  collectedBy: uuid('collected_by'), // technician id for cash
  ...ts,
}, (t) => [
  uniqueIndex('payment_provider_order_uq').on(t.providerOrderId),
  index('payment_booking_idx').on(t.bookingId),
  check('payment_amount_pos', sql`${t.amount} > 0`),
]);

/** Raw payment gateway events ("payment_transactions"); event_id unique → webhook replay protection. */
export const paymentEvents = pgTable('payment_events', {
  id: id(),
  paymentId: uuid('payment_id').references(() => payments.id),
  provider: varchar('provider', { length: 16 }).notNull(),
  eventId: varchar('event_id', { length: 128 }).notNull(),
  type: varchar('type', { length: 64 }).notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: ts.createdAt,
}, (t) => [uniqueIndex('payment_event_uq').on(t.provider, t.eventId)]);

export const refunds = pgTable('refunds', {
  id: id(),
  bookingId: uuid('booking_id').notNull().references(() => bookings.id),
  paymentId: uuid('payment_id').references(() => payments.id),
  amount: integer('amount').notNull(),
  destination: refundDestination('destination').notNull(),
  status: refundStatus('status').notNull().default('PENDING'),
  providerRefundId: varchar('provider_refund_id', { length: 64 }),
  reason: text('reason'),
  initiatedBy: uuid('initiated_by'),
  ...ts,
}, (t) => [index('refund_booking_idx').on(t.bookingId)]);

// ───────────────────────── Wallet ─────────────────────────
export const wallets = pgTable('wallets', {
  userId: uuid('user_id').primaryKey().references(() => users.id),
  balance: integer('balance').notNull().default(0),
  ...ts,
}, (t) => [check('wallet_balance_nonneg', sql`${t.balance} >= 0`)]);

export const walletTransactions = pgTable('wallet_transactions', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id),
  type: walletTxnType('type').notNull(),
  source: walletTxnSource('source').notNull(),
  amount: integer('amount').notNull(),
  balanceAfter: integer('balance_after').notNull(),
  /** For credits: unspent portion (FIFO lots). Debits consume earliest-expiring lots first. */
  remaining: integer('remaining').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  bookingId: uuid('booking_id').references(() => bookings.id),
  description: varchar('description', { length: 240 }).notNull(),
  status: varchar('status', { length: 16 }).notNull().default('COMPLETED'),
  /** Unique per logical operation — makes every wallet mutation idempotent (replay-safe). */
  idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
  createdByAdmin: uuid('created_by_admin'),
  createdAt: ts.createdAt,
}, (t) => [
  uniqueIndex('wallet_txn_idem_uq').on(t.idempotencyKey),
  index('wallet_txn_user_idx').on(t.userId, t.createdAt),
  index('wallet_txn_lots_idx').on(t.userId, t.type, t.remaining),
  check('wallet_amount_pos', sql`${t.amount} > 0`),
  check('wallet_remaining_nonneg', sql`${t.remaining} >= 0`),
]);

// ───────────────────────── Referrals / coupons ─────────────────────────
export const referrals = pgTable('referrals', {
  id: id(),
  referrerId: uuid('referrer_id').notNull().references(() => users.id),
  refereeId: uuid('referee_id').notNull().references(() => users.id),
  code: varchar('code', { length: 16 }).notNull(),
  status: referralStatus('status').notNull().default('PENDING'),
  blockReason: varchar('block_reason', { length: 200 }),
  qualifyingBookingId: uuid('qualifying_booking_id'),
  referrerReward: integer('referrer_reward').notNull().default(0),
  refereeReward: integer('referee_reward').notNull().default(0),
  rewardedAt: timestamp('rewarded_at', { withTimezone: true }),
  ...ts,
}, (t) => [uniqueIndex('referral_referee_uq').on(t.refereeId), index('referral_referrer_idx').on(t.referrerId, t.status)]);

export const coupons = pgTable('coupons', {
  id: id(),
  code: varchar('code', { length: 32 }).notNull(),
  title: varchar('title', { length: 120 }).notNull(),
  description: varchar('description', { length: 300 }),
  discountType: discountType('discount_type').notNull(),
  /** PERCENT → bps (1000 = 10%), FLAT → paise */
  value: integer('value').notNull(),
  minOrder: integer('min_order').notNull().default(0),
  maxDiscount: integer('max_discount'),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  usageLimit: integer('usage_limit'),
  perUserLimit: integer('per_user_limit').notNull().default(1),
  usedCount: integer('used_count').notNull().default(0),
  categoryId: uuid('category_id').references(() => categories.id),
  serviceId: uuid('service_id').references(() => services.id),
  newUsersOnly: boolean('new_users_only').notNull().default(false),
  showInOffers: boolean('show_in_offers').notNull().default(true),
  active: boolean('active').notNull().default(true),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...ts,
}, (t) => [uniqueIndex('coupon_code_uq').on(t.code), check('coupon_value_pos', sql`${t.value} > 0`)]);

export const couponRedemptions = pgTable('coupon_redemptions', {
  id: id(),
  couponId: uuid('coupon_id').notNull().references(() => coupons.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  bookingId: uuid('booking_id').notNull().references(() => bookings.id),
  discount: integer('discount').notNull(),
  status: redemptionStatus('status').notNull().default('RESERVED'),
  ...ts,
}, (t) => [uniqueIndex('coupon_redemption_booking_uq').on(t.bookingId), index('coupon_redemption_user_idx').on(t.couponId, t.userId)]);

// ───────────────────────── Engagement / support ─────────────────────────
export const notifications = pgTable('notifications', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 48 }).notNull(),
  title: varchar('title', { length: 160 }).notNull(),
  body: text('body').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: ts.createdAt,
}, (t) => [index('notification_user_idx').on(t.userId, t.createdAt)]);

export const supportTickets = pgTable('support_tickets', {
  id: id(),
  code: varchar('code', { length: 16 }).notNull(),
  userId: uuid('user_id').notNull().references(() => users.id),
  bookingId: uuid('booking_id').references(() => bookings.id),
  category: ticketCategory('category').notNull(),
  subject: varchar('subject', { length: 160 }).notNull(),
  status: ticketStatus('status').notNull().default('OPEN'),
  attachments: jsonb('attachments').$type<string[]>().notNull().default([]),
  assignedAdminId: uuid('assigned_admin_id'),
  ...ts,
}, (t) => [uniqueIndex('ticket_code_uq').on(t.code), index('ticket_user_idx').on(t.userId), index('ticket_status_idx').on(t.status)]);

export const ticketMessages = pgTable('ticket_messages', {
  id: id(),
  ticketId: uuid('ticket_id').notNull().references(() => supportTickets.id, { onDelete: 'cascade' }),
  authorType: actorType('author_type').notNull(),
  authorId: uuid('author_id'),
  message: text('message').notNull(),
  createdAt: ts.createdAt,
}, (t) => [index('ticket_msg_ticket_idx').on(t.ticketId)]);

export const reviews = pgTable('reviews', {
  id: id(),
  bookingId: uuid('booking_id').notNull().references(() => bookings.id),
  customerId: uuid('customer_id').notNull().references(() => users.id),
  technicianId: uuid('technician_id').references(() => technicians.id),
  technicianRating: integer('technician_rating').notNull(),
  serviceRating: integer('service_rating').notNull(),
  comment: text('comment'),
  hidden: boolean('hidden').notNull().default(false),
  ...ts,
}, (t) => [
  uniqueIndex('review_booking_uq').on(t.bookingId),
  check('review_rating_range', sql`${t.technicianRating} BETWEEN 1 AND 5 AND ${t.serviceRating} BETWEEN 1 AND 5`),
]);

export const warrantyClaims = pgTable('warranty_claims', {
  id: id(),
  bookingId: uuid('booking_id').notNull().references(() => bookings.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  description: text('description').notNull(),
  status: warrantyClaimStatus('status').notNull().default('REQUESTED'),
  adminNote: text('admin_note'),
  revisitBookingId: uuid('revisit_booking_id'),
  ...ts,
}, (t) => [index('warranty_booking_idx').on(t.bookingId)]);

export const auditLogs = pgTable('audit_logs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  actorType: actorType('actor_type').notNull(),
  actorId: uuid('actor_id'),
  action: varchar('action', { length: 80 }).notNull(),
  entity: varchar('entity', { length: 48 }).notNull(),
  entityId: varchar('entity_id', { length: 64 }),
  before: jsonb('before'),
  after: jsonb('after'),
  ip: varchar('ip', { length: 64 }),
  createdAt: ts.createdAt,
}, (t) => [index('audit_entity_idx').on(t.entity, t.entityId), index('audit_created_idx').on(t.createdAt)]);

export const analyticsEvents = pgTable('analytics_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id'),
  anonymousId: varchar('anonymous_id', { length: 64 }),
  name: varchar('name', { length: 48 }).notNull(),
  props: jsonb('props').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: ts.createdAt,
}, (t) => [index('analytics_name_created_idx').on(t.name, t.createdAt)]);

/** Sequential counters for human-readable codes. */
export const counters = pgTable('counters', {
  name: varchar('name', { length: 32 }).primaryKey(),
  value: integer('value').notNull().default(0),
});

