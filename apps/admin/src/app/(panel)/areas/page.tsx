'use client';
import { useState } from 'react';
import { Badge, Field, Loadable, Modal, useAction, useApi, useToast } from '@/components/ui';
import { api } from '@/lib/api';

type Areas = { cities: { id: string; name: string; state: string; active: boolean }[]; zones: { id: string; cityId: string; name: string; active: boolean }[]; pincodes: { pincode: string; cityId: string; zoneId: string | null; area: string | null; active: boolean; technicians: number }[] };
export default function AreasPage() {
  const q = useApi<Areas>('/admin/areas');
  const [modal, setModal] = useState<null | 'city' | 'zone' | 'pins'>(null);
  const [filter, setFilter] = useState('');
  const a = useAction(); const t = useToast();
  const toggle = (p: Areas['pincodes'][number]) => a.run(async () => { await api(`/admin/pincodes/${p.pincode}`, { method: 'PATCH', body: { active: !p.active } }); t.toast(`${p.pincode} ${p.active ? 'disabled' : 'enabled'}`); q.reload(); });
  return <>
    <div className="head"><h1>Service areas & pincodes</h1><div className="row"><button className="btn ghost" onClick={() => setModal('city')}>+ City</button><button className="btn ghost" onClick={() => setModal('zone')}>+ Zone</button><button className="btn" onClick={() => setModal('pins')}>+ Pincodes</button></div></div>
    <div className="alert">Customers can only book in active pincodes. A pincode with 0 technicians can still be booked but will need manual assignment.</div>
    {a.error ? <div className="alert bad">{a.error}</div> : null}
    <Loadable q={q}>{(d) => <>
      <div className="grid g3">{d.cities.map((c) => (
        <div key={c.id} className="card">
          <div className="row sp"><h2 style={{ margin: 0 }}>{c.name}</h2><button className={`btn sm ${c.active ? 'sec' : 'ghost'}`} onClick={() => a.run(async () => { await api(`/admin/cities/${c.id}`, { method: 'PATCH', body: { active: !c.active } }); q.reload(); })}>{c.active ? 'Active' : 'Paused'}</button></div>
          <p className="muted small">{c.state} · {d.pincodes.filter((p) => p.cityId === c.id && p.active).length} active pincodes</p>
          <div className="row wrap">{d.zones.filter((z) => z.cityId === c.id).map((z) => <Badge key={z.id} s={z.active ? 'x' : 'OFFLINE'} text={z.name} />)}</div>
        </div>))}</div>
      <div className="row sp" style={{ margin: '18px 0 10px' }}><h2 style={{ margin: 0 }}>Pincodes</h2><input className="in" style={{ width: 220 }} placeholder="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
      <div className="tablewrap"><table className="t"><thead><tr><th>Pincode</th><th>Area</th><th>City / zone</th><th>Technicians</th><th>Status</th></tr></thead><tbody>
        {d.pincodes.filter((p) => !filter || p.pincode.includes(filter) || (p.area ?? '').toLowerCase().includes(filter.toLowerCase())).map((p) => <tr key={p.pincode}>
          <td className="mono b">{p.pincode}</td><td>{p.area ?? '—'}</td><td>{d.cities.find((c) => c.id === p.cityId)?.name}{p.zoneId ? ` · ${d.zones.find((z) => z.id === p.zoneId)?.name}` : ''}</td>
          <td>{p.technicians || <span style={{ color: 'var(--bad)' }}>0</span>}</td><td><button className={`btn sm ${p.active ? 'sec' : 'ghost'}`} onClick={() => toggle(p)}>{p.active ? 'Serviceable' : 'Disabled'}</button></td>
        </tr>)}
      </tbody></table></div>
      <AreaModal kind={modal} data={d} onClose={() => setModal(null)} onDone={() => { setModal(null); t.toast('Saved'); q.reload(); }} />
    </>}</Loadable>
    {t.node}
  </>;
}
function AreaModal({ kind, data, onClose, onDone }: { kind: null | 'city' | 'zone' | 'pins'; data: Areas; onClose: () => void; onDone: () => void }) {
  const [x, setX] = useState({ name: '', state: 'Delhi', cityId: data.cities[0]?.id ?? '', zoneId: '', pins: '', area: '' }); const a = useAction();
  const submit = () => a.run(async () => {
    if (kind === 'city') await api('/admin/cities', { body: { name: x.name, state: x.state } });
    if (kind === 'zone') await api('/admin/zones', { body: { cityId: x.cityId, name: x.name } });
    if (kind === 'pins') await api('/admin/pincodes', { body: { pincodes: x.pins, cityId: x.cityId, zoneId: x.zoneId || null, area: x.area || null } });
    onDone();
  });
  return <Modal open={!!kind} onClose={onClose} title={kind === 'city' ? 'Add city' : kind === 'zone' ? 'Add zone' : 'Add pincodes'}>
    {a.error ? <div className="alert bad">{a.error}</div> : null}
    {kind === 'city' ? <><Field label="City"><input className="in" value={x.name} onChange={(e) => setX({ ...x, name: e.target.value })} /></Field><Field label="State"><input className="in" value={x.state} onChange={(e) => setX({ ...x, state: e.target.value })} /></Field></> : <>
      <Field label="City"><select className="in" value={x.cityId} onChange={(e) => setX({ ...x, cityId: e.target.value })}>{data.cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      {kind === 'zone' ? <Field label="Zone name"><input className="in" value={x.name} onChange={(e) => setX({ ...x, name: e.target.value })} /></Field> : <>
        <Field label="Zone (optional)"><select className="in" value={x.zoneId} onChange={(e) => setX({ ...x, zoneId: e.target.value })}><option value="">—</option>{data.zones.filter((z) => z.cityId === x.cityId).map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select></Field>
        <Field label="Pincodes" hint="Comma, space or new-line separated. Existing pincodes are updated and re-enabled."><textarea className="in" value={x.pins} onChange={(e) => setX({ ...x, pins: e.target.value })} placeholder="110084, 110042" /></Field>
        <Field label="Area label (optional)"><input className="in" value={x.area} onChange={(e) => setX({ ...x, area: e.target.value })} placeholder="e.g. Burari" /></Field>
      </>}
    </>}
    <button className="btn" disabled={a.busy} onClick={submit}>Save</button>
  </Modal>;
}
