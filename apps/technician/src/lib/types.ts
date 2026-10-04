export type JobSummary = { id: string; code: string; status: string; scheduledDate: string; slotLabel: string; isAsap: boolean; services: string; grandTotal: number; amountDue: number; pincode: string; city: string; offer?: { expiresAt: string; distanceKm: number | null } };
export type Addon = { id: string; kind: 'SERVICE' | 'PART'; name: string; note: string | null; unitPrice: number; quantity: number; lineTotal: number; status: 'PENDING' | 'APPROVED' | 'REJECTED' };
export type Job = {
  id: string; code: string; status: string; paymentStatus: string; paymentMode: string; scheduledDate: string; slotLabel: string; isAsap: boolean; problemDescription: string | null; isOffer: boolean;
  address: { contactName?: string; contactPhone?: string; houseNo?: string; street?: string | null; landmark?: string | null; locality?: string | null; city: string; pincode: string };
  customerPhone: string | null; location: { lat: number; lng: number } | null;
  items: { id: string; serviceId: string; name: string; unitPrice: number; quantity: number; lineTotal: number }[]; addons: Addon[];
  bill: { itemsTotal: number; couponDiscount: number; addonsTotal: number; walletUsed: number; grandTotal: number; amountPaid: number; amountDue: number; taxTotal: number };
  photos: { id: string; kind: string; url: string }[]; timeline: { status: string; at: string }[];
};
export type CatalogService = { id: string; name: string; price: number; categoryId: string };
