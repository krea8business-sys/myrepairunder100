'use client';
import { useEffect, useState } from 'react';
import { Field, Modal, useAction, useApi } from '@/components/ui';
import { api } from '@/lib/api';

/** Create (phone required) or edit a technician: skills, pincodes, payout rate. */
export function TechForm({ open, onClose, onDone, edit }: { open: boolean; onClose: () => void; onDone: (id: string) => void; edit?: { id: string; name: string; experienceYears: number | null; bio: string | null; payoutRateBps: number; skills: { id: string }[]; serviceAreas: { pincode: string }[] } }) {
  const cats = useApi<{ id: string; name: string }[]>(open ? '/admin/categories' : null, [open]);
  const areas = useApi<{ pincodes: { pincode: string; area: string | null; active: boolean }[] }>(open ? '/admin/areas' : null, [open]);
  const [x, setX] = useState({ phone: '', name: '', exp: '', bio: '', payout: '70', cats: [] as string[], pins: [] as string[] });
  useEffect(() => { if (edit && open) setX({ phone: '', name: edit.name ?? '', exp: String(edit.experienceYears ?? ''), bio: edit.bio ?? '', payout: String(edit.payoutRateBps / 100), cats: edit.skills.map((s) => s.id), pins: edit.serviceAreas.map((a) => a.pincode) }); }, [edit, open]);
  const tog = (k: 'cats' | 'pins', v: string) => setX((o) => ({ ...o, [k]: o[k].includes(v) ? o[k].filter((y) => y !== v) : [...o[k], v] }));
  const a = useAction();
  const save = () => a.run(async () => {
    const body = { name: x.name, experienceYears: x.exp ? Number(x.exp) : null, bio: x.bio || null, payoutRateBps: Math.round(Number(x.payout) * 100), categoryIds: x.cats, pincodes: x.pins };
    if (edit) { await api(`/admin/technicians/${edit.id}`, { method: 'PUT', body }); onDone(edit.id); }
    else { const t = await api<{ id: string }>('/admin/technicians', { body: { ...body, phone: x.phone } }); onDone(t.id); }
  });
  return <Modal open={open} onClose={onClose} title={edit ? 'Edit technician' : 'Add technician (approved immediately)'} wide>
    {a.error ? <div className="alert bad">{a.error}</div> : null}
    <div className="grid g3">
      {!edit ? <Field label="Mobile"><input className="in" value={x.phone} onChange={(e) => setX({ ...x, phone: e.target.value })} /></Field> : null}
      <Field label="Full name"><input className="in" value={x.name} onChange={(e) => setX({ ...x, name: e.target.value })} /></Field>
      <Field label="Experience (years)"><input className="in" type="number" value={x.exp} onChange={(e) => setX({ ...x, exp: e.target.value })} /></Field>
      <Field label="Payout share (%)" hint="Of service value"><input className="in" type="number" value={x.payout} onChange={(e) => setX({ ...x, payout: e.target.value })} /></Field>
    </div>
    <Field label="Bio"><input className="in" value={x.bio} onChange={(e) => setX({ ...x, bio: e.target.value })} /></Field>
    <h3>Service categories</h3>
    <div className="row wrap" style={{ marginBottom: 12 }}>{cats.data?.map((c) => <label key={c.id} className="chk"><input type="checkbox" checked={x.cats.includes(c.id)} onChange={() => tog('cats', c.id)} />{c.name}</label>)}</div>
    <h3>Pincodes served</h3>
    <div className="row wrap" style={{ marginBottom: 12, maxHeight: 180, overflowY: 'auto' }}>{areas.data?.pincodes.filter((p) => p.active).map((p) => <label key={p.pincode} className="chk" style={{ width: 210 }}><input type="checkbox" checked={x.pins.includes(p.pincode)} onChange={() => tog('pins', p.pincode)} />{p.pincode} {p.area ? <span className="muted small">{p.area}</span> : null}</label>)}</div>
    <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={a.busy || x.name.length < 2 || !x.cats.length || !x.pins.length || (!edit && !x.phone)} onClick={save}>Save</button></div>
  </Modal>;
}
