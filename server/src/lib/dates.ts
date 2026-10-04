/** Business operates in IST. Helpers return YYYY-MM-DD and minutes in Asia/Kolkata. */
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
const tfmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
export const istDate = (d = new Date()) => fmt.format(d);
export const istMinutes = (d = new Date()) => { const [h, m] = tfmt.format(d).split(':').map(Number); return h * 60 + m; };
export const hhmmToMinutes = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
export const addDays = (ymd: string, n: number) => { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** Start-of-slot as a real instant (IST = UTC+05:30). */
export const slotStartInstant = (ymd: string, hhmm: string) => new Date(`${ymd}T${hhmm}:00+05:30`);
