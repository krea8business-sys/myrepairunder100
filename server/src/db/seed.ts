/**
 * Seed data — clearly marked DEMO. Prices, pincodes and technicians below are placeholders so the
 * product works end-to-end locally. Review every price in Admin → Services before launch.
 * No ratings, reviews, customer counts or statistics are seeded.
 */
import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { db, pool } from './client.js';
import {
  adminUsers, categories, cities, coupons, offers, pincodes, services, settings, subcategories, technicianServiceAreas, technicianSkills,
  technicians, timeSlots, users, zones, servicePriceHistory,
} from './schema.js';
import { referralCodeFor } from '../lib/codes.js';

const isProd = process.env.NODE_ENV === 'production';
const r = (rupees: number) => rupees * 100;

type Svc = { name: string; slug: string; price: number; mrp?: number; mins: number; warranty: number; sub?: string; popular?: boolean; short: string; inc?: string[]; exc?: string[]; kw?: string[]; starting?: boolean };

const CATALOG: { slug: string; name: string; icon: string; short: string; subs: [string, string][]; services: Svc[] }[] = [
  {
    slug: 'ac-repair', name: 'AC Repair', icon: 'ac', short: 'Split & window AC service, repair, gas charging and installation',
    subs: [['split-ac', 'Split AC'], ['window-ac', 'Window AC']],
    services: [
      { name: 'AC Checkup', slug: 'ac-checkup', price: 149, mins: 45, warranty: 0, popular: true, short: 'Technician inspection and diagnosis.', inc: ['Complete inspection of indoor & outdoor unit', 'Diagnosis of the problem', 'Price estimate before any repair'], exc: ['Spare parts', 'Gas refill'], kw: ['not cooling', 'checkup', 'inspection', 'diagnosis', 'problem', 'cooling'] },
      { name: 'AC Jet Service', slug: 'ac-jet-service', price: 349, mrp: 449, mins: 60, warranty: 30, popular: true, short: 'High-pressure jet cleaning of filters, coil and drain.', inc: ['Filter & coil jet wash', 'Drain pipe cleaning', 'Cooling check after service'], exc: ['Gas refill', 'Spare parts'], kw: ['service', 'cleaning', 'jet', 'cooling', 'smell', 'dust'], starting: false },
      { name: 'AC Foam Jet Service', slug: 'ac-foam-jet-service', price: 549, mrp: 649, mins: 75, warranty: 30, short: 'Foam + jet deep cleaning for better cooling.', inc: ['Foam deep clean of coils', 'Jet wash', 'Drain cleaning'], kw: ['foam', 'deep', 'cleaning', 'service'], starting: false },
      { name: 'AC General Service', slug: 'ac-general-service', price: 299, mins: 45, warranty: 15, short: 'Basic cleaning and performance check.', kw: ['service', 'cleaning'], starting: false },
      { name: 'AC Repair', slug: 'ac-repair-visit', price: 199, mins: 60, warranty: 30, short: 'Repair of common AC faults. Parts charged extra with your approval.', kw: ['repair', 'not working', 'starting', 'tripping'] },
      { name: 'AC Gas Charging', slug: 'ac-gas-charging', price: 1999, mins: 90, warranty: 90, popular: true, short: 'Leak check and refrigerant top-up.', inc: ['Leak test', 'Gas top-up', 'Pressure check'], exc: ['Leak repair / brazing if needed'], kw: ['gas', 'refill', 'cooling', 'leak', 'less cooling'] },
      { name: 'AC Cooling Issue', slug: 'ac-cooling-issue', price: 199, mins: 60, warranty: 30, short: 'Diagnosis and fix for poor or no cooling.', kw: ['cooling', 'not cooling', 'less cooling', 'warm air'] },
      { name: 'AC Water Leakage', slug: 'ac-water-leakage', price: 249, mins: 60, warranty: 30, short: 'Fix water dripping from the indoor unit.', kw: ['leakage', 'water', 'dripping'] },
      { name: 'AC Noise/Vibration Issue', slug: 'ac-noise-vibration', price: 249, mins: 60, warranty: 30, short: 'Fix rattling, humming or vibration.', kw: ['noise', 'vibration', 'sound'] },
      { name: 'AC PCB Diagnosis', slug: 'ac-pcb-diagnosis', price: 299, mins: 60, warranty: 0, short: 'Diagnosis of control board / display faults.', kw: ['pcb', 'board', 'display', 'remote', 'starting'] },
      { name: 'AC Installation', slug: 'ac-installation', price: 1199, mins: 120, warranty: 30, popular: true, short: 'Split or window AC installation.', exc: ['Copper pipe beyond standard length', 'Stand / bracket'], kw: ['installation', 'install', 'fitting'], starting: false },
      { name: 'AC Uninstallation', slug: 'ac-uninstallation', price: 599, mins: 60, warranty: 0, popular: true, short: 'Safe removal with gas pump-down.', kw: ['uninstallation', 'remove', 'shift'], starting: false },
    ],
  },
  {
    slug: 'washing-machine-repair', name: 'Washing Machine Repair', icon: 'washer', short: 'Front load, top load and semi-automatic machines',
    subs: [['front-load', 'Front Load Washing Machine'], ['top-load', 'Top Load Washing Machine'], ['semi-automatic', 'Semi Automatic Washing Machine']],
    services: [
      { name: 'Washing Machine Checkup', slug: 'washing-machine-checkup', price: 149, mins: 45, warranty: 0, popular: true, short: 'Technician inspection and diagnosis.', kw: ['checkup', 'diagnosis', 'problem', 'not working'] },
      { name: 'Not Starting', slug: 'wm-not-starting', price: 199, mins: 60, warranty: 30, short: 'Machine does not power on or start a cycle.', kw: ['starting', 'not starting', 'power', 'dead'] },
      { name: 'Not Draining', slug: 'wm-not-draining', price: 249, mins: 60, warranty: 30, short: 'Water stays in the drum after the cycle.', kw: ['draining', 'water', 'drain', 'pump'] },
      { name: 'Not Spinning', slug: 'wm-not-spinning', price: 249, mins: 60, warranty: 30, short: 'Drum does not spin or spins slowly.', kw: ['spinning', 'spin', 'drum'] },
      { name: 'Water Leakage', slug: 'wm-water-leakage', price: 249, mins: 60, warranty: 30, short: 'Water leaking from the machine.', kw: ['leakage', 'water', 'leak'] },
      { name: 'Excessive Noise', slug: 'wm-excessive-noise', price: 249, mins: 60, warranty: 30, short: 'Loud noise or shaking during wash/spin.', kw: ['noise', 'vibration', 'shaking'] },
      { name: 'Door Problem', slug: 'wm-door-problem', price: 199, mins: 45, warranty: 30, short: 'Door lock / latch not working.', kw: ['door', 'lock', 'latch'] },
      { name: 'PCB Problem', slug: 'wm-pcb-problem', price: 349, mins: 60, warranty: 0, short: 'Control board diagnosis and repair.', kw: ['pcb', 'board', 'display', 'error'] },
      { name: 'Motor Problem', slug: 'wm-motor-problem', price: 349, mins: 60, warranty: 0, short: 'Motor diagnosis and repair.', kw: ['motor', 'spinning', 'humming'] },
      { name: 'Installation', slug: 'wm-installation', price: 399, mins: 45, warranty: 0, short: 'New machine installation and demo.', kw: ['installation', 'install'], starting: false },
      { name: 'Uninstallation', slug: 'wm-uninstallation', price: 249, mins: 30, warranty: 0, short: 'Disconnect and remove the machine.', kw: ['uninstallation', 'remove'], starting: false },
    ],
  },
  {
    slug: 'refrigerator-repair', name: 'Refrigerator Repair', icon: 'fridge', short: 'Single door, double door and side-by-side',
    subs: [['single-door', 'Single Door Refrigerator'], ['double-door', 'Double Door Refrigerator'], ['side-by-side', 'Side-by-Side Refrigerator']],
    services: [
      { name: 'Refrigerator Checkup', slug: 'fridge-checkup', price: 149, mins: 45, warranty: 0, popular: true, short: 'Technician inspection and diagnosis.', kw: ['checkup', 'diagnosis', 'problem', 'not cooling', 'cooling'] },
      { name: 'Not Cooling', slug: 'fridge-not-cooling', price: 249, mins: 60, warranty: 30, short: 'Fridge or freezer is not cooling.', kw: ['cooling', 'not cooling', 'warm'] },
      { name: 'Less Cooling', slug: 'fridge-less-cooling', price: 249, mins: 60, warranty: 30, short: 'Cooling is weak or inconsistent.', kw: ['cooling', 'less cooling', 'weak'] },
      { name: 'Ice Formation', slug: 'fridge-ice-formation', price: 249, mins: 60, warranty: 30, short: 'Excess ice / frost build-up.', kw: ['ice', 'frost', 'freezing'] },
      { name: 'Water Leakage', slug: 'fridge-water-leakage', price: 249, mins: 60, warranty: 30, short: 'Water collecting inside or under the fridge.', kw: ['leakage', 'water'] },
      { name: 'Compressor Problem', slug: 'fridge-compressor', price: 349, mins: 60, warranty: 0, short: 'Compressor diagnosis; replacement quoted separately.', kw: ['compressor', 'noise', 'not cooling', 'tripping'] },
      { name: 'Gas Leakage', slug: 'fridge-gas-leakage', price: 349, mins: 60, warranty: 0, short: 'Leak detection; repair & gas refill quoted separately.', kw: ['gas', 'leak', 'refill'] },
      { name: 'Thermostat Problem', slug: 'fridge-thermostat', price: 249, mins: 45, warranty: 30, short: 'Thermostat / temperature control issues.', kw: ['thermostat', 'temperature', 'cooling'] },
      { name: 'Fan Problem', slug: 'fridge-fan', price: 249, mins: 45, warranty: 30, short: 'Fan not running or noisy.', kw: ['fan', 'noise'] },
      { name: 'PCB Problem', slug: 'fridge-pcb', price: 349, mins: 60, warranty: 0, short: 'Control board diagnosis and repair.', kw: ['pcb', 'board', 'display'] },
      { name: 'Door Problem', slug: 'fridge-door', price: 199, mins: 45, warranty: 30, short: 'Door gasket / hinge / alignment issues.', kw: ['door', 'gasket', 'seal'] },
      { name: 'General Repair', slug: 'fridge-general-repair', price: 199, mins: 60, warranty: 30, short: 'Other refrigerator issues.', kw: ['repair', 'general'] },
    ],
  },
  {
    slug: 'microwave-repair', name: 'Microwave Repair', icon: 'microwave', short: 'Solo, grill and convection microwaves',
    subs: [['solo', 'Solo Microwave'], ['grill', 'Grill Microwave'], ['convection', 'Convection Microwave']],
    services: [
      { name: 'Microwave Checkup', slug: 'microwave-checkup', price: 149, mins: 30, warranty: 0, popular: true, short: 'Technician inspection and diagnosis.', kw: ['checkup', 'diagnosis', 'problem', 'not heating'] },
      { name: 'Not Heating', slug: 'microwave-not-heating', price: 249, mins: 45, warranty: 30, short: 'Runs but food does not heat.', kw: ['heating', 'not heating', 'cold'] },
      { name: 'Sparking', slug: 'microwave-sparking', price: 249, mins: 45, warranty: 30, short: 'Sparks inside the cavity.', kw: ['sparking', 'spark', 'burning'] },
      { name: 'Not Starting', slug: 'microwave-not-starting', price: 199, mins: 45, warranty: 30, short: 'No power or does not start.', kw: ['starting', 'not starting', 'dead', 'power'] },
      { name: 'Panel Problem', slug: 'microwave-panel', price: 249, mins: 45, warranty: 30, short: 'Buttons / touch panel not responding.', kw: ['panel', 'buttons', 'touch', 'display'] },
      { name: 'Door Problem', slug: 'microwave-door', price: 199, mins: 30, warranty: 30, short: 'Door latch / switch issues.', kw: ['door', 'latch'] },
      { name: 'Magnetron Problem', slug: 'microwave-magnetron', price: 349, mins: 45, warranty: 0, short: 'Magnetron diagnosis; replacement quoted separately.', kw: ['magnetron', 'heating'] },
      { name: 'PCB Problem', slug: 'microwave-pcb', price: 349, mins: 45, warranty: 0, short: 'Control board diagnosis and repair.', kw: ['pcb', 'board'] },
      { name: 'General Repair', slug: 'microwave-general-repair', price: 199, mins: 45, warranty: 30, popular: true, short: 'Other microwave issues.', kw: ['repair', 'general'] },
    ],
  },
];

