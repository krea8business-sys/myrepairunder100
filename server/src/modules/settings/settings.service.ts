import { z } from 'zod';
import { db } from '../../db/client.js';
import { settings } from '../../db/schema.js';
import { sql } from 'drizzle-orm';
import { parse } from '../../lib/validate.js';

/**
 * Every business rule the owner may want to change lives here, editable from Admin → Settings.
 * Values left blank by the business are blank — we never invent contact details or claims.
 */
export const settingsSchema = z.object({
  company: z.object({
    name: z.string().default('MyRepairUnder100'),
    tagline: z.string().default('Reliable Repairs. Right at Your Door.'),
    logoUrl: z.string().nullable().default(null),
    supportPhone: z.string().nullable().default(null),
    whatsapp: z.string().nullable().default(null),
    email: z.string().nullable().default(null),
    address: z.string().nullable().default(null),
    gstin: z.string().nullable().default(null),
    /** Admin-entered stats only. Nothing is displayed until the owner enters real numbers. */
    publicStats: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
  }).prefault({}),
  tax: z.object({
    enabled: z.boolean().default(false),
    defaultRateBps: z.number().int().min(0).max(5000).default(1800),
    label: z.string().default('GST'),
    /** INCLUSIVE: listed prices already contain tax. EXCLUSIVE: tax added at checkout. */
    mode: z.enum(['INCLUSIVE', 'EXCLUSIVE']).default('INCLUSIVE'),
  }).prefault({}),
  booking: z.object({
    advanceDays: z.number().int().min(0).max(60).default(7),
    asapEnabled: z.boolean().default(true),
    asapCutoffHour: z.number().int().min(0).max(23).default(18),
    minLeadMinutes: z.number().int().min(0).default(60),
    workingDays: z.array(z.number().int().min(0).max(6)).default([0, 1, 2, 3, 4, 5, 6]),
    minOrderValue: z.number().int().min(0).default(0),
    requireStartOtp: z.boolean().default(true),
  }).prefault({}),
  payments: z.object({
    payNowEnabled: z.boolean().default(true),
    payAfterServiceEnabled: z.boolean().default(true),
    cashEnabled: z.boolean().default(true),
    methods: z.array(z.enum(['upi', 'card', 'netbanking', 'wallet'])).default(['upi', 'card', 'netbanking', 'wallet']),
  }).prefault({}),
  wallet: z.object({
    maxUsePerBookingPaise: z.number().int().min(0).default(10000),
    maxUsePercentBps: z.number().int().min(0).max(10000).default(5000),
    minBookingValuePaise: z.number().int().min(0).default(19900),
    promoExpiryDays: z.number().int().min(1).default(90),
    cancellationRefundTo: z.enum(['WALLET', 'SOURCE']).default('SOURCE'),
  }).prefault({}),
  referral: z.object({
    enabled: z.boolean().default(true),
    referrerRewardPaise: z.number().int().min(0).default(10000),
    refereeRewardPaise: z.number().int().min(0).default(5000),
    minBookingValuePaise: z.number().int().min(0).default(49900),
    monthlyLimit: z.number().int().min(0).default(10),
    applyWindowDays: z.number().int().min(0).default(7),
    rewardExpiryDays: z.number().int().min(1).default(180),
    blockSameDevice: z.boolean().default(true),
  }).prefault({}),
  cancellation: z.object({
    freeUntilMinutesBefore: z.number().int().min(0).default(120),
    feePaise: z.number().int().min(0).default(4900),
    /** No fee before technician is assigned. */
    freeBeforeAssignment: z.boolean().default(true),
  }).prefault({}),
  assignment: z.object({
    autoAssign: z.boolean().default(true),
    offerBatchSize: z.number().int().min(1).max(20).default(3),
    offerTtlMinutes: z.number().int().min(1).max(120).default(10),
    maxRounds: z.number().int().min(1).max(10).default(3),
    maxJobsPerDay: z.number().int().min(1).default(8),
    maxDistanceKm: z.number().min(1).default(25),
    weights: z.object({ distance: z.number().default(0.5), workload: z.number().default(0.3), rating: z.number().default(0.2) }).prefault({}),
  }).prefault({}),
  tracking: z.object({
    shareFromStatus: z.enum(['TECHNICIAN_ASSIGNED', 'TECHNICIAN_ON_THE_WAY']).default('TECHNICIAN_ON_THE_WAY'),
  }).prefault({}),
  warranty: z.object({
    defaultDays: z.number().int().min(0).default(30),
    claimWindowDays: z.number().int().min(0).default(0),
  }).prefault({}),
  /**
   * App feature switches and editable texts (Admin → Features). The apps read these from GET /v1/config
   * and the server enforces them, so switching one off takes effect everywhere within ~15 seconds.
   */
  features: z.object({
    wallet: z.boolean().default(true),
    coupons: z.boolean().default(true),
    chat: z.boolean().default(true),
    liveTracking: z.boolean().default(true),
    reviews: z.boolean().default(true),
    warrantyClaims: z.boolean().default(true),
    search: z.boolean().default(true),
    offersOnHome: z.boolean().default(true),
    popularOnHome: z.boolean().default(true),
    whyChooseUsOnHome: z.boolean().default(true),
    technicianSelfSignup: z.boolean().default(true),
    searchPlaceholder: z.string().max(60).default('What do you need repaired?'),
    referBannerTitle: z.string().max(80).default('Refer a Friend & Earn Wallet Rewards'),
    whyChooseUs: z.array(z.string().max(60)).max(8).default(['Experienced technicians', 'Transparent pricing', 'Convenient booking', 'Service warranty', 'Verified technicians', 'Delhi NCR service coverage']),
    /** Shown as a thin banner at the top of the customer home screen when not empty (e.g. "Closed on Diwali"). */
    homeNotice: z.string().max(140).default(''),
  }).prefault({}),
  /** Set by the seed script. Admin shows a banner until the owner reviews demo prices/areas and clears it. */
  launch: z.object({ demoDataPresent: z.boolean().default(false) }).prefault({}),
  emergency: z.object({ enabled: z.boolean().default(false), surchargePaise: z.number().int().min(0).default(0) }).prefault({}),
});

export type Settings = z.infer<typeof settingsSchema>;
export type SettingsSection = keyof Settings;

let cache: { at: number; value: Settings } | null = null;
const TTL = 15_000;

export async function getSettings(fresh = false): Promise<Settings> {
  if (!fresh && cache && Date.now() - cache.at < TTL) return cache.value;
  const rows = await db.select().from(settings);
  const raw: Record<string, unknown> = {};
  for (const r of rows) raw[r.key] = r.value;
  const value = settingsSchema.parse(raw);
  cache = { at: Date.now(), value };
  return value;
}

export async function updateSettingsSection(section: SettingsSection, patch: unknown, adminId: string) {
  const current = await getSettings(true);
  const merged = { ...current[section], ...(patch as object) };
  const validated = parse(settingsSchema.shape[section], merged) as Settings[typeof section];
  await db.insert(settings).values({ key: section, value: validated, updatedBy: adminId })
    .onConflictDoUpdate({ target: settings.key, set: { value: validated, updatedBy: adminId, updatedAt: sql`now()` } });
  cache = null;
  return { before: current[section], after: validated };
}

export const invalidateSettings = () => { cache = null; };
