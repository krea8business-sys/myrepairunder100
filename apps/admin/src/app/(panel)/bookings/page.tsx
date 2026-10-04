'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Badge, Empty, Field, Modal, Pager, Spinner, ErrorBox, useAction, useApi, useToast } from '@/components/ui';
import { api, d, inr } from '@/lib/api';

type Row = { id: string; code: string; status: string; paymentStatus: string; paymentMode: string; scheduledDate: string; slotLabel: string; isAsap: boolean; services: string; technicianName: string | null; technicianCode: string | null; grandTotal: number; pincode: string; city: string; customerName: string | null; customerPhone: string; needsManualAssignment: boolean; createdAt: string };
const STATUSES = ['PENDING', 'CONFIRMED', 'TECHNICIAN_ASSIGNED', 'TECHNICIAN_ON_THE_WAY', 'TECHNICIAN_ARRIVED', 'SERVICE_STARTED', 'SERVICE_COMPLETED', 'PAYMENT_PENDING', 'COMPLETED', 'CANCELLED'];

function Bookings() {
  const router = useRouter(); const sp = useSearchParams();
  const [f, setF] = useState({ q: '', status: '', paymentStatus: '', from: '', to: '', city: '', pincode: '', technicianId: '', serviceId: '', needsAssignment: sp.get('needsAssignment') ?? '' });
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams(Object.entries({ ...f, page: String(page) }).filter(([, v]) => v)).toString();
  const q = useApi<{ items: Row[]; total: number; limit: number }>(`/admin/bookings?${qs}`, [qs]);
  const techs = useApi<{ items: { id: string; code: string; name: string }[] }>('/admin/technicians?limit=100');
  const svcs = useApi<{ id: string; name: string }[]>('/admin/services');
  const [create, setCreate] = useState(false);
  const set = (k: keyof typeof f, v: string) => { setPage(1); setF((x) => ({ ...x, [k]: v })); };
  return (
    <>
      <div className="head"><h1>Bookings</h1><button className="btn" onClick={() => setCreate(true)}>+ Phone booking</button></div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row wrap">
          <input className="in" style={{ width: 220 }} placeholder="Booking ID or phone" value={f.q} onChange={(e) => set('q', e.target.value)} aria-label="Search" />
          <select className="in" style={{ width: 190 }} value={f.status} onChange={(e) => set('status', e.target.value)} aria-label="Status"><option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}</select>
          <select className="in" style={{ width: 170 }} value={f.paymentStatus} onChange={(e) => set('paymentStatus', e.target.value)} aria-label="Payment status"><option value="">Any payment</option>{['PENDING', 'PROCESSING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'].map((s) => <option key={s}>{s}</option>)}</select>
          <input className="in" type="date" style={{ width: 150 }} value={f.from} onChange={(e) => set('from', e.target.value)} aria-label="From date" />
          <input className="in" type="date" style={{ width: 150 }} value={f.to} onChange={(e) => set('to', e.target.value)} aria-label="To date" />
          <input className="in" style={{ width: 110 }} placeholder="City" value={f.city} onChange={(e) => set('city', e.target.value)} />
          <input className="in" style={{ width: 100 }} placeholder="Pincode" value={f.pincode} onChange={(e) => set('pincode', e.target.value)} />
          <select className="in" style={{ width: 180 }} value={f.technicianId} onChange={(e) => set('technicianId', e.target.value)} aria-label="Technician"><option value="">Any technician</option>{techs.data?.items.map((t) => <option key={t.id} value={t.id}>{t.code} · {t.name}</option>)}</select>
          <select className="in" style={{ width: 200 }} value={f.serviceId} onChange={(e) => set('serviceId', e.target.value)} aria-label="Service"><option value="">Any service</option>{svcs.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <label className="chk" style={{ margin: 0 }}><input type="checkbox" checked={f.needsAssignment === 'true'} onChange={(e) => set('needsAssignment', e.target.checked ? 'true' : '')} />Needs assignment</label>
        </div>
      </div>
      {q.error ? <ErrorBox message={q.error} onRetry={q.reload} /> : !q.data ? <Spinner /> : !q.data.items.length ? <Empty>No bookings match these filters.</Empty> : <>
        <div className="tablewrap"><table className="t"><thead><tr><th>Booking</th><th>Customer</th><th>Services</th><th>When</th><th>Area</th><th>Technician</th><th>Status</th><th>Amount</th></tr></thead><tbody>
          {q.data.items.map((b) => (
            <tr key={b.id} className="click" onClick={() => router.push(`/bookings/view?id=${b.id}`)}>
              <td><b className="mono">{b.code}</b><div className="muted small">{d(b.createdAt)}</div></td>
              <td>{b.customerName ?? '—'}<div className="muted small">{b.customerPhone}</div></td>
              <td style={{ maxWidth: 240 }}>{b.services}</td>
              <td>{b.isAsap ? <Badge s="ASAP" text="ASAP" /> : <>{d(b.scheduledDate)}<div className="muted small">{b.slotLabel}</div></>}</td>
              <td>{b.pincode}<div className="muted small">{b.city}</div></td>
              <td>{b.technicianName ?? (b.needsManualAssignment ? <Badge s="FAILED" text="Needs assignment" /> : <span className="muted">—</span>)}</td>
              <td><Badge s={b.status} /><div style={{ marginTop: 4 }}><Badge s={b.paymentStatus} /></div></td>
              <td className="b">{inr(b.grandTotal)}<div className="muted small">{b.paymentMode === 'PAY_NOW' ? 'Prepaid' : 'Pay after'}</div></td>
            </tr>
          ))}
        </tbody></table></div>
        <Pager page={page} total={q.data.total} limit={q.data.limit} onPage={setPage} />
      </>}
      <CreateBooking open={create} onClose={() => setCreate(false)} onDone={(id) => router.push(`/bookings/view?id=${id}`)} services={svcs.data ?? []} />
    </>
  );
}

