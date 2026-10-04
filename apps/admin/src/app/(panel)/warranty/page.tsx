'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Badge, Empty, Field, Loadable, Modal, useAction, useApi } from '@/components/ui';
import { api, d, dt } from '@/lib/api';

export default function Warranty() {
  const q = useApi<any[]>('/admin/warranty-claims'); const [sel, setSel] = useState<any | null>(null);
  return <>
    <div className="head"><h1>Warranty requests</h1></div>
    <div className="alert">Warranty period per service is set in Services. Approve to arrange a revisit (create a ₹0 phone booking or assign directly), or reject with a reason.</div>
    <Loadable q={q}>{(rows) => !rows.length ? <Empty>No warranty requests.</Empty> : <div className="tablewrap"><table className="t"><thead><tr><th>Booking</th><th>Customer</th><th>Warranty until</th><th>Problem</th><th>Status</th><th>Raised</th><th /></tr></thead><tbody>
      {rows.map((c) => <tr key={c.id}><td><Link className="mono" href={`/bookings/view?id=${c.bookingId}`}>{c.bookingCode}</Link></td><td>{c.customerName}<div className="small muted">{c.customerPhone}</div></td><td>{d(c.warrantyUntil)}</td><td style={{ maxWidth: 320 }}>{c.description}{c.adminNote ? <div className="small muted">Note: {c.adminNote}</div> : null}</td><td><Badge s={c.status} /></td><td className="small">{dt(c.createdAt)}</td><td>{c.status !== 'RESOLVED' && c.status !== 'REJECTED' ? <button className="btn sm" onClick={() => setSel(c)}>Decide</button> : null}</td></tr>)}
    </tbody></table></div>}</Loadable>
    <Decide c={sel} onClose={() => setSel(null)} onDone={() => { setSel(null); q.reload(); }} />
  </>;
}
function Decide({ c, onClose, onDone }: { c: any | null; onClose: () => void; onDone: () => void }) {
  const [status, setStatus] = useState('APPROVED'); const [note, setNote] = useState(''); const a = useAction();
  return <Modal open={!!c} onClose={onClose} title={`Warranty · ${c?.bookingCode}`}>
    {a.error ? <div className="alert bad">{a.error}</div> : null}
    <Field label="Decision"><select className="in" value={status} onChange={(e) => setStatus(e.target.value)}><option value="APPROVED">Approve — revisit will be arranged</option><option value="REJECTED">Reject — not covered</option><option value="RESOLVED">Resolved</option></select></Field>
    <Field label="Message to customer"><textarea className="in" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    <button className="btn" disabled={note.length < 3 || a.busy} onClick={() => a.run(async () => { await api(`/admin/warranty-claims/${c.id}/decision`, { body: { status, adminNote: note } }); onDone(); })}>Save decision</button>
  </Modal>;
}
