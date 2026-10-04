'use client';
import { useState } from 'react';
import { HBars, Loadable, Tabs, useApi } from '@/components/ui';

const NAMES: Record<string, string> = { app_install: 'App installs', registration: 'Registrations', service_search: 'Service searches', category_click: 'Category clicks', service_view: 'Service views', add_to_cart: 'Add to cart', checkout_started: 'Checkout started', booking_created: 'Bookings created', booking_completed: 'Bookings completed', booking_cancelled: 'Cancellations', payment_success: 'Payment success', payment_failure: 'Payment failures', referral_conversion: 'Referral conversions', wallet_usage: 'Wallet usage' };
export default function Reports() {
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const q = useApi<any>(`/admin/analytics?days=${days}`, [days]);
  return <>
    <div className="head"><h1>Reports & analytics</h1><Tabs value={days} onChange={setDays} items={[['7', '7 days'], ['30', '30 days'], ['90', '90 days']]} /></div>
    <Loadable q={q}>{(d) => <>
      <div className="grid g4">{Object.entries(NAMES).map(([k, l]) => <div key={k} className="card stat"><div className="k">{l}</div><div className="v">{(d.events[k] ?? 0).toLocaleString('en-IN')}</div></div>)}</div>
      <div className="grid g2" style={{ marginTop: 14 }}>
        <div className="card"><h2>Booking funnel</h2><HBars items={d.funnel.map((f: any) => ({ label: f.step, value: f.n }))} />
          <p className="small muted" style={{ marginTop: 10 }}>{d.funnel[0].n ? `View → booking conversion: ${((d.funnel[3].n / d.funnel[0].n) * 100).toFixed(1)}%` : 'Not enough data yet.'}</p></div>
        <div className="card"><h2>Top searches</h2>{d.topSearches.length ? <div className="tablewrap"><table className="t"><thead><tr><th>Search</th><th>Count</th><th>No results</th></tr></thead><tbody>{d.topSearches.map((s: any) => <tr key={s.q}><td>{s.q}</td><td>{s.n}</td><td style={{ color: s.zero ? 'var(--bad)' : undefined }}>{s.zero}</td></tr>)}</tbody></table></div> : <p className="muted">No searches yet.</p>}
          <p className="small muted" style={{ marginTop: 8 }}>Searches with no results are a hint to add keywords to a service (Services → Edit → Search keywords).</p></div>
      </div>
    </>}</Loadable>
  </>;
}
