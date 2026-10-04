/**
 * Pure pricing engine. The ONLY place money is computed. The client never sends prices —
 * it sends service ids and quantities; prices are loaded from the database and fed here.
 * All amounts are integer paise. Percentages are basis points.
 */
export interface PriceLineInput { serviceId: string; categoryId: string; name: string; unitPrice: number; quantity: number; taxRateBps: number; warrantyDays: number }
export interface PricedLine extends PriceLineInput { gross: number; discount: number; tax: number; lineTotal: number }
export interface CouponRule { id: string; code: string; discountType: 'PERCENT' | 'FLAT'; value: number; maxDiscount: number | null; minOrder: number; categoryId: string | null; serviceId: string | null }
export interface TaxRule { enabled: boolean; mode: 'INCLUSIVE' | 'EXCLUSIVE' }
export interface WalletRule { maxUsePerBookingPaise: number; maxUsePercentBps: number; minBookingValuePaise: number }

export interface Quote {
  lines: PricedLine[];
  itemsTotal: number;        // gross before discount
  couponDiscount: number;
  coupon: { id: string; code: string } | null;
  couponError: string | null;
  taxTotal: number;
  taxInclusive: boolean;
  totalBeforeWallet: number;
  walletUsed: number;
  walletAvailable: number;
  walletNote: string | null;
  grandTotal: number;        // amount payable
}

const pct = (a: number, bps: number) => Math.round((a * bps) / 10_000);

export function couponDiscountFor(coupon: CouponRule, lines: { serviceId: string; categoryId: string; gross: number }[]) {
  const eligible = lines.filter((l) => (!coupon.serviceId || l.serviceId === coupon.serviceId) && (!coupon.categoryId || l.categoryId === coupon.categoryId));
  const eligibleTotal = eligible.reduce((s, l) => s + l.gross, 0);
  if (!eligible.length) return { discount: 0, error: 'This coupon is not valid for the services in your cart.', eligible };
  if (eligibleTotal < coupon.minOrder) return { discount: 0, error: `Add services worth ₹${Math.ceil((coupon.minOrder - eligibleTotal) / 100)} more to use this coupon.`, eligible };
  let d = coupon.discountType === 'PERCENT' ? pct(eligibleTotal, coupon.value) : coupon.value;
  if (coupon.maxDiscount != null) d = Math.min(d, coupon.maxDiscount);
  return { discount: Math.min(d, eligibleTotal), error: null, eligible };
}

export function computeQuote(args: {
  lines: PriceLineInput[]; coupon?: CouponRule | null; couponPreError?: string | null;
  tax: TaxRule; wallet: WalletRule; walletBalance: number; useWallet: boolean;
}): Quote {
  const base = args.lines.map((l) => ({ ...l, gross: l.unitPrice * l.quantity, discount: 0, tax: 0, lineTotal: 0 }));
  const itemsTotal = base.reduce((s, l) => s + l.gross, 0);

  let couponDiscount = 0; let couponError = args.couponPreError ?? null; let coupon: Quote['coupon'] = null;
  if (args.coupon && !couponError) {
    const r = couponDiscountFor(args.coupon, base);
    if (r.error) couponError = r.error;
    else {
      couponDiscount = r.discount; coupon = { id: args.coupon.id, code: args.coupon.code };
      // allocate discount across eligible lines proportionally; remainder to the last eligible line
      const eligibleTotal = r.eligible.reduce((s, l) => s + l.gross, 0);
      let left = couponDiscount;
      r.eligible.forEach((l, i) => {
        const share = i === r.eligible.length - 1 ? left : Math.floor((couponDiscount * l.gross) / eligibleTotal);
        (l as PricedLine).discount = share; left -= share;
      });
    }
  }

  const inclusive = args.tax.mode === 'INCLUSIVE';
  for (const l of base) {
    const net = l.gross - l.discount;
    const rate = args.tax.enabled ? l.taxRateBps : 0;
    l.tax = rate === 0 ? 0 : inclusive ? Math.round((net * rate) / (10_000 + rate)) : pct(net, rate);
    l.lineTotal = inclusive ? net : net + l.tax;
  }
  const taxTotal = base.reduce((s, l) => s + l.tax, 0);
  const totalBeforeWallet = base.reduce((s, l) => s + l.lineTotal, 0);

  let walletUsed = 0; let walletNote: string | null = null;
  if (args.useWallet && args.walletBalance > 0) {
    if (totalBeforeWallet < args.wallet.minBookingValuePaise) walletNote = `Wallet can be used on bookings of ₹${args.wallet.minBookingValuePaise / 100} or more.`;
    else {
      walletUsed = Math.min(args.walletBalance, args.wallet.maxUsePerBookingPaise, pct(totalBeforeWallet, args.wallet.maxUsePercentBps), totalBeforeWallet);
      if (walletUsed < args.walletBalance) walletNote = `Up to ₹${Math.floor(walletUsed / 100)} of wallet balance can be used on this booking.`;
    }
  }
  return {
    lines: base, itemsTotal, couponDiscount, coupon, couponError, taxTotal, taxInclusive: inclusive,
    totalBeforeWallet, walletUsed, walletAvailable: args.walletBalance, walletNote, grandTotal: totalBeforeWallet - walletUsed,
  };
}

/** Price an add-on (technician-requested service or spare part). */
export function priceAddon(unitPrice: number, quantity: number, taxRateBps: number, tax: TaxRule) {
  const gross = unitPrice * quantity;
  const rate = tax.enabled ? taxRateBps : 0;
  const t = rate === 0 ? 0 : tax.mode === 'INCLUSIVE' ? Math.round((gross * rate) / (10_000 + rate)) : pct(gross, rate);
  return { tax: t, lineTotal: tax.mode === 'INCLUSIVE' ? gross : gross + t };
}
