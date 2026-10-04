/** Money helpers — everything is integer paise. */
export const rupees = (r: number) => Math.round(r * 100);
export const pct = (amountPaise: number, bps: number) => Math.round((amountPaise * bps) / 10_000);
export const formatINR = (paise: number) =>
  '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 });
