import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { cities, pincodes } from '../../db/schema.js';

export async function checkServiceability(pincode: string) {
  if (!/^\d{6}$/.test(pincode)) return { serviceable: false, pincode, message: 'Enter a valid 6-digit pincode.' };
  const [p] = await db.select({ pincode: pincodes.pincode, area: pincodes.area, active: pincodes.active, city: cities.name, cityActive: cities.active })
    .from(pincodes).innerJoin(cities, eq(cities.id, pincodes.cityId)).where(and(eq(pincodes.pincode, pincode)));
  const ok = !!p && p.active && p.cityActive;
  return {
    serviceable: ok, pincode, area: p?.area ?? null, city: p?.city ?? null,
    message: ok ? 'Service available at your location' : "Sorry, we currently don't service this location.",
  };
}
