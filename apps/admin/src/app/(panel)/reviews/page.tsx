'use client';
import Link from 'next/link';
import { Badge, Empty, Loadable, useAction, useApi } from '@/components/ui';
import { api, d } from '@/lib/api';

export default function Reviews() {
  const q = useApi<any[]>('/admin/reviews?limit=100'); const a = useAction();
  return <>
    <div className="head"><h1>Reviews</h1></div>
    <div className="alert">Only genuine customer reviews from completed bookings appear here. Hiding a review removes it from the technician’s rating.</div>
    {a.error ? <div className="alert bad">{a.error}</div> : null}
    <Loadable q={q}>{(rows) => !rows.length ? <Empty>No reviews yet.</Empty> : <div className="tablewrap"><table className="t"><thead><tr><th>Booking</th><th>Customer</th><th>Technician</th><th>Technician ★</th><th>Service ★</th><th>Comment</th><th>Date</th><th>Visibility</th></tr></thead><tbody>
      {rows.map((r) => <tr key={r.id}><td><Link className="mono" href={`/bookings/view?id=${r.bookingId}`}>{r.bookingCode}</Link></td><td>{r.customerName}</td><td className="mono">{r.technicianCode}</td><td>{'★'.repeat(r.technicianRating)}</td><td>{'★'.repeat(r.serviceRating)}</td><td style={{ maxWidth: 320 }}>{r.comment ?? <span className="muted">—</span>}</td><td>{d(r.createdAt)}</td>
        <td><button className={`btn sm ${r.hidden ? 'ghost' : 'sec'}`} onClick={() => a.run(async () => { await api(`/admin/reviews/${r.id}/visibility`, { body: { hidden: !r.hidden } }); q.reload(); })}>{r.hidden ? <Badge s="OFFLINE" text="Hidden" /> : 'Visible'}</button></td></tr>)}
    </tbody></table></div>}</Loadable>
  </>;
}
