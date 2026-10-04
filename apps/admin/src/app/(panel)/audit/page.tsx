'use client';
import { useState } from 'react';
import { Loadable, Modal, Pager, useApi } from '@/components/ui';
import { dt } from '@/lib/api';

export default function Audit() {
  const [page, setPage] = useState(1); const [entity, setEntity] = useState(''); const [sel, setSel] = useState<any | null>(null);
  const q = useApi<any[]>(`/admin/audit-logs?page=${page}${entity ? `&entity=${entity}` : ''}`, [page, entity]);
  return <>
    <div className="head"><h1>Audit logs</h1><select className="in" style={{ width: 200 }} value={entity} onChange={(e) => { setPage(1); setEntity(e.target.value); }} aria-label="Entity"><option value="">All</option>{['booking', 'service', 'category', 'coupon', 'wallet', 'technician', 'user', 'settings', 'pincode', 'referral', 'review', 'admin_user'].map((x) => <option key={x}>{x}</option>)}</select></div>
    <Loadable q={q}>{(rows) => <>
      <div className="tablewrap"><table className="t"><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>IP</th><th /></tr></thead><tbody>
        {rows.map((l) => <tr key={l.id}><td className="small">{dt(l.createdAt)}</td><td>{l.actorName ?? l.actorType}</td><td className="mono">{l.action}</td><td>{l.entity} <span className="mono muted">{l.entityId?.slice(0, 8)}</span></td><td className="mono">{l.ip}</td><td>{l.before || l.after ? <button className="btn sm ghost" onClick={() => setSel(l)}>Details</button> : null}</td></tr>)}
      </tbody></table></div>
      <Pager page={page} total={rows.length < 25 ? (page - 1) * 25 + rows.length : page * 25 + 1} limit={25} onPage={setPage} />
    </>}</Loadable>
    <Modal open={!!sel} onClose={() => setSel(null)} title={sel?.action ?? ''} wide>
      <div className="grid g2"><div><h3>Before</h3><pre className="mono" style={{ whiteSpace: 'pre-wrap', background: '#F5F7FB', padding: 10, borderRadius: 8 }}>{JSON.stringify(sel?.before, null, 2)}</pre></div><div><h3>After</h3><pre className="mono" style={{ whiteSpace: 'pre-wrap', background: '#F5F7FB', padding: 10, borderRadius: 8 }}>{JSON.stringify(sel?.after, null, 2)}</pre></div></div>
    </Modal>
  </>;
}
