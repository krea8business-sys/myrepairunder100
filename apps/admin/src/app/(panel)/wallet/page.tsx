'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Badge, Loadable, Pager, useApi } from '@/components/ui';
import { dt, inr } from '@/lib/api';

const SOURCES = ['REFERRAL_REWARD', 'REFERRAL_WELCOME', 'PROMO', 'CASHBACK', 'REFUND', 'BOOKING', 'ADMIN_CREDIT', 'ADMIN_DEBIT', 'EXPIRY'];
export default function Wallet() {
  const [page, setPage] = useState(1); const [source, setSource] = useState('');
  const q = useApi<{ items: any[]; total: number; liability: number }>(`/admin/wallet/transactions?page=${page}${source ? `&source=${source}` : ''}`, [page, source]);
  return <>
    <div className="head"><h1>Wallet</h1><select className="in" style={{ width: 220 }} value={source} onChange={(e) => { setPage(1); setSource(e.target.value); }} aria-label="Source"><option value="">All sources</option>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select></div>
    <div className="alert">To credit or debit a customer’s wallet, open the customer and use <b>Adjust wallet</b>. Every manual adjustment is written to the audit log. Wallet rules are in Settings → Wallet.</div>
    <Loadable q={q}>{(d) => <>
      <div className="grid g4" style={{ marginBottom: 14 }}><div className="card stat"><div className="k">Total wallet liability</div><div className="v">{inr(d.liability)}</div></div></div>
      <div className="tablewrap"><table className="t"><thead><tr><th>Txn ID</th><th>Customer</th><th>Type</th><th>Source</th><th>Amount</th><th>Balance after</th><th>Booking</th><th>Description</th><th>Status</th><th>Date</th></tr></thead><tbody>
        {d.items.map((t) => <tr key={t.id}><td className="mono">{t.id.slice(0, 8)}</td><td><Link href={`/customers/view?id=${t.userId}`}>{t.customerName ?? t.customerPhone}</Link></td><td><Badge s={t.type === 'CREDIT' ? 'PAID' : 'PENDING'} text={t.type} /></td><td className="small">{t.source}</td>
          <td className="b">{t.type === 'CREDIT' ? '+' : '−'}{inr(t.amount)}</td><td>{inr(t.balanceAfter)}</td><td>{t.bookingId ? <Link href={`/bookings/view?id=${t.bookingId}`}>view</Link> : '—'}</td><td className="small">{t.description}{t.createdByAdmin ? ' (admin)' : ''}</td><td><Badge s={t.status} /></td><td className="small">{dt(t.createdAt)}</td></tr>)}
      </tbody></table></div>
      <Pager page={page} total={d.total} limit={25} onPage={setPage} />
    </>}</Loadable>
  </>;
}
