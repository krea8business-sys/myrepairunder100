'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Badge, Field, Loadable, Modal, useAction, useApi, useToast } from '@/components/ui';
import { API_URL, api, can, d, dt, inr, label, openPdf, session } from '@/lib/api';
import { io } from 'socket.io-client';

type B = any; // full shape documented in server/src/modules/bookings/booking.view.ts

function BookingDetail() {
  const id = useSearchParams().get('id') ?? '';
  const q = useApi<B>(`/admin/bookings/${id}`);
  const t = useToast();
  const [modal, setModal] = useState<null | 'assign' | 'cancel' | 'reschedule' | 'refund'>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const a = useAction();

  // live updates for this booking
  useEffect(() => {
    const s = io(API_URL || undefined, { auth: { token: session.get()?.accessToken, admin: true }, transports: ['websocket'] });
    s.emit('booking:join', id);
    s.on('booking:update', () => q.reload()); s.on('tech:location', () => q.reload());
    return () => { s.disconnect(); };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Loadable q={q}>{(b) => (
      <>
        <div className="head">
          <div><Link href="/bookings" className="small">← Bookings</Link><h1 className="mono" style={{ fontSize: 22 }}>{b.code}</h1></div>
          <div className="row wrap">
            <Badge s={b.status} /><Badge s={b.paymentStatus} />
            {['CONFIRMED', 'TECHNICIAN_ASSIGNED', 'TECHNICIAN_ON_THE_WAY'].includes(b.status) ? <button className="btn sm" onClick={() => setModal('assign')}>{b.technician ? 'Reassign' : 'Assign technician'}</button> : null}
            {b.status === 'CONFIRMED' && b.needsManualAssignment ? <button className="btn sm sec" onClick={() => a.run(async () => { await api(`/admin/bookings/${id}/auto-assign`, { body: {} }); t.toast('Auto-assignment restarted'); q.reload(); })}>Retry auto-assign</button> : null}
            {['PENDING', 'CONFIRMED', 'TECHNICIAN_ASSIGNED'].includes(b.status) ? <button className="btn sm ghost" onClick={() => setModal('reschedule')}>Reschedule</button> : null}
            {can('payments.refund') && b.bill.amountPaid > 0 ? <button className="btn sm ghost" onClick={() => setModal('refund')}>Refund</button> : null}
            {can('bookings.cancel') && ['PENDING', 'CONFIRMED', 'TECHNICIAN_ASSIGNED', 'TECHNICIAN_ON_THE_WAY', 'TECHNICIAN_ARRIVED'].includes(b.status) ? <button className="btn sm danger" onClick={() => setModal('cancel')}>Cancel</button> : null}
            {b.status !== 'CANCELLED' ? <button className="btn sm ghost" onClick={() => openPdf(`/admin/bookings/${id}/invoice.pdf`)}>Invoice PDF</button> : null}
          </div>
        </div>
        {a.error ? <div className="alert bad">{a.error}</div> : null}
        {b.needsManualAssignment && b.status === 'CONFIRMED' ? <div className="alert bad">Automatic assignment found no available technician. Assign one manually.</div> : null}
        <div className="grid g3">
          <div className="card">
            <h2>Customer & address</h2>
            <dl className="kv">
              <dt>Customer</dt><dd><Link href={`/customers/view?id=${b.customer.id}`}>{b.customer.name ?? '—'}</Link></dd>
              <dt>Phone</dt><dd>{b.customer.phone}</dd>
              <dt>Contact at site</dt><dd>{b.address.contactName} · {b.address.contactPhone}</dd>
              <dt>Address</dt><dd>{[b.address.houseNo, b.address.street, b.address.locality, b.address.city, b.address.pincode].filter(Boolean).join(', ')}{b.address.landmark ? <div className="muted small">Landmark: {b.address.landmark}</div> : null}</dd>
              <dt>When</dt><dd>{b.isAsap ? 'ASAP' : `${d(b.scheduledDate)}, ${b.slotLabel}`}</dd>
              <dt>Problem</dt><dd>{b.problemDescription ?? '—'}</dd>
            </dl>
          </div>
          <div className="card">
            <h2>Technician</h2>
            {b.technician ? <dl className="kv">
              <dt>Name</dt><dd><Link href={`/technicians/view?id=${b.technician.id}`}>{b.technician.name}</Link> <span className="mono muted">{b.technician.code}</span></dd>
              <dt>Phone</dt><dd>{b.technician.phone}</dd>
              <dt>Rating</dt><dd>{b.technician.rating != null ? `★ ${b.technician.rating} (${b.technician.ratingCount})` : 'No ratings yet'}</dd>
              <dt>Live location</dt><dd>{b.technicianLocation ? <a href={`https://www.google.com/maps?q=${b.technicianLocation.lat},${b.technicianLocation.lng}`} target="_blank" rel="noreferrer">View on map ↗</a> : <span className="muted">Only during travel to an active job</span>}</dd>
            </dl> : <p className="muted">Not assigned yet.</p>}
          </div>
          <div className="card">
            <h2>Bill</h2>
            <dl className="kv">
              {b.items.map((i: any) => <><dt key={i.id + 'k'}>{i.name}{i.quantity > 1 ? ` ×${i.quantity}` : ''}</dt><dd key={i.id}>{inr(i.unitPrice * i.quantity)}</dd></>)}
              {b.addons.map((x: any) => <><dt key={x.id + 'k'}>{x.kind === 'PART' ? 'Part' : 'Add-on'}: {x.name}</dt><dd key={x.id}>{inr(x.lineTotal)} <Badge s={x.status} /></dd></>)}
              {b.bill.couponDiscount ? <><dt>Coupon</dt><dd>−{inr(b.bill.couponDiscount)}</dd></> : null}
              {b.bill.taxTotal ? <><dt>Tax{b.bill.taxInclusive ? ' (incl.)' : ''}</dt><dd>{inr(b.bill.taxTotal)}</dd></> : null}
              {b.bill.walletUsed ? <><dt>Wallet</dt><dd>−{inr(b.bill.walletUsed)}</dd></> : null}
              <dt className="b">Total</dt><dd>{inr(b.bill.grandTotal)}</dd>
              <dt>Paid</dt><dd>{inr(b.bill.amountPaid)}</dd>
              {b.bill.amountDue ? <><dt>Due</dt><dd style={{ color: 'var(--warn)' }}>{inr(b.bill.amountDue)}</dd></> : null}
              {b.bill.cancellationFee ? <><dt>Cancellation fee</dt><dd>{inr(b.bill.cancellationFee)}</dd></> : null}
              <dt>Warranty</dt><dd>{b.warranty.until ? `until ${d(b.warranty.until)}` : '—'}</dd>
            </dl>
          </div>
        </div>
        <div className="grid g3" style={{ marginTop: 14 }}>
          <div className="card"><h2>Service history</h2><div className="timeline">{b.timeline.map((h: any, i: number) => <div key={i}><b>{label(h.status)}</b> <span className="muted small">· {h.actor} · {dt(h.at)}</span>{h.note ? <div className="small muted">{h.note}</div> : null}</div>)}</div></div>
          <div className="card"><h2>Payments & refunds</h2>
            {b.payments.length ? b.payments.map((p: any) => <div key={p.id} className="row sp" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}><span>{p.purpose} · {p.provider}{p.method ? ` / ${p.method}` : ''}<div className="muted small">{dt(p.createdAt)}</div></span><span>{inr(p.amount)} <Badge s={p.status} /></span></div>) : <p className="muted">No payments yet.</p>}
            {b.refunds.map((r: any) => <div key={r.id} className="row sp small" style={{ paddingTop: 6 }}><span>Refund → {r.destination.toLowerCase()}</span><span>{inr(r.amount)} <Badge s={r.status} /></span></div>)}
          </div>
          <div className="card"><h2>Admin notes</h2>
            <textarea className="in" value={notes ?? b.adminNotes ?? ''} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes (not visible to customer)" aria-label="Admin notes" />
            <button className="btn sm" style={{ marginTop: 8 }} disabled={notes == null || a.busy} onClick={() => a.run(async () => { await api(`/admin/bookings/${id}`, { method: 'PATCH', body: { adminNotes: notes } }); setNotes(null); t.toast('Notes saved'); q.reload(); })}>Save notes</button>
            {b.photos.length ? <><h3 style={{ marginTop: 16 }}>Photos</h3><div className="row wrap">{b.photos.map((p: any) => <a key={p.id} href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt={p.kind} width={80} height={80} style={{ objectFit: 'cover', borderRadius: 8 }} /></a>)}</div></> : null}
            {b.review ? <><h3 style={{ marginTop: 16 }}>Review</h3><p>★ {b.review.technicianRating} technician · ★ {b.review.serviceRating} service<br /><span className="muted">{b.review.comment}</span></p></> : null}
          </div>
        </div>
        <AssignModal open={modal === 'assign'} id={id} onClose={() => setModal(null)} onDone={() => { setModal(null); t.toast('Technician assigned'); q.reload(); }} />
        <CancelModal open={modal === 'cancel'} id={id} onClose={() => setModal(null)} onDone={() => { setModal(null); t.toast('Booking cancelled'); q.reload(); }} />
        <RescheduleModal open={modal === 'reschedule'} id={id} onClose={() => setModal(null)} onDone={() => { setModal(null); t.toast('Rescheduled'); q.reload(); }} />
        <RefundModal open={modal === 'refund'} id={id} max={b.bill.amountPaid} onClose={() => setModal(null)} onDone={() => { setModal(null); t.toast('Refund initiated'); q.reload(); }} />
        {t.node}
      </>
    )}</Loadable>
  );
}

