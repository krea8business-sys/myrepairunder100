'use client';
import { useMemo, useState } from 'react';
import { Badge, Field, Loadable, Modal, Tabs, useAction, useApi, useToast } from '@/components/ui';
import { api } from '@/lib/api';

type Cat = { id: string; slug: string; name: string; shortDescription: string | null; icon: string; sortOrder: number; active: boolean; subcategories: { id: string; slug: string; name: string; active: boolean; sortOrder: number }[] };
type Svc = { id: string; categoryId: string; subcategoryId: string | null; slug: string; name: string; shortDescription: string | null; description: string | null; includes: string[]; excludes: string[]; terms: string | null; sparePartsPolicy: string | null; durationMins: number; warrantyDays: number; basePrice: number; discountPrice: number | null; isStartingPrice: boolean; taxRateBps: number | null; maxQuantity: number; popular: boolean; keywords: string[]; sortOrder: number; active: boolean; imageUrl: string | null };
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function Services() {
  const cats = useApi<Cat[]>('/admin/categories');
  const svcs = useApi<Svc[]>('/admin/services');
  const [tab, setTab] = useState<'services' | 'categories'>('services');
  const [cat, setCat] = useState<string>('');
  const [edit, setEdit] = useState<Svc | 'new' | null>(null);
  const [catEdit, setCatEdit] = useState<Cat | 'new' | null>(null);
  const [subFor, setSubFor] = useState<Cat | null>(null);
  const t = useToast(); const a = useAction();
  const order = useMemo(() => new Map((cats.data ?? []).map((c) => [c.id, c.sortOrder])), [cats.data]);
  const list = useMemo(() => (svcs.data ?? []).filter((s) => !cat || s.categoryId === cat).sort((a2, b2) => (order.get(a2.categoryId) ?? 0) - (order.get(b2.categoryId) ?? 0) || a2.sortOrder - b2.sortOrder), [svcs.data, cat, order]);
  const patch = (s: Svc, body: object, msg: string) => a.run(async () => { await api(`/admin/services/${s.id}`, { method: 'PATCH', body }); t.toast(msg); svcs.reload(); });

  return <>
    <div className="head"><h1>Categories, services & pricing</h1><div className="row">{tab === 'services' ? <button className="btn" onClick={() => setEdit('new')}>+ New service</button> : <button className="btn" onClick={() => setCatEdit('new')}>+ New category</button>}</div></div>
    <Tabs value={tab} onChange={setTab} items={[['services', 'Services & pricing'], ['categories', 'Categories & subcategories']]} />
    {a.error ? <div className="alert bad">{a.error}</div> : null}
    {tab === 'services' ? <Loadable q={svcs}>{() => <>
      <div className="row wrap" style={{ marginBottom: 12 }}><select className="in" style={{ width: 260 }} value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filter by category"><option value="">All categories</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><span className="muted small">Prices are in rupees. Changes apply to new bookings instantly; existing bookings keep their price. Every change is recorded in price history and the audit log.</span></div>
      <div className="tablewrap"><table className="t"><thead><tr><th>Service</th><th>Category</th><th>Base price</th><th>Offer price</th><th>Duration</th><th>Warranty</th><th>Popular</th><th>Status</th><th /></tr></thead><tbody>
        {list.map((s) => <tr key={s.id}>
          <td><b>{s.name}</b>{s.isStartingPrice ? <div className="muted small">“Starting at” price</div> : null}</td>
          <td className="small">{cats.data?.find((c) => c.id === s.categoryId)?.name}</td>
          <td><PriceCell value={s.basePrice} onSave={(v) => patch(s, { basePrice: v }, 'Base price updated')} /></td>
          <td><PriceCell value={s.discountPrice} allowEmpty onSave={(v) => patch(s, { discountPrice: v }, 'Offer price updated')} /></td>
          <td>{s.durationMins} min</td><td>{s.warrantyDays ? `${s.warrantyDays} d` : '—'}</td>
          <td><input type="checkbox" checked={s.popular} onChange={(e) => patch(s, { popular: e.target.checked }, e.target.checked ? 'Shown in Popular' : 'Removed from Popular')} aria-label="Popular" /></td>
          <td><button className={`btn sm ${s.active ? 'sec' : 'ghost'}`} onClick={() => patch(s, { active: !s.active }, s.active ? 'Service disabled' : 'Service enabled')}>{s.active ? 'Enabled' : 'Disabled'}</button></td>
          <td><button className="btn sm ghost" onClick={() => setEdit(s)}>Edit</button></td>
        </tr>)}
      </tbody></table></div>
    </>}</Loadable> : <Loadable q={cats}>{(cs) => <div className="grid g2">{cs.map((c) => (
      <div key={c.id} className="card">
        <div className="row sp"><h2 style={{ margin: 0 }}>{c.name}</h2><div className="row"><Badge s={c.active ? 'ACTIVE' : 'OFFLINE'} text={c.active ? 'Active' : 'Hidden'} /><button className="btn sm ghost" onClick={() => setCatEdit(c)}>Edit</button></div></div>
        <p className="muted small">/{c.slug} · {svcs.data?.filter((s) => s.categoryId === c.id).length ?? 0} services · {c.shortDescription}</p>
        <h3>Subcategories</h3>
        <div className="row wrap">{c.subcategories.map((s) => <span key={s.id} className="badge mute">{s.name} <button aria-label={`Remove ${s.name}`} style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--bad)' }} onClick={() => a.run(async () => { await api(`/admin/subcategories/${s.id}`, { method: 'DELETE' }); cats.reload(); })}>✕</button></span>)}<button className="btn sm sec" onClick={() => setSubFor(c)}>+ Add</button></div>
      </div>))}</div>}</Loadable>}
    <ServiceModal svc={edit} cats={cats.data ?? []} onClose={() => setEdit(null)} onDone={() => { setEdit(null); t.toast('Service saved'); svcs.reload(); cats.reload(); }} />
    <CategoryModal cat={catEdit} onClose={() => setCatEdit(null)} onDone={() => { setCatEdit(null); t.toast('Category saved'); cats.reload(); }} />
    <SubModal cat={subFor} onClose={() => setSubFor(null)} onDone={() => { setSubFor(null); cats.reload(); }} />
    {t.node}
  </>;
}

function PriceCell({ value, onSave, allowEmpty }: { value: number | null; onSave: (rupees: number | null) => void; allowEmpty?: boolean }) {
  const [v, setV] = useState<string | null>(null);
  const cur = value == null ? '' : String(value / 100);
  return <div className="row" style={{ gap: 4 }}>
    <span className="muted">₹</span>
    <input className="in" style={{ width: 90, height: 32 }} value={v ?? cur} onChange={(e) => setV(e.target.value.replace(/[^\d.]/g, ''))} placeholder={allowEmpty ? '—' : ''} aria-label="Price in rupees"
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      onBlur={() => { if (v == null || v === cur) return setV(null); onSave(v === '' && allowEmpty ? null : Number(v)); setV(null); }} />
  </div>;
}

function ServiceModal({ svc, cats, onClose, onDone }: { svc: Svc | 'new' | null; cats: Cat[]; onClose: () => void; onDone: () => void }) {
  const isNew = svc === 'new';
  const init = (s: Svc | 'new' | null) => s && s !== 'new' ? { ...s, base: String(s.basePrice / 100), disc: s.discountPrice != null ? String(s.discountPrice / 100) : '', tax: s.taxRateBps != null ? String(s.taxRateBps / 100) : '', inc: s.includes.join('\n'), exc: s.excludes.join('\n'), kw: s.keywords.join(', ') }
    : { categoryId: cats[0]?.id ?? '', subcategoryId: null, slug: '', name: '', shortDescription: '', description: '', terms: '', sparePartsPolicy: 'Spare parts, if required, are charged separately with your approval.', durationMins: 60, warrantyDays: 0, isStartingPrice: true, maxQuantity: 5, popular: false, sortOrder: 0, active: true, base: '', disc: '', tax: '', inc: '', exc: '', kw: '', imageUrl: null };
  const [x, setX] = useState<any>(init(svc));
  const [key, setKey] = useState<unknown>(svc);
  if (key !== svc) { setKey(svc); setX(init(svc)); }
  const a = useAction();
  if (!svc) return null;
  const s = (k: string) => (e: { target: { value: string } }) => setX((o: any) => ({ ...o, [k]: e.target.value }));
  const subs = cats.find((c) => c.id === x.categoryId)?.subcategories ?? [];
  const save = () => a.run(async () => {
    const body = {
      categoryId: x.categoryId, subcategoryId: x.subcategoryId || null, slug: x.slug || slugify(x.name), name: x.name, shortDescription: x.shortDescription || null, description: x.description || null,
      includes: x.inc.split('\n').map((l: string) => l.trim()).filter(Boolean), excludes: x.exc.split('\n').map((l: string) => l.trim()).filter(Boolean), terms: x.terms || null, sparePartsPolicy: x.sparePartsPolicy || null,
      durationMins: Number(x.durationMins), warrantyDays: Number(x.warrantyDays), basePrice: Number(x.base), discountPrice: x.disc === '' ? null : Number(x.disc), isStartingPrice: !!x.isStartingPrice,
      taxRateBps: x.tax === '' ? null : Math.round(Number(x.tax) * 100), maxQuantity: Number(x.maxQuantity), popular: !!x.popular, keywords: x.kw.split(',').map((k: string) => k.trim()).filter(Boolean), sortOrder: Number(x.sortOrder), active: !!x.active,
    };
    await api(isNew ? '/admin/services' : `/admin/services/${(svc as Svc).id}`, { method: isNew ? 'POST' : 'PUT', body });
    onDone();
  });
  const del = () => a.run(async () => { if (!confirm('Delete this service? It will disappear from the app. Past bookings are kept.')) return; await api(`/admin/services/${(svc as Svc).id}`, { method: 'DELETE' }); onDone(); });
  const upload = async (f: File) => a.run(async () => { const fd = new FormData(); fd.append('image', f); const r = await api<Svc>(`/admin/services/${(svc as Svc).id}/image`, { form: fd }); setX((o: any) => ({ ...o, imageUrl: r.imageUrl })); });
  return <Modal open onClose={onClose} title={isNew ? 'New service' : `Edit · ${x.name}`} wide>
    {a.error ? <div className="alert bad">{a.error}</div> : null}
    <div className="grid g3">
      <Field label="Name"><input className="in" value={x.name} onChange={s('name')} /></Field>
      <Field label="Category"><select className="in" value={x.categoryId} onChange={s('categoryId')}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Subcategory"><select className="in" value={x.subcategoryId ?? ''} onChange={s('subcategoryId')}><option value="">All types</option>{subs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Base price (₹)" hint="MRP / regular price"><input className="in" value={x.base} onChange={s('base')} /></Field>
      <Field label="Offer price (₹)" hint="Leave blank for none"><input className="in" value={x.disc} onChange={s('disc')} /></Field>
      <Field label="Tax rate %" hint="Blank = global setting"><input className="in" value={x.tax} onChange={s('tax')} /></Field>
      <Field label="Duration (min)"><input className="in" type="number" value={x.durationMins} onChange={s('durationMins')} /></Field>
      <Field label="Warranty (days)"><input className="in" type="number" value={x.warrantyDays} onChange={s('warrantyDays')} /></Field>
      <Field label="Max quantity"><input className="in" type="number" value={x.maxQuantity} onChange={s('maxQuantity')} /></Field>
      <Field label="URL slug" hint="Auto from name if blank"><input className="in" value={x.slug} onChange={s('slug')} /></Field>
      <Field label="Sort order"><input className="in" type="number" value={x.sortOrder} onChange={s('sortOrder')} /></Field>
      <div>
        <label className="chk"><input type="checkbox" checked={x.isStartingPrice} onChange={(e) => setX({ ...x, isStartingPrice: e.target.checked })} />Show as “Starting at”</label>
        <label className="chk"><input type="checkbox" checked={x.popular} onChange={(e) => setX({ ...x, popular: e.target.checked })} />Popular on home</label>
        <label className="chk"><input type="checkbox" checked={x.active} onChange={(e) => setX({ ...x, active: e.target.checked })} />Available for booking</label>
      </div>
    </div>
    <Field label="Short description (card)"><input className="in" value={x.shortDescription ?? ''} onChange={s('shortDescription')} /></Field>
    <Field label="Detailed description"><textarea className="in" value={x.description ?? ''} onChange={s('description')} /></Field>
    <div className="grid g2">
      <Field label="What's included (one per line)"><textarea className="in" value={x.inc} onChange={s('inc')} /></Field>
      <Field label="Not included (one per line)"><textarea className="in" value={x.exc} onChange={s('exc')} /></Field>
      <Field label="Spare-part policy"><textarea className="in" value={x.sparePartsPolicy ?? ''} onChange={s('sparePartsPolicy')} /></Field>
      <Field label="Terms"><textarea className="in" value={x.terms ?? ''} onChange={s('terms')} /></Field>
    </div>
    <Field label="Search keywords (comma separated)" hint="Used by the app search, e.g. not cooling, gas, thanda nahi"><input className="in" value={x.kw} onChange={s('kw')} /></Field>
    {!isNew ? <Field label="Service image"><div className="row">{x.imageUrl ? <img src={x.imageUrl} alt="" width={60} height={60} style={{ borderRadius: 10, objectFit: 'cover' }} /> : null}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></div></Field> : null}
    <div className="row sp">{!isNew ? <button className="btn danger" onClick={del}>Delete</button> : <span />}<div className="row"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={a.busy || !x.name || !x.base} onClick={save}>Save service</button></div></div>
  </Modal>;
}

function CategoryModal({ cat, onClose, onDone }: { cat: Cat | 'new' | null; onClose: () => void; onDone: () => void }) {
  const [x, setX] = useState<any>(null); const [k, setK] = useState<unknown>(undefined); const a = useAction();
  if (k !== cat) { setK(cat); setX(cat && cat !== 'new' ? { ...cat } : { slug: '', name: '', shortDescription: '', icon: 'wrench', sortOrder: 0, active: true }); }
  if (!cat || !x) return null;
  const isNew = cat === 'new';
  return <Modal open onClose={onClose} title={isNew ? 'New category' : `Edit · ${x.name}`}>
    {a.error ? <div className="alert bad">{a.error}</div> : null}
    <Field label="Name"><input className="in" value={x.name} onChange={(e) => setX({ ...x, name: e.target.value })} /></Field>
    <Field label="URL slug" hint="Used in SEO pages, e.g. ac-repair"><input className="in" value={x.slug} onChange={(e) => setX({ ...x, slug: e.target.value })} placeholder={slugify(x.name)} /></Field>
    <Field label="Short description"><input className="in" value={x.shortDescription ?? ''} onChange={(e) => setX({ ...x, shortDescription: e.target.value })} /></Field>
    <Field label="Icon"><select className="in" value={x.icon} onChange={(e) => setX({ ...x, icon: e.target.value })}>{['ac', 'washer', 'fridge', 'microwave', 'wrench'].map((i) => <option key={i}>{i}</option>)}</select></Field>
    <Field label="Sort order"><input className="in" type="number" value={x.sortOrder} onChange={(e) => setX({ ...x, sortOrder: Number(e.target.value) })} /></Field>
    <label className="chk"><input type="checkbox" checked={x.active} onChange={(e) => setX({ ...x, active: e.target.checked })} />Visible in app</label>
    <div className="row sp">{!isNew ? <button className="btn danger" onClick={() => a.run(async () => { if (!confirm('Delete category and disable its services?')) return; await api(`/admin/categories/${(cat as Cat).id}`, { method: 'DELETE' }); onDone(); })}>Delete</button> : <span />}
      <button className="btn" disabled={a.busy || !x.name} onClick={() => a.run(async () => { const body = { slug: x.slug || slugify(x.name), name: x.name, shortDescription: x.shortDescription || null, icon: x.icon, sortOrder: x.sortOrder, active: x.active }; await api(isNew ? '/admin/categories' : `/admin/categories/${(cat as Cat).id}`, { method: isNew ? 'POST' : 'PUT', body }); onDone(); })}>Save</button></div>
  </Modal>;
}
function SubModal({ cat, onClose, onDone }: { cat: Cat | null; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(''); const a = useAction();
  return <Modal open={!!cat} onClose={onClose} title={`Add subcategory to ${cat?.name}`}>
    {a.error ? <div className="alert bad">{a.error}</div> : null}
    <Field label="Name"><input className="in" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Inverter Split AC" /></Field>
    <button className="btn" disabled={!name || a.busy} onClick={() => a.run(async () => { await api('/admin/subcategories', { body: { categoryId: cat!.id, name, slug: slugify(name), sortOrder: cat!.subcategories.length } }); setName(''); onDone(); })}>Add</button>
  </Modal>;
}