const AREAS: { city: string; state: string; zones: { name: string; pins: [string, string][] }[] }[] = [
  { city: 'Delhi', state: 'Delhi', zones: [
    { name: 'North Delhi', pins: [['110084', 'Burari / Sant Nagar'], ['110042', 'Badli / Samaypur'], ['110009', 'Model Town / Mukherjee Nagar'], ['110033', 'Adarsh Nagar / Azadpur'], ['110036', 'Alipur'], ['110054', 'Civil Lines']] },
    { name: 'North West Delhi', pins: [['110085', 'Rohini'], ['110034', 'Pitampura'], ['110088', 'Shalimar Bagh'], ['110052', 'Ashok Vihar']] },
  ] },
  { city: 'Noida', state: 'Uttar Pradesh', zones: [{ name: 'Noida', pins: [['201301', 'Noida Sectors 1–63']] }] },
  { city: 'Gurugram', state: 'Haryana', zones: [{ name: 'Gurugram', pins: [['122001', 'Gurugram City']] }] },
  { city: 'Ghaziabad', state: 'Uttar Pradesh', zones: [{ name: 'Ghaziabad', pins: [['201001', 'Ghaziabad City']] }] },
];

async function ensureAdmin() {
  // First admin: from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD (production) or the local-development default
  const email = process.env.SEED_ADMIN_EMAIL ?? (isProd ? null : 'admin@myrepairunder100.local');
  const password = process.env.SEED_ADMIN_PASSWORD ?? (isProd ? null : 'ChangeMe-Dev-2026');
  if (email && password) {
    await db.insert(adminUsers).values({ email, name: isProd ? 'Owner' : 'Owner (dev)', role: 'SUPER_ADMIN', passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true }).onConflictDoNothing();
    console.log(isProd ? `Created admin ${email}` : `Dev admin: ${email} / ${password}  (must change on first login; never use in production)`);
  } else console.log('Production: set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create the first admin.');
}

