/** All amounts from the API are integer paise. */
export const inr = (paise: number | null | undefined) => {
  if (paise == null) return '—';
  const r = paise / 100;
  return '₹' + r.toLocaleString('en-IN', { minimumFractionDigits: r % 1 ? 2 : 0, maximumFractionDigits: 2 });
};
export const minutes = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr${m >= 120 ? 's' : ''}${m % 60 ? ` ${m % 60} min` : ''}`);
export const shortDate = (ymd: string) => new Date(ymd + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
export const dateTime = (iso: string | Date) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
export const relative = (iso: string | Date) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};
export const maskPhone = (p?: string | null) => (p ? p.replace(/^\+91/, '+91 ').replace(/(\d{5})(\d{5})$/, '$1 $2') : '');