function AssignModal({ open, id, onClose, onDone }: { open: boolean; id: string; onClose: () => void; onDone: () => void }) {
  const q = useApi<any[]>(open ? `/admin/bookings/${id}/eligible-technicians` : null, [open]);
  const a = useAction();
  return <Modal open={open} onClose={onClose} title="Assign technician" wide>
    {a.error ? <div className="alert bad">{a.error}</div> : null}
    <Loadable q={q}>{(rows) => <div className="tablewrap"><table className="t"><thead><tr><th>Technician</th><th>Availability</th><th>Serves pincode</th><th>Skills</th><th>Jobs that day</th><th /></tr></thead><tbody>
      {rows.map((r) => <tr key={r.id}><td><b>{r.name}</b> <span className="mono muted">{r.code}</span></td><td><Badge s={r.availability} /></td><td>{r.servesPincode ? '✓' : <span className="muted">No</span>}</td><td>{r.skillsOk ? '✓' : <span className="muted">Partial</span>}</td><td>{r.load}</td>
        <td><button className="btn sm" disabled={a.busy} onClick={() => a.run(async () => { await api(`/admin/bookings/${id}/assign`, { body: { technicianId: r.id } }); onDone(); })}>Assign</button></td></tr>)}
    </tbody></table></div>}</Loadable>
  </Modal>;
}
function CancelModal({ open, id, onClose, onDone }: { open: boolean; id: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState(''); const [waive, setWaive] = useState(true); const a = useAction();
  return <Modal open={open} onClose={onClose} title="Cancel booking">
    {a.error ? <div className="alert bad">{a.error}</div> : null}
    <Field label="Reason (shared with customer)"><textarea className="in" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    <label className="chk"><input type="checkbox" checked={waive} onChange={(e) => setWaive(e.target.checked)} />Waive cancellation fee (full refund of paid + wallet amounts)</label>
    <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn ghost" onClick={onClose}>Back</button><button className="btn danger" disabled={reason.length < 3 || a.busy} onClick={() => a.run(async () => { await api(`/admin/bookings/${id}/cancel`, { body: { reason, waiveFee: waive } }); onDone(); })}>Cancel booking</button></div>
  </Modal>;
}
function RescheduleModal({ open, id, onClose, onDone }: { open: boolean; id: string; onClose: () => void; onDone: () => void }) {
  const slots = useApi<{ id: string; label: string; active: boolean }[]>(open ? '/admin/slots' : null, [open]);
  const [date, setDate] = useState(''); const [slotId, setSlot] = useState(''); const a = useAction();
  return <Modal open={open} onClose={onClose} title="Reschedule">
    {a.error ? <div className="alert bad">{a.error}</div> : null}
    <Field label="Date"><input className="in" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
    <Field label="Slot"><select className="in" value={slotId} onChange={(e) => setSlot(e.target.value)}><option value="">Select…</option>{slots.data?.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field>
    <p className="muted small">The current technician is released and assignment re-runs for the new time.</p>
    <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" disabled={!date || !slotId || a.busy} onClick={() => a.run(async () => { await api(`/admin/bookings/${id}/reschedule`, { body: { date, slotId } }); onDone(); })}>Reschedule</button></div>
  </Modal>;
}
function RefundModal({ open, id, max, onClose, onDone }: { open: boolean; id: string; max: number; onClose: () => void; onDone: () => void }) {
  const [amt, setAmt] = useState(''); const [dest, setDest] = useState<'SOURCE' | 'WALLET'>('SOURCE'); const [reason, setReason] = useState(''); const a = useAction();
  return <Modal open={open} onClose={onClose} title="Refund">
    {a.error ? <div className="alert bad">{a.error}</div> : null}
    <Field label={`Amount in ₹ (max ${inr(max)})`}><input className="in" type="number" min={1} max={max / 100} value={amt} onChange={(e) => setAmt(e.target.value)} /></Field>
    <Field label="Refund to"><select className="in" value={dest} onChange={(e) => setDest(e.target.value as 'SOURCE')}><option value="SOURCE">Original payment method</option><option value="WALLET">Customer wallet (instant)</option></select></Field>
    <Field label="Reason"><input className="in" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" disabled={!Number(amt) || reason.length < 3 || a.busy} onClick={() => a.run(async () => { await api(`/admin/bookings/${id}/refund`, { body: { amount: Math.round(Number(amt) * 100), destination: dest, reason } }); onDone(); })}>Issue refund</button></div>
  </Modal>;
}

export default function Page() { return <Suspense fallback={null}><BookingDetail /></Suspense>; }
