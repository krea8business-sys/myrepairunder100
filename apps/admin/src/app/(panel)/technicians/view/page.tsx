'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Badge, Field, Loadable, Modal, useAction, useApi, useToast } from '@/components/ui';
import { api, can, d, dt, inr } from '@/lib/api';
import { TechForm } from '../TechForm';

function Technician() {
  const id = useSearchParams().get('id') ?? '';
  const q = useApi<any>(`/admin/technicians/${id}`);
  const [edit, setEdit] = useState(false); const [st, setSt] = useState<null | 'APPROVED' | 'SUSPENDED' | 'REJECTED'>(null);
  const a = useAction(); const t = useToast();
  return <Loadable q={q}>{(x) => <>
    <div className="head">
      <div className="row">
        {x.photoUrl ? <img src={x.photoUrl} alt="" width={56} height={56} style={{ borderRadius: 28, objectFit: 'cover' }} /> : null}
        <div><Link href="/technicians" className="small">← Technicians</Link><h1>{x.name} <span className="mono muted" style={{ fontSize: 14 }}>{x.code}</span></h1><span className="muted">{x.phone}</span></div>
      </div>
      <div className="row"><Badge s={x.status} /><Badge s={x.availability} />
        {can('technicians.manage') ? <>
          <button className="btn sm ghost" onClick={() => setEdit(true)}>Edit skills & areas</button>
          {x.status !== 'APPROVED' ? <button className="btn sm ok" onClick={() => setSt('APPROVED')}>Approve</button> : <button className="btn sm danger" onClick={() => setSt('SUSPENDED')}>Suspend</button>}
          {x.status === 'PENDING' ? <button className="btn sm danger" onClick={() => setSt('REJECTED')}>Reject</button> : null}
        </> : null}
      </div>
    </div>
    {a.error ? <div className="alert bad">{a.error}</div> : null}
    <div className="grid g4">
      <div className="card stat"><div className="k">Completed jobs</div><div className="v">{x.completedJobs}</div></div>
      <div className="card stat"><div className="k">Rating</div><div className="v">{x.rating != null ? `★ ${Number(x.rating).toFixed(1)}` : '—'}</div><div className="small muted">{x.ratingCount} reviews</div></div>
      <div className="card stat"><div className="k">Service value (30d)</div><div className="v">{inr(x.earnings30d.serviceValue)}</div></div>
      <div className="card stat"><div className="k">Est. payout (30d, {x.payoutRateBps / 100}%)</div><div className="v">{inr(x.earnings30d.estimatedPayout)}</div></div>
    </div>
    <div className="grid g3" style={{ marginTop: 14 }}>
      <div className="card"><h2>Skills & areas</h2><p>{x.skills.map((s: any) => <Badge key={s.id} s="x" text={s.name} />)}</p><p className="small">{x.serviceAreas.map((a2: any) => `${a2.pincode}${a2.area ? ` (${a2.area})` : ''}`).join(', ')}</p>
        <h3 style={{ marginTop: 14 }}>Live location</h3>{x.liveLocation ? <p>Travelling to <b>{x.liveLocation.bookingCode}</b> · updated {dt(x.liveLocation.at)} · <a href={`https://www.google.com/maps?q=${x.liveLocation.lat},${x.liveLocation.lng}`} target="_blank" rel="noreferrer">map ↗</a></p> : <p className="muted small">Visible only while the technician is on the way to / at an active job.</p>}</div>
      <div className="card"><h2>Documents</h2>{!x.documents.length ? <p className="muted">No documents uploaded.</p> : x.documents.map((doc: any) => (
        <div key={doc.id} className="row sp" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
          <span><a href={doc.url} target="_blank" rel="noreferrer">{doc.type.replaceAll('_', ' ')}</a><div className="muted small">{d(doc.createdAt)}</div></span>
          <span className="row"><Badge s={doc.status} />{can('technicians.manage') && doc.status === 'PENDING' ? <><button className="btn sm ok" onClick={() => a.run(async () => { await api(`/admin/technicians/${id}/documents/${doc.id}`, { body: { status: 'VERIFIED' } }); q.reload(); })}>Verify</button><button className="btn sm danger" onClick={() => a.run(async () => { await api(`/admin/technicians/${id}/documents/${doc.id}`, { body: { status: 'REJECTED' } }); q.reload(); })}>Reject</button></> : null}</span>
        </div>))}</div>
      <div className="card"><h2>Recent jobs</h2>{x.jobs.slice(0, 12).map((j: any) => <div key={j.id} className="row sp small" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}><Link href={`/bookings/view?id=${j.id}`} className="mono">{j.code}</Link><span>{d(j.scheduledDate)}</span><Badge s={j.status} /></div>)}</div>
    </div>
    <TechForm open={edit} edit={x} onClose={() => setEdit(false)} onDone={() => { setEdit(false); t.toast('Saved'); q.reload(); }} />
    <StatusModal status={st} id={id} onClose={() => setSt(null)} onDone={() => { setSt(null); t.toast('Status updated'); q.reload(); }} />
    {t.node}
  </>}</Loadable>;
}
function StatusModal({ status, id, onClose, onDone }: { status: string | null; id: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState(''); const a = useAction();
  return <Modal open={!!status} onClose={onClose} title={`${status === 'APPROVED' ? 'Approve' : status === 'SUSPENDED' ? 'Suspend' : 'Reject'} technician`}>
    {a.error ? <div className="alert bad">{a.error}</div> : null}
    {status === 'APPROVED' ? <p>Make sure ID and address proofs are verified. Approved technicians can accept jobs immediately.</p> : <p>The technician will be signed out and stop receiving jobs.</p>}
    <Field label="Note (audit log)"><input className="in" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    <div className="row" style={{ justifyContent: 'flex-end' }}><button className={`btn ${status === 'APPROVED' ? 'ok' : 'danger'}`} disabled={a.busy} onClick={() => a.run(async () => { await api(`/admin/technicians/${id}/status`, { body: { status, reason: reason || undefined } }); onDone(); })}>Confirm</button></div>
  </Modal>;
}

export default function Page() { return <Suspense fallback={null}><Technician /></Suspense>; }
