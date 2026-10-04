'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Badge, Empty, Loadable, Modal, Spinner, Tabs, useAction, useApi } from '@/components/ui';
import { api, dt } from '@/lib/api';

function Support() {
  const sp = useSearchParams();
  const [status, setStatus] = useState<'' | 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'>('OPEN');
  const q = useApi<any>(`/admin/tickets${status ? `?status=${status}` : ''}`, [status]);
  const [open, setOpen] = useState<string | null>(sp.get('ticket'));
  return <>
    <div className="head"><h1>Support tickets</h1></div>
    <Tabs value={status} onChange={setStatus} items={[['OPEN', `Open${q.data?.counts.OPEN ? ` (${q.data.counts.OPEN})` : ''}`], ['IN_PROGRESS', 'In progress'], ['RESOLVED', 'Resolved'], ['CLOSED', 'Closed'], ['', 'All']]} />
    <Loadable q={q}>{(d) => !d.items.length ? <Empty>No tickets.</Empty> : <div className="tablewrap"><table className="t"><thead><tr><th>Ticket</th><th>From</th><th>Category</th><th>Subject</th><th>Booking</th><th>Status</th><th>Updated</th></tr></thead><tbody>
      {d.items.map((t: any) => <tr key={t.id} className="click" onClick={() => setOpen(t.id)}><td className="mono b">{t.code}</td><td>{t.userName ?? t.userPhone}<div className="small muted">{t.userRole === 'TECHNICIAN' ? 'Technician' : 'Customer'}</div></td><td>{t.category}</td><td>{t.subject}</td><td>{t.bookingCode ? <span className="mono">{t.bookingCode}</span> : '—'}</td><td><Badge s={t.status} /></td><td className="small">{dt(t.updatedAt)}</td></tr>)}
    </tbody></table></div>}</Loadable>
    <Ticket id={open} onClose={() => { setOpen(null); q.reload(); }} />
  </>;
}
function Ticket({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useApi<any>(id ? `/admin/tickets/${id}` : null, [id]);
  const [msg, setMsg] = useState(''); const [next, setNext] = useState(''); const a = useAction();
  useEffect(() => { setMsg(''); setNext(''); }, [id]);
  return <Modal open={!!id} onClose={onClose} title={q.data ? `${q.data.code} · ${q.data.subject}` : 'Ticket'} wide>
    <Loadable q={q}>{(t) => <>
      <p className="muted small">{t.userName} · {t.userPhone} · {t.category}{t.bookingId ? <> · <Link href={`/bookings/view?id=${t.bookingId}`}>{t.bookingCode}</Link></> : null} · <Badge s={t.status} /></p>
      <div style={{ maxHeight: 340, overflowY: 'auto', display: 'grid', gap: 8, margin: '10px 0' }}>
        {t.messages.map((m: any) => <div key={m.id} style={{ justifySelf: m.authorType === 'ADMIN' ? 'end' : 'start', maxWidth: '80%', background: m.authorType === 'ADMIN' ? 'var(--blue-t)' : '#F3F5F9', padding: 10, borderRadius: 12 }}><div className="small b">{m.authorType === 'ADMIN' ? 'Support' : 'User'}</div>{m.message}<div className="small muted">{dt(m.createdAt)}</div></div>)}
      </div>
      {a.error ? <div className="alert bad">{a.error}</div> : null}
      <textarea className="in" placeholder="Reply to the user (they get a notification)" value={msg} onChange={(e) => setMsg(e.target.value)} aria-label="Reply" />
      <div className="row sp" style={{ marginTop: 8 }}>
        <select className="in" style={{ width: 200 }} value={next} onChange={(e) => setNext(e.target.value)} aria-label="Set status"><option value="">Keep status</option><option value="IN_PROGRESS">In progress</option><option value="RESOLVED">Resolved</option><option value="CLOSED">Closed</option></select>
        <div className="row">
          {next && !msg ? <button className="btn ghost" disabled={a.busy} onClick={() => a.run(async () => { await api(`/admin/tickets/${id}/status`, { body: { status: next } }); q.reload(); })}>Update status</button> : null}
          <button className="btn" disabled={!msg.trim() || a.busy} onClick={() => a.run(async () => { await api(`/admin/tickets/${id}/reply`, { body: { message: msg, status: next || undefined } }); setMsg(''); q.reload(); })}>Send reply</button>
        </div>
      </div>
    </>}</Loadable>
  </Modal>;
}
export default function Page() { return <Suspense fallback={<Spinner />}><Support /></Suspense>; }
