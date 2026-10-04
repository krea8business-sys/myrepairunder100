'use client';
import Link from 'next/link';
import { BarChart, HBars, Loadable, useApi } from '@/components/ui';
import { inr } from '@/lib/api';

type Dash = {
  metrics: Record<string, number>;
  charts: { byDay: { day: string; bookings: number; revenue: number }[]; topServices: { name: string; count: number; value: number }[]; byLocation: { pincode: string; area: string | null; count: number }[]; technicianPerformance: { code: string; name: string | null; completed: number; rating: number | null; ratingCount: number; released: number }[] };
};
const M: [string, string, 'money'?][] = [
  ['totalBookings', 'Total bookings'], ['todaysBookings', "Today's bookings"], ['pendingBookings', 'Pending bookings'], ['completedBookings', 'Completed'],
  ['cancelledBookings', 'Cancelled'], ['revenue', 'Revenue (collected online + cash)', 'money'], ['walletLiability', 'Wallet liability', 'money'], ['referralRewards', 'Referral rewards issued', 'money'],
  ['activeTechnicians', 'Active technicians'], ['customers', 'Customers'], ['serviceAreas', 'Serviceable pincodes'],
];

export default function Dashboard() {
  const q = useApi<Dash>('/admin/dashboard');
  const settings = useApi<{ launch: { demoDataPresent: boolean } }>('/admin/settings');
  return (
    <>
      <div className="head"><h1>Dashboard</h1><button className="btn ghost sm" onClick={q.reload}>↻ Refresh</button></div>
      {settings.data?.launch.demoDataPresent ? <div className="alert warn"><b>Demo data is loaded.</b> Review prices in Services, pincodes in Service areas, and replace the demo technicians before launch. Clear this banner in Settings → Launch.</div> : null}
      <Loadable q={q}>{(d) => <>
        {d.metrics.needsManualAssignment ? <div className="alert bad row sp"><span><b>{d.metrics.needsManualAssignment}</b> booking(s) need a technician assigned manually.</span><Link className="btn sm" href="/bookings?needsAssignment=true">Assign now</Link></div> : null}
        <div className="grid g4">
          {M.map(([k, l, f]) => <div key={k} className="card stat"><div className="k">{l}</div><div className="v">{f === 'money' ? inr(d.metrics[k]) : d.metrics[k].toLocaleString('en-IN')}</div></div>)}
        </div>
        <div className="grid g2" style={{ marginTop: 14 }}>
          <div className="card"><h2>Bookings by day (14 days)</h2><BarChart data={d.charts.byDay} value="bookings" labelKey="day" /></div>
          <div className="card"><h2>Revenue by day (14 days)</h2><BarChart data={d.charts.byDay} value="revenue" labelKey="day" format={inr} color="var(--orange)" /></div>
          <div className="card"><h2>Top services (30 days)</h2>{d.charts.topServices.length ? <HBars items={d.charts.topServices.map((s) => ({ label: s.name, value: s.count }))} /> : <p className="muted">No bookings yet.</p>}</div>
          <div className="card"><h2>Bookings by location (30 days)</h2>{d.charts.byLocation.length ? <HBars items={d.charts.byLocation.map((s) => ({ label: `${s.pincode}${s.area ? ' · ' + s.area : ''}`, value: s.count }))} /> : <p className="muted">No bookings yet.</p>}</div>
        </div>
        <div className="card" style={{ marginTop: 14 }}>
          <h2>Technician performance</h2>
          <div className="tablewrap"><table className="t"><thead><tr><th>Technician</th><th>Completed jobs</th><th>Rating</th><th>Jobs released</th></tr></thead><tbody>
            {d.charts.technicianPerformance.map((t) => <tr key={t.code}><td><b>{t.name}</b> <span className="muted mono">{t.code}</span></td><td>{t.completed}</td><td>{t.rating != null ? `★ ${t.rating} (${t.ratingCount})` : <span className="muted">No ratings yet</span>}</td><td>{t.released}</td></tr>)}
          </tbody></table></div>
        </div>
      </>}</Loadable>
    </>
  );
}
