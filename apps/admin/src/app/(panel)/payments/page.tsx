'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Badge, Loadable, Pager, Tabs, useApi } from '@/components/ui';
import { dt, inr } from '@/lib/api';

export default function Payments() {
  const [status, setStatus] = useState(''); const [page, setPage] = useState(1); const [q2, setQ] = useState('');
  const q = useApi<any>(`/admin/payments?page=${page}${status ? `&status=${status}` : ''}${q2 ? `&q=${q2}` : ''}`, [page, status, q2]);
  return <>
    <div className="head"><h1>Payments & refunds</h1><input className="in" style={{ width: 220 }} placeholder="Booking ID" value={q2} onChange={(e) => { setPage(1); setQ(e.target.value); }} /></div>
    <div className="alert">Payments are marked paid only after server-side verification with the gateway (signed webhook or server-to-server check). Refunds are issued from a booking’s page.</div>
    <Tabs value={status} onChange={(v) => { setPage(1); setStatus(v); }} items={[['', 'All'], ['PENDING', 'Pending'], ['PAID', 'Paid'], ['FAILED', 'Failed'], ['REFUNDED', 'Refunded'], ['PARTIALLY_REFUNDED', 'Partially refunded']]} />
    <Loadable q={q}>{(d) => <>
      <div className="tablewrap"><table className="t"><thead><tr><th>Booking</th><th>Customer</th><th>Purpose</th><th>Gateway</th><th>Method</th><th>Order / payment ID</th><th>Amount</th><th>Refunded</th><th>Status</th><th>Date</th></tr></thead><tbody>
        {d.items.map((p: any) => <tr key={p.id}><td><Link className="mono" href={`/bookings/view?id=${p.bookingId}`}>{p.bookingCode}</Link></td><td>{p.customerName ?? '—'}</td><td>{p.purpose}</td><td>{p.provider}</td><td>{p.method ?? '—'}</td><td className="mono">{p.providerOrderId ?? '—'}<div>{p.providerPaymentId}</div></td><td className="b">{inr(p.amount)}</td><td>{p.refundedAmount ? inr(p.refundedAmount) : '—'}</td><td><Badge s={p.status} />{p.failureReason ? <div className="small muted">{p.failureReason}</div> : null}</td><td className="small">{dt(p.createdAt)}</td></tr>)}
      </tbody></table></div>
      <Pager page={page} total={d.total} limit={25} onPage={setPage} />
      <h2 style={{ marginTop: 22 }}>Recent refunds</h2>
      <div className="tablewrap"><table className="t"><thead><tr><th>Booking</th><th>Amount</th><th>To</th><th>Gateway ref</th><th>Reason</th><th>Status</th><th>Date</th></tr></thead><tbody>
        {d.refunds.map((r: any) => <tr key={r.id}><td><Link className="mono" href={`/bookings/view?id=${r.bookingId}`}>{r.bookingCode}</Link></td><td>{inr(r.amount)}</td><td>{r.destination === 'WALLET' ? 'Wallet' : 'Original method'}</td><td className="mono">{r.providerRefundId ?? '—'}</td><td className="small">{r.reason}</td><td><Badge s={r.status} /></td><td className="small">{dt(r.createdAt)}</td></tr>)}
      </tbody></table></div>
    </>}</Loadable>
  </>;
}
