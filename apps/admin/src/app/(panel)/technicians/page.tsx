'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Empty, ErrorBox, Pager, Spinner, Tabs, useApi } from '@/components/ui';
import { can, d } from '@/lib/api';
import { TechForm } from './TechForm';

export default function Technicians() {
  const router = useRouter();
  const [status, setStatus] = useState<'' | 'PENDING' | 'APPROVED' | 'SUSPENDED'>(''); const [q, setQ] = useState(''); const [page, setPage] = useState(1); const [add, setAdd] = useState(false);
  const r = useApi<{ items: any[]; total: number; limit: number }>(`/admin/technicians?page=${page}&q=${encodeURIComponent(q)}${status ? `&status=${status}` : ''}`, [page, q, status]);
  return <>
    <div className="head"><h1>Technicians</h1><div className="row"><input className="in" style={{ width: 240 }} placeholder="Search name, phone, ID" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />{can('technicians.manage') ? <button className="btn" onClick={() => setAdd(true)}>+ Add technician</button> : null}</div></div>
    <Tabs value={status} onChange={(v) => { setPage(1); setStatus(v); }} items={[['', 'All'], ['PENDING', 'Pending approval'], ['APPROVED', 'Approved'], ['SUSPENDED', 'Suspended']]} />
    {r.error ? <ErrorBox message={r.error} onRetry={r.reload} /> : !r.data ? <Spinner /> : !r.data.items.length ? <Empty>No technicians.</Empty> : <>
      <div className="tablewrap"><table className="t"><thead><tr><th>Technician</th><th>Phone</th><th>Skills</th><th>Pincodes</th><th>Status</th><th>Availability</th><th>Active jobs</th><th>Done</th><th>Rating</th><th>Joined</th></tr></thead><tbody>
        {r.data.items.map((t) => <tr key={t.id} className="click" onClick={() => router.push(`/technicians/view?id=${t.id}`)}><td><b>{t.name}</b> <span className="mono muted">{t.code}</span></td><td>{t.phone}</td><td className="small">{t.skills}</td><td>{t.areas}</td><td><Badge s={t.status} /></td><td><Badge s={t.availability} /></td><td>{t.activeJobs}</td><td>{t.completedJobs}</td><td>{t.ratingCount ? `★ ${t.rating.toFixed(1)} (${t.ratingCount})` : '—'}</td><td>{d(t.createdAt)}</td></tr>)}
      </tbody></table></div>
      <Pager page={page} total={r.data.total} limit={r.data.limit} onPage={setPage} />
    </>}
    <TechForm open={add} onClose={() => setAdd(false)} onDone={(id) => router.push(`/technicians/view?id=${id}`)} />
  </>;
}