async function main() {
  console.log('Seeding DEMO data…');
  // Demo data loads ONCE (first start). After that the owner's edits and deletions in Admin are never overwritten.
  const already = await db.select({ key: settings.key }).from(settings).where(eq(settings.key, 'launch'));
  if (already.length && !process.argv.includes('--force')) {
    console.log('Demo data already loaded earlier — skipping (run with --force to reload missing demo rows).');
    await ensureAdmin();
    return;
  }
  await db.transaction(async (tx) => {
    // settings — company contact fields intentionally left empty for the owner to fill in
    for (const [key, value] of Object.entries({ launch: { demoDataPresent: true } })) {
      await tx.insert(settings).values({ key, value }).onConflictDoNothing();
    }

    for (const [i, s] of [['9 AM - 11 AM', '09:00', '11:00'], ['11 AM - 1 PM', '11:00', '13:00'], ['1 PM - 3 PM', '13:00', '15:00'], ['3 PM - 5 PM', '15:00', '17:00'], ['5 PM - 7 PM', '17:00', '19:00'], ['7 PM - 9 PM', '19:00', '21:00']].entries()) {
      const [ex] = await tx.select().from(timeSlots).where(eq(timeSlots.label, s[0]));
      if (!ex) await tx.insert(timeSlots).values({ label: s[0], startTime: s[1], endTime: s[2], capacity: 10, sortOrder: i });
    }

    for (const a of AREAS) {
      const [c] = await tx.insert(cities).values({ name: a.city, state: a.state }).onConflictDoUpdate({ target: cities.name, set: { state: a.state } }).returning();
      for (const z of a.zones) {
        let [zone] = await tx.insert(zones).values({ cityId: c.id, name: z.name }).onConflictDoNothing().returning();
        if (!zone) [zone] = await tx.select().from(zones).where(sql`${zones.cityId} = ${c.id} AND ${zones.name} = ${z.name}`);
        for (const [pin, area] of z.pins) await tx.insert(pincodes).values({ pincode: pin, cityId: c.id, zoneId: zone.id, area }).onConflictDoNothing();
      }
    }

    const catIds: Record<string, string> = {};
    for (const [ci, c] of CATALOG.entries()) {
      const [cat] = await tx.insert(categories).values({ slug: c.slug, name: c.name, icon: c.icon, shortDescription: c.short, sortOrder: ci,
        seoTitle: `${c.name} in Delhi NCR | MyRepairUnder100`, seoDescription: `Book ${c.name.toLowerCase()} at home in Delhi NCR. Transparent prices, verified technicians.` })
        .onConflictDoUpdate({ target: categories.slug, set: { name: c.name } }).returning();
      catIds[c.slug] = cat.id;
      for (const [si, [slug, name]] of c.subs.entries()) await tx.insert(subcategories).values({ categoryId: cat.id, slug, name, sortOrder: si }).onConflictDoNothing();
      for (const [i, s] of c.services.entries()) {
        const [svc] = await tx.insert(services).values({
          categoryId: cat.id, slug: s.slug, name: s.name, shortDescription: s.short,
          description: `${s.short} Our technician will inspect the appliance and explain the problem before starting work.`,
          includes: s.inc ?? ['Visit by a verified technician', 'Inspection & diagnosis', 'Work as described'],
          excludes: s.exc ?? ['Spare parts (charged separately with your approval)'],
          sparePartsPolicy: 'Spare parts, if required, are charged separately. You will see the part and price in the app and nothing is added without your approval.',
          terms: 'Price shown is for labour. Additional work is quoted in the app before it is done.',
          durationMins: s.mins, warrantyDays: s.warranty, basePrice: r(s.mrp ?? s.price), discountPrice: s.mrp ? r(s.price) : null,
          isStartingPrice: s.starting ?? true, popular: !!s.popular, keywords: s.kw ?? [], sortOrder: i,
        }).onConflictDoNothing().returning();
        if (svc) await tx.insert(servicePriceHistory).values({ serviceId: svc.id, basePrice: svc.basePrice, discountPrice: svc.discountPrice });
      }
    }

    await tx.insert(coupons).values([
      { code: 'WELCOME50', title: '₹50 off your first booking', description: 'DEMO coupon — edit in Admin → Coupons', discountType: 'FLAT', value: r(50), minOrder: r(199), newUsersOnly: true, perUserLimit: 1 },
      { code: 'COOL10', title: '10% off AC services', description: 'DEMO coupon — edit in Admin → Coupons', discountType: 'PERCENT', value: 1000, maxDiscount: r(150), minOrder: r(299), categoryId: catIds['ac-repair'], perUserLimit: 2 },
    ]).onConflictDoNothing();

    const offerCount = await tx.select({ n: sql<number>`count(*)` }).from(offers);
    if (Number(offerCount[0].n) === 0) await tx.insert(offers).values([
      { title: '₹50 off your first repair', subtitle: 'Use code WELCOME50', kind: 'NEW_USER', couponCode: 'WELCOME50', ctaLabel: 'Book now', ctaTarget: 'category:ac-repair', theme: 'orange', sortOrder: 0 },
      { title: '10% off AC services', subtitle: 'Code COOL10 · up to ₹150 off', kind: 'COUPON', couponCode: 'COOL10', ctaLabel: 'View AC services', ctaTarget: 'category:ac-repair', theme: 'blue', sortOrder: 1 },
      { title: 'Refer a friend, earn wallet rewards', subtitle: 'Rewards credited after their first service', kind: 'REFERRAL', ctaLabel: 'Refer now', ctaTarget: 'referral', theme: 'navy', sortOrder: 2 },
    ]);

    // DEMO technicians (fake 9000000xxx numbers). No ratings are seeded.
    const demoTechs = [
      { phone: '+919000000001', name: 'Demo Technician One', cats: ['ac-repair', 'refrigerator-repair'], pins: ['110084', '110042', '110009', '110033', '110036'] },
      { phone: '+919000000002', name: 'Demo Technician Two', cats: ['washing-machine-repair', 'microwave-repair', 'refrigerator-repair'], pins: ['110084', '110042', '110085', '110034'] },
      { phone: '+919000000003', name: 'Demo Technician Three', cats: ['ac-repair', 'washing-machine-repair', 'refrigerator-repair', 'microwave-repair'], pins: ['110084', '110009', '110054', '110088', '110052'] },
    ];
    for (const [i, t] of demoTechs.entries()) {
      let [u] = await tx.select().from(users).where(sql`${users.phone} = ${t.phone} AND ${users.role} = 'TECHNICIAN'`);
      if (!u) [u] = await tx.insert(users).values({ phone: t.phone, name: t.name, role: 'TECHNICIAN', referralCode: referralCodeFor() }).returning();
      const code = `TECH${String(i + 1).padStart(4, '0')}`;
      let [tech] = await tx.insert(technicians).values({ userId: u.id, code, status: 'APPROVED', availability: 'AVAILABLE', approvedAt: new Date(), experienceYears: null }).onConflictDoNothing().returning();
      if (!tech) [tech] = await tx.select().from(technicians).where(eq(technicians.userId, u.id));
      for (const c of t.cats) await tx.insert(technicianSkills).values({ technicianId: tech.id, categoryId: catIds[c] }).onConflictDoNothing();
      for (const p of t.pins) await tx.insert(technicianServiceAreas).values({ technicianId: tech.id, pincode: p }).onConflictDoNothing();
    }
    await tx.execute(sql`INSERT INTO counters (name, value) VALUES ('technician', 3) ON CONFLICT (name) DO UPDATE SET value = GREATEST(counters.value, 3)`);

  });
  await ensureAdmin();
  console.log('✓ seed complete');
}

main().then(() => pool.end()).catch((e) => { console.error(e); pool.end(); process.exit(1); });
