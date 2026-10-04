'use client';
import { useState } from 'react';
import { Badge, Field, Loadable, Modal, Tabs, useAction, useApi, useToast } from '@/components/ui';
import { api, d, inr } from '@/lib/api';

const toLocal = (s: string | null) => (s ? new Date(s).toISOString().slice(0, 16) : '');
export default function Coupons() {
  const [tab, setTab] = useState<'coupons' | 'offers'>('coupons');
  const cs = useApi<any[]>('/admin/coupons'); const os = useApi<any[]>('/admin/offers'); const cats = useApi<any[]>('/admin/categories'); const svcs = useApi<any[]>('/admin/services');
  const [c, setC] = useState<any | null>(null); const [o, setO] = useState<any | null>(null); const t = useToast(); const a = useAction();
  return <>
    <div className="head"><h1>Coupons & offers</h1><button className="btn" onClick={() => (tab === 'coupons' ? setC({}) : setO({}))}>+ New {tab === 'coupons' ? 'coupon' : 'offer banner'}</button></div>
    <Tabs value={tab} onChange={setTab} items={[['coupons', 'Coupons'], ['offers', 'Home offer banners']]} />
    {a.error ? <div className="alert bad">{a.error}</div> : null}
    {tab === 'coupons' ? <Loadable q={cs}>{(rows) => <div className="tablewrap"><table className="t"><thead><tr><th>Code</th><th>Discount</th><th>Min order</th><th>Applies to</th><th>Validity</th><th>Used</th><th>Rules</th><th>Status</th><th /></tr></thead><tbody>
      {rows.map((x) => <tr key={x.id}><td className="mono b">{x.code}<div className="muted small" style={{ fontFamily: 'inherit' }}>{x.title}</div></td>
        <td>{x.discountType === 'PERCENT' ? `${x.value / 100}%${x.maxDiscount ? ` up to ${inr(x.maxDiscount)}` : ''}` : inr(x.value)}</td><td>{inr(x.minOrder)}</td>
        <td className="small">{x.serviceId ? svcs.data?.find((s) => s.id === x.serviceId)?.name : x.categoryId ? cats.data?.find((s) => s.id === x.categoryId)?.name : 'All services'}</td>
        <td className="small">{x.startsAt ? d(x.startsAt) : 'Now'} → {x.expiresAt ? d(x.expiresAt) : 'No expiry'}</td>
        <td>{x.usedCount}{x.usageLimit ? ` / ${x.usageLimit}` : ''}</td><td className="small">{x.perUserLimit}/user{x.newUsersOnly ? ' · new users' : ''}{x.showInOffers ? ' · listed' : ''}</td>
        <td><Badge s={x.active ? 'ACTIVE' : 'OFFLINE'} text={x.active ? 'Active' : 'Paused'} /></td><td><button className="btn sm ghost" onClick={() => setC(x)}>Edit</button></td></tr>)}
    </tbody></table></div>}</Loadable> : <Loadable q={os}>{(rows) => <div className="grid g3">{rows.map((x) => (
      <div key={x.id} className="card" style={{ borderTop: `4px solid var(--${x.theme === 'orange' ? 'orange' : x.theme === 'navy' ? 'navy' : 'blue'})` }}>
        <div className="row sp"><b>{x.title}</b><Badge s={x.active ? 'ACTIVE' : 'OFFLINE'} text={x.active ? 'Live' : 'Hidden'} /></div>
        <p className="muted small">{x.subtitle}</p><p className="small">{x.kind} · CTA “{x.ctaLabel}” → {x.ctaTarget}</p>
        <div className="row"><button className="btn sm ghost" onClick={() => setO(x)}>Edit</button><button className="btn sm danger" onClick={() => a.run(async () => { if (!confirm('Delete this banner?')) return; await api(`/admin/offers/${x.id}`, { method: 'DELETE' }); os.reload(); })}>Delete</button></div>
      </div>))}</div>}</Loadable>}
    <CouponModal c={c} cats={cats.data ?? []} svcs={svcs.data ?? []} onClose={() => setC(null)} onDone={() => { setC(null); t.toast('Coupon saved'); cs.reload(); }} />
    <OfferModal o={o} onClose={() => setO(null)} onDone={() => { setO(null); t.toast('Offer saved'); os.reload(); }} />
    {t.node}
  </>;
}
function CouponModal({ c, cats, svcs, onClose, onDone }: { c: any | null; cats: any[]; svcs: any[]; onClose: () => void; onDone: () => void }) {
  const [x, setX] = useState<any>(null); const [k, setK] = useState<unknown>(undefined); const a = useAction();
  if (k !== c) { setK(c); setX(c ? { code: c.code ?? '', title: c.title ?? '', description: c.description ?? '', discountType: c.discountType ?? 'FLAT', value: c.value ? String(c.discountType === 'PERCENT' ? c.value / 100 : c.value / 100) : '', minOrder: c.minOrder ? String(c.minOrder / 100) : '0', maxDiscount: c.maxDiscount ? String(c.maxDiscount / 100) : '', startsAt: toLocal(c.startsAt), expiresAt: toLocal(c.expiresAt), usageLimit: c.usageLimit ?? '', perUserLimit: c.perUserLimit ?? 1, categoryId: c.categoryId ?? '', serviceId: c.serviceId ?? '', newUsersOnly: !!c.newUsersOnly, showInOffers: c.showInOffers ?? true, active: c.active ?? true } : null); }
  if (!c || !x) return null;
  const s = (key: string) => (e: { target: { value: string } }) => setX({ ...x, [key]: e.target.value });
  const save = () => a.run(async () => {
    const body = { code: x.code, title: x.title, description: x.description || null, discountType: x.discountType, value: Number(x.value), minOrder: Number(x.minOrder || 0), maxDiscount: x.maxDiscount ? Number(x.maxDiscount) : null, startsAt: x.startsAt ? new Date(x.startsAt).toISOString() : null, expiresAt: x.expiresAt ? new Date(x.expiresAt).toISOString() : null, usageLimit: x.usageLimit ? Number(x.usageLimit) : null, perUserLimit: Number(x.perUserLimit), categoryId: x.categoryId || null, serviceId: x.serviceId || null, newUsersOnly: x.newUsersOnly, showInOffers: x.showInOffers, active: x.active };
    await api(c.id ? `/admin/coupons/${c.id}` : '/admin/coupons', { method: c.id ? 'PUT' : 'POST', body }); onDone();
  });
  return <Modal open onClose={onClose} title={c.id ? `Edit ${c.code}` : 'New coupon'} wide>
    {a.error ? <div className="alert bad">{a.error}</div> : null}
    <div className="grid g3">
      <Field label="Code"><input className="in mono" value={x.code} onChange={(e) => setX({ ...x, code: e.target.value.toUpperCase() })} /></Field>
      <Field label="Title (shown to customers)"><input className="in" value={x.title} onChange={s('title')} /></Field>
      <Field label="Description"><input className="in" value={x.description} onChange={s('description')} /></Field>
      <Field label="Discount type"><select className="in" value={x.discountType} onChange={s('discountType')}><option value="FLAT">Fixed amount (₹)</option><option value="PERCENT">Percentage (%)</option></select></Field>
      <Field label={x.discountType === 'PERCENT' ? 'Percent' : 'Amount (₹)'}><input className="in" value={x.value} onChange={s('value')} /></Field>
      <Field label="Max discount (₹)" hint="For percentage coupons"><input className="in" value={x.maxDiscount} onChange={s('maxDiscount')} /></Field>
      <Field label="Minimum order (₹)"><input className="in" value={x.minOrder} onChange={s('minOrder')} /></Field>
      <Field label="Starts"><input className="in" type="datetime-local" value={x.startsAt} onChange={s('startsAt')} /></Field>
      <Field label="Expires"><input className="in" type="datetime-local" value={x.expiresAt} onChange={s('expiresAt')} /></Field>
      <Field label="Total usage limit"><input className="in" value={x.usageLimit} onChange={s('usageLimit')} placeholder="Unlimited" /></Field>
      <Field label="Per-user limit"><input className="in" type="number" value={x.perUserLimit} onChange={s('perUserLimit')} /></Field>
      <Field label="Category"><select className="in" value={x.categoryId} onChange={s('categoryId')}><option value="">All</option>{cats.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
      <Field label="Service"><select className="in" value={x.serviceId} onChange={s('serviceId')}><option value="">All</option>{svcs.filter((v) => !x.categoryId || v.categoryId === x.categoryId).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
    </div>
    <div className="row wrap"><label className="chk"><input type="checkbox" checked={x.newUsersOnly} onChange={(e) => setX({ ...x, newUsersOnly: e.target.checked })} />New users only (first booking)</label><label className="chk"><input type="checkbox" checked={x.showInOffers} onChange={(e) => setX({ ...x, showInOffers: e.target.checked })} />List in app offers</label><label className="chk"><input type="checkbox" checked={x.active} onChange={(e) => setX({ ...x, active: e.target.checked })} />Active</label></div>
    <div className="row sp">{c.id ? <button className="btn danger" onClick={() => a.run(async () => { if (!confirm('Delete coupon?')) return; await api(`/admin/coupons/${c.id}`, { method: 'DELETE' }); onDone(); })}>Delete</button> : <span />}<button className="btn" disabled={a.busy} onClick={save}>Save coupon</button></div>
  </Modal>;
}
function OfferModal({ o, onClose, onDone }: { o: any | null; onClose: () => void; onDone: () => void }) {
  const [x, setX] = useState<any>(null); const [k, setK] = useState<unknown>(undefined); const a = useAction();
  if (k !== o) { setK(o); setX(o ? { title: o.title ?? '', subtitle: o.subtitle ?? '', kind: o.kind ?? 'SEASONAL', couponCode: o.couponCode ?? '', ctaLabel: o.ctaLabel ?? 'Book now', ctaTarget: o.ctaTarget ?? 'category:ac-repair', theme: o.theme ?? 'blue', sortOrder: o.sortOrder ?? 0, active: o.active ?? true, startsAt: toLocal(o.startsAt), endsAt: toLocal(o.endsAt) } : null); }
  if (!o || !x) return null;
  const s = (key: string) => (e: { target: { value: string } }) => setX({ ...x, [key]: e.target.value });
  return <Modal open onClose={onClose} title={o.id ? 'Edit offer' : 'New offer banner'}>
    {a.error ? <div className="alert bad">{a.error}</div> : null}
    <Field label="Title"><input className="in" value={x.title} onChange={s('title')} /></Field>
    <Field label="Subtitle"><input className="in" value={x.subtitle} onChange={s('subtitle')} /></Field>
    <div className="grid g2">
      <Field label="Type"><select className="in" value={x.kind} onChange={s('kind')}>{['COUPON', 'SEASONAL', 'NEW_USER', 'REFERRAL', 'CASHBACK'].map((v) => <option key={v}>{v}</option>)}</select></Field>
      <Field label="Colour"><select className="in" value={x.theme} onChange={s('theme')}>{['blue', 'orange', 'navy', 'green'].map((v) => <option key={v}>{v}</option>)}</select></Field>
      <Field label="Button label"><input className="in" value={x.ctaLabel} onChange={s('ctaLabel')} /></Field>
      <Field label="Button opens" hint="category:<slug> · referral · offers"><input className="in" value={x.ctaTarget} onChange={s('ctaTarget')} /></Field>
      <Field label="Coupon code (optional)"><input className="in" value={x.couponCode} onChange={s('couponCode')} /></Field>
      <Field label="Order"><input className="in" type="number" value={x.sortOrder} onChange={s('sortOrder')} /></Field>
      <Field label="Starts"><input className="in" type="datetime-local" value={x.startsAt} onChange={s('startsAt')} /></Field>
      <Field label="Ends"><input className="in" type="datetime-local" value={x.endsAt} onChange={s('endsAt')} /></Field>
    </div>
    <label className="chk"><input type="checkbox" checked={x.active} onChange={(e) => setX({ ...x, active: e.target.checked })} />Live</label>
    <button className="btn" disabled={a.busy || !x.title} onClick={() => a.run(async () => { await api(o.id ? `/admin/offers/${o.id}` : '/admin/offers', { method: o.id ? 'PUT' : 'POST', body: { ...x, sortOrder: Number(x.sortOrder), couponCode: x.couponCode || null, startsAt: x.startsAt ? new Date(x.startsAt).toISOString() : null, endsAt: x.endsAt ? new Date(x.endsAt).toISOString() : null } }); onDone(); })}>Save</button>
  </Modal>;
}