function CreateBooking({ open, onClose, onDone, services }: { open: boolean; onClose: () => void; onDone: (id: string) => void; services: { id: string; name: string }[] }) {
  const slots = useApi<{ id: string; label: string; active: boolean }[]>(open ? '/admin/slots' : null, [open]);
  const [x, setX] = useState({ phone: '', name: '', houseNo: '', street: '', landmark: '', locality: '', city: 'Delhi', state: 'Delhi', pincode: '', serviceId: '', date: '', slotId: '', problem: '' });
  const a = useAction(); const s = (k: keyof typeof x) => (e: { target: { value: string } }) => setX((v) => ({ ...v, [k]: e.target.value }));
  useEffect(() => { if (!x.date) setX((v) => ({ ...v, date: new Date(Date.now() + 86400000).toISOString().slice(0, 10) })); }, [x.date]);
  const submit = () => a.run(async () => {
    const r = await api<{ id: string }>('/admin/bookings', { body: { phone: x.phone, name: x.name, address: { houseNo: x.houseNo, street: x.street || undefined, landmark: x.landmark || undefined, locality: x.locality || undefined, city: x.city, state: x.state, pincode: x.pincode }, items: [{ serviceId: x.serviceId, quantity: 1 }], date: x.date, slotId: x.slotId, problemDescription: x.problem || undefined } });
    onDone(r.id);
  });
  return (
    <Modal open={open} onClose={onClose} title="Create booking for a customer (phone order)" wide>
      {a.error ? <div className="alert bad">{a.error}</div> : null}
      <div className="grid g2">
        <Field label="Customer mobile"><input className="in" value={x.phone} onChange={s('phone')} placeholder="98765 43210" /></Field>
        <Field label="Customer name"><input className="in" value={x.name} onChange={s('name')} /></Field>
        <Field label="House / flat"><input className="in" value={x.houseNo} onChange={s('houseNo')} /></Field>
        <Field label="Street"><input className="in" value={x.street} onChange={s('street')} /></Field>
        <Field label="Landmark"><input className="in" value={x.landmark} onChange={s('landmark')} /></Field>
        <Field label="Locality"><input className="in" value={x.locality} onChange={s('locality')} /></Field>
        <Field label="City"><input className="in" value={x.city} onChange={s('city')} /></Field>
        <Field label="Pincode"><input className="in" value={x.pincode} onChange={s('pincode')} maxLength={6} /></Field>
        <Field label="Service"><select className="in" value={x.serviceId} onChange={s('serviceId')}><option value="">Select…</option>{services.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
        <Field label="Date"><input className="in" type="date" value={x.date} onChange={s('date')} /></Field>
        <Field label="Slot"><select className="in" value={x.slotId} onChange={s('slotId')}><option value="">Select…</option>{slots.data?.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></Field>
        <Field label="Problem"><input className="in" value={x.problem} onChange={s('problem')} /></Field>
      </div>
      <p className="muted small">Price is taken from the catalog. Payment mode: pay after service. The customer can log in with this number to track it.</p>
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={a.busy || !x.phone || !x.serviceId || !x.slotId || !x.pincode} onClick={submit}>Create booking</button></div>
    </Modal>
  );
}

export default function Page() { return <Suspense fallback={<Spinner />}><Bookings /></Suspense>; }
