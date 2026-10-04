import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { categories, services } from '../../db/schema.js';
import { publicService } from './serialize.js';

/**
 * Natural-language problem search: "AC not cooling", "fridge band ho gaya", "washing machine not spinning".
 * Keywords per service are editable in Admin → Services. Results are suggestions only —
 * nothing is ever added to the cart without the customer tapping Add.
 */
const SYNONYMS: Record<string, string> = {
  fridge: 'refrigerator', freezer: 'refrigerator', frige: 'refrigerator', refrigrator: 'refrigerator',
  aircon: 'ac', 'air-conditioner': 'ac', airconditioner: 'ac', split: 'ac', window: 'ac',
  oven: 'microwave', otg: 'microwave',
  washer: 'washing', washingmachine: 'washing', 'w/m': 'washing',
  cooling: 'cooling', cool: 'cooling', thanda: 'cooling', 'thanda nahi': 'cooling',
  spin: 'spinning', spinning: 'spinning', ghoom: 'spinning',
  leak: 'leakage', leaking: 'leakage', paani: 'leakage', dripping: 'leakage',
  noise: 'noise', noisy: 'noise', awaaz: 'noise', vibration: 'noise',
  heat: 'heating', heating: 'heating', garam: 'heating',
  gas: 'gas', refill: 'gas', start: 'starting', starting: 'starting', chalu: 'starting', band: 'starting',
  install: 'installation', installation: 'installation', fitting: 'installation', uninstall: 'uninstallation', remove: 'uninstallation',
  clean: 'service', cleaning: 'service', servicing: 'service', jet: 'jet', foam: 'foam',
  drain: 'draining', draining: 'draining', spark: 'sparking', sparking: 'sparking', ice: 'ice', frost: 'ice',
};
const CATEGORY_HINTS: Record<string, string> = { ac: 'ac-repair', refrigerator: 'refrigerator-repair', microwave: 'microwave-repair', washing: 'washing-machine-repair' };
const STOP = new Set(['is', 'the', 'my', 'a', 'an', 'not', 'nahi', 'hai', 'ho', 'raha', 'rahi', 'gaya', 'problem', 'issue', 'repair', 'machine', 'kar', 'please']);

let cache: { at: number; rows: { s: typeof services.$inferSelect; catSlug: string; text: string }[] } | null = null;
async function index() {
  if (cache && Date.now() - cache.at < 60_000) return cache.rows;
  const rows = await db.select({ s: services, catSlug: categories.slug, catName: categories.name }).from(services)
    .innerJoin(categories, eq(categories.id, services.categoryId))
    .where(and(eq(services.active, true), isNull(services.deletedAt), eq(categories.active, true)));
  const built = rows.map((r) => ({ s: r.s, catSlug: r.catSlug, text: normalize([r.s.name, r.catName, r.s.shortDescription ?? '', ...(r.s.keywords ?? [])].join(' ')).join(' ') }));
  cache = { at: Date.now(), rows: built };
  return built;
}
export const invalidateSearchIndex = () => { cache = null; };

function normalize(q: string): string[] {
  return q.toLowerCase().replace(/[^a-z0-9\s/-]/g, ' ').split(/\s+/).filter(Boolean).map((w) => SYNONYMS[w] ?? w);
}

export async function searchServices(q: string) {
  const terms = normalize(q).filter((t) => !STOP.has(t));
  const rows = await index();
  const catSlug = terms.map((t) => CATEGORY_HINTS[t]).find(Boolean) ?? null;
  const isNegative = /\bnot\b|\bnahi\b|\bno\b|\bband\b|\bproblem\b|\bissue\b|\bkam\b|\bless\b/i.test(q);
  const scored = rows.map((r) => {
    let score = 0;
    for (const t of terms) {
      if (r.text.includes(t)) score += t.length > 3 ? 3 : 2;
      if (r.s.name.toLowerCase().includes(t)) score += 2;
    }
    if (catSlug) score += r.catSlug === catSlug ? 4 : -10;
    // problem-type queries: always surface the low-cost inspection first
    if (isNegative && /checkup|diagnosis|inspection/i.test(r.s.name)) score += 3;
    return { r, score };
  }).filter((x) => x.score > 3).sort((a, b) => b.score - a.score || (a.r.s.discountPrice ?? a.r.s.basePrice) - (b.r.s.discountPrice ?? b.r.s.basePrice));
  return { query: q, categorySlug: catSlug, results: scored.slice(0, 10).map((x) => publicService(x.r.s)) };
}
