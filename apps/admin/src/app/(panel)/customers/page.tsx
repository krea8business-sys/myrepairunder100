'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Empty, ErrorBox, Pager, Spinner, useApi } from '@/components/ui';
import { d, inr } from '@/lib/api';

export default function Customers() {
  const router = useRouter();
  const [q, setQ] = useState(''); const [page, setPage] = useState(1);
  const r = useApi<{ items: any[]; total: number; limit: number }>(`/admin/customers?page=${page}&q=${encodeURIComponent(q)}`, [page, q]);
  return <>
    <div className="head"><h1>Customers</h1><input className="in" style={{ width: 280 }} placeholder="Search name, phone or referral code" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} aria-label="Search customers" /></div>
    {r.error ? <ErrorBox message={r.error} onRetry={r.reload} /> : !r.data ? <Spinner /> : !r.data.items.length ? <Empty>No customers found.</Empty> : <>
      <div className="tablewrap"><table className="t"><thead><tr><th>Name</th><th>Phone</th><th>Bookings</th><th>Wallet</th><th>Referral code</th><th>Joined</th><th>Status</th></tr></thead><tbody>
        {r.data.items.map((c) => <tr key={c.id} className="click" onClick={() => router.push(`/customers/view?id=${c.id}`)}><td className="b">{c.name ?? '—'}</td><td>{c.phone}</td><td>{c.bookings}</td><td>{inr(c.walletBalance ?? 0)}</td><td className="mono">{c.referralCode}</td><td>{d(c.createdAt)}</td><td><Badge s={c.status} /></td></tr>)}
      </tbody></table></div>
      <Pager page={page} total={r.data.total} limit={r.data.limit} onPage={setPage} />
    </>}
  </>;
}
