import type { services } from '../../db/schema.js';

export function publicService(s: typeof services.$inferSelect) {
  return {
    id: s.id, slug: s.slug, name: s.name, categoryId: s.categoryId, subcategoryId: s.subcategoryId,
    shortDescription: s.shortDescription, description: s.description, includes: s.includes, excludes: s.excludes,
    terms: s.terms, sparePartsPolicy: s.sparePartsPolicy, durationMins: s.durationMins, warrantyDays: s.warrantyDays,
    price: s.discountPrice ?? s.basePrice, mrp: s.discountPrice != null && s.discountPrice < s.basePrice ? s.basePrice : null,
    isStartingPrice: s.isStartingPrice, maxQuantity: s.maxQuantity, popular: s.popular, imageUrl: s.imageUrl,
  };
}
