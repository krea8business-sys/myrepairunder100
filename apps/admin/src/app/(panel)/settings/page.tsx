'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Badge, Field, Loadable, Modal, Spinner, Tabs, useAction, useApi, useToast } from '@/components/ui';
import { api, can, dt } from '@/lib/api';

const SECTIONS: [string, string, string][] = [
  ['company', 'Company', 'Name, contact numbers and public stats. Leave blank anything you don’t want shown — nothing is invented.'],
  ['booking', 'Booking', 'Advance booking window, ASAP, lead time, working days (0 = Sunday … 6 = Saturday), minimum order.'],
  ['payments', 'Payments', 'Which payment options customers see. Gateway keys are configured on the server (.env), never here.'],
  ['tax', 'Tax', 'GST on services. Inclusive = listed prices already contain tax.'],
  ['wallet', 'Wallet', 'How much wallet balance can be used per booking, promo credit expiry and where cancellation refunds go.'],
  ['referral', 'Referral', 'Rewards and anti-abuse rules for Refer & Earn.'],
  ['cancellation', 'Cancellation', 'Free cancellation window and fee.'],
  ['assignment', 'Assignment', 'Automatic technician assignment: how many technicians get each job request, for how long, and how they are ranked.'],
  ['tracking', 'Tracking', 'When customers start seeing the technician’s live location.'],
  ['warranty', 'Warranty', 'Default warranty when a service has none set.'],
  ['emergency', 'Emergency', 'Emergency / out-of-hours service.'],
  ['launch', 'Launch', 'Clear the demo-data banner after you have reviewed prices, pincodes and technicians.'],
];
const HELP: Record<string, string> = {
  maxUsePerBookingPaise: 'Max wallet per booking', maxUsePercentBps: 'Max % of bill payable by wallet', minBookingValuePaise: 'Minimum booking value', promoExpiryDays: 'Promotional credit expiry (days)',
  referrerRewardPaise: 'Reward to referrer', refereeRewardPaise: 'Welcome reward to friend', monthlyLimit: 'Max rewarded referrals / month / person', applyWindowDays: 'Days after signup to apply a code', rewardExpiryDays: 'Reward expiry (days)', blockSameDevice: 'Block referrals from the same device',
  freeUntilMinutesBefore: 'Free cancellation until (minutes before slot)', feePaise: 'Cancellation fee', freeBeforeAssignment: 'Always free before a technician is assigned',
  offerBatchSize: 'Technicians offered each job at once', offerTtlMinutes: 'Minutes to accept', maxRounds: 'Offer rounds before admin queue', maxJobsPerDay: 'Max jobs per technician per day', maxDistanceKm: 'Max distance (km)',
  defaultRateBps: 'Default rate %', advanceDays: 'Days ahead customers can book', asapCutoffHour: 'ASAP available until (hour, 24h)', minLeadMinutes: 'Minimum lead time (minutes)', minOrderValue: 'Minimum order value', requireStartOtp: 'Technician must enter customer’s start code',
  surchargePaise: 'Emergency surcharge', defaultDays: 'Default warranty (days)', claimWindowDays: 'Extra claim window (days)', demoDataPresent: 'Show demo-data warning banner',
};
const isMoney = (k: string) => k.endsWith('Paise') || k === 'minOrderValue';
const isPct = (k: string) => k.endsWith('Bps');

function SectionForm({ name, value, onSaved }: { name: string; value: Record<string, unknown>; onSaved: () => void }) {
  const [x, setX] = useState<Record<string, unknown>>(value); const a = useAction(); const editable = can('settings.manage');
  useEffect(() => setX(value), [value]);
  const render = (k: string, v: unknown, set: (nv: unknown) => void): React.ReactNode => {
    const l = HELP[k] ?? k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
    if (typeof v === 'boolean') return <label key={k} className="chk"><input type="checkbox" checked={v} disabled={!editable} onChange={(e) => set(e.target.checked)} />{l}</label>;
    if (typeof v === 'number') return <Field key={k} label={`${l}${isMoney(k) ? ' (₹)' : isPct(k) ? ' (%)' : ''}`}><input className="in" type="number" disabled={!editable} value={isMoney(k) || isPct(k) ? v / 100 : v} onChange={(e) => set(isMoney(k) || isPct(k) ? Math.round(Number(e.target.value) * 100) : Number(e.target.value))} /></Field>;
    if (Array.isArray(v) && k === 'publicStats') return <Field key={k} label="Public stats shown on the app home (one per line: Label = Value)" hint="Only enter real, verifiable numbers. Leave empty to show none."><textarea className="in" disabled={!editable} value={(v as { label: string; value: string }[]).map((s) => `${s.label} = ${s.value}`).join('\n')} onChange={(e) => set(e.target.value.split('\n').map((line) => line.split('=')).filter((p) => p.length === 2 && p[0].trim() && p[1].trim()).map(([lb, vl]) => ({ label: lb.trim(), value: vl.trim() })))} /></Field>;
    if (Array.isArray(v)) return <Field key={k} label={`${l} (comma separated)`}><input className="in" disabled={!editable} value={v.join(', ')} onChange={(e) => set(e.target.value.split(',').map((s) => s.trim()).filter(Boolean).map((s) => (/^\d+$/.test(s) ? Number(s) : s)))} /></Field>;
    if (v && typeof v === 'object') return <fieldset key={k} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, marginBottom: 12 }}><legend className="small b">{l}</legend>{Object.entries(v).map(([kk, vv]) => render(kk, vv, (nv) => set({ ...(v as object), [kk]: nv })))}</fieldset>;
    if (['mode', 'cancellationRefundTo', 'shareFromStatus'].includes(k)) {
      const opts = k === 'mode' ? ['INCLUSIVE', 'EXCLUSIVE'] : k === 'cancellationRefundTo' ? ['SOURCE', 'WALLET'] : ['TECHNICIAN_ASSIGNED', 'TECHNICIAN_ON_THE_WAY'];
      return <Field key={k} label={l}><select className="in" disabled={!editable} value={String(v)} onChange={(e) => set(e.target.value)}>{opts.map((o) => <option key={o}>{o}</option>)}</select></Field>;
    }
    return <Field key={k} label={l}><input className="in" disabled={!editable} value={(v as string) ?? ''} onChange={(e) => set(e.target.value === '' ? null : e.target.value)} /></Field>;
  };
  return <div className="card">
    {a.error ? <div className="alert bad">{a.error}</div> : null}
    <div className="grid g2">{Object.entries(x).map(([k, v]) => <div key={k}>{render(k, v, (nv) => setX({ ...x, [k]: nv }))}</div>)}</div>
    {editable ? <button className="btn" disabled={a.busy} onClick={() => a.run(async () => { await api(`/admin/settings/${name}`, { method: 'PUT', body: x }); onSaved(); })}>Save {name}</button> : <p className="muted small">Only a Super Admin can change settings.</p>}
  </div>;
}

function Settings() {
  const sp = useSearchParams();
  const [tab, setTab] = useState(sp.get('tab') ?? 'company');
  const q = useApi<Record<string, Record<string, unknown>>>('/admin/settings'); const t = useToast();
  const sec = SECTIONS.find((s) => s[0] === tab);
  return <>
    <div className="head"><h1>Settings</h1></div>
    <Tabs value={tab} onChange={setTab} items={[...SECTIONS.map(([k, l]) => [k, l] as [string, string]), ['slots', 'Time slots'], ...(can('admins.manage') ? [['admins', 'Admin users'] as [string, string]] : []), ['account', 'My account']]} />
    {sec ? <><p className="muted">{sec[2]}</p><Loadable q={q}>{(d) => <SectionForm name={tab} value={d[tab]} onSaved={() => { t.toast('Settings saved'); q.reload(); }} />}</Loadable></> : null}
    {tab === 'slots' ? <Slots /> : null}
    {tab === 'admins' ? <Admins /> : null}
    {tab === 'account' ? <Account /> : null}
    {t.node}
  </>;
}

function Slots() {
  const q = useApi<any[]>('/admin/slots'); const [e, setE] = useState<any | null>(null); const a = useAction();
  return <div className="card">
    <div className="row sp"><h2 style={{ margin: 0 }}>Booking time slots</h2>{can('settings.manage') ? <button className="btn sm" onClick={() => setE({ label: '', startTime: '09:00', endTime: '11:00', capacity: 10, sortOrder: (q.data?.length ?? 0), active: true })}>+ Add slot</button> : null}</div>
    <p className="muted small">Capacity = max bookings in this slot per day across all areas.</p>
    <Loadable q={q}>{(rows) => <table className="t"><thead><tr><th>Label</th><th>Start</th><th>End</th><th>Capacity</th><th>Status</th><th /></tr></thead><tbody>{rows.map((s) => <tr key={s.id}><td className="b">{s.label}</td><td>{s.startTime}</td><td>{s.endTime}</td><td>{s.capacity}</td><td><Badge s={s.active ? 'ACTIVE' : 'OFFLINE'} text={s.active ? 'Active' : 'Off'} /></td><td>{can('settings.manage') ? <button className="btn sm ghost" onClick={() => setE(s)}>Edit</button> : null}</td></tr>)}</tbody></table>}</Loadable>
    <Modal open={!!e} onClose={() => setE(null)} title={e?.id ? 'Edit slot' : 'New slot'}>
      {e ? <>
        {a.error ? <div className="alert bad">{a.error}</div> : null}
        <Field label="Label"><input className="in" value={e.label} onChange={(x) => setE({ ...e, label: x.target.value })} placeholder="9 AM - 11 AM" /></Field>
        <div className="grid g2"><Field label="Start (24h)"><input className="in" type="time" value={e.startTime} onChange={(x) => setE({ ...e, startTime: x.target.value })} /></Field><Field label="End (24h)"><input className="in" type="time" value={e.endTime} onChange={(x) => setE({ ...e, endTime: x.target.value })} /></Field>
          <Field label="Capacity"><input className="in" type="number" value={e.capacity} onChange={(x) => setE({ ...e, capacity: Number(x.target.value) })} /></Field><Field label="Order"><input className="in" type="number" value={e.sortOrder} onChange={(x) => setE({ ...e, sortOrder: Number(x.target.value) })} /></Field></div>
        <label className="chk"><input type="checkbox" checked={e.active} onChange={(x) => setE({ ...e, active: x.target.checked })} />Active</label>
        <button className="btn" disabled={a.busy} onClick={() => a.run(async () => { const body = { label: e.label, startTime: e.startTime, endTime: e.endTime, capacity: e.capacity, sortOrder: e.sortOrder, active: e.active }; await api(e.id ? `/admin/slots/${e.id}` : '/admin/slots', { method: e.id ? 'PUT' : 'POST', body }); setE(null); q.reload(); })}>Save</button>
      </> : null}
    </Modal>
  </div>;
}

function Admins() {
  const q = useApi<any[]>('/admin/admins'); const [n, setN] = useState({ email: '', name: '', role: 'ADMIN', password: '' }); const a = useAction(); const [open, setOpen] = useState(false);
  return <div className="card">
    <div className="row sp"><h2 style={{ margin: 0 }}>Admin users</h2><button className="btn sm" onClick={() => setOpen(true)}>+ Invite admin</button></div>
    <p className="muted small">Roles: Super Admin (everything incl. settings), Admin (operations, catalog, money), Support (bookings, tickets, read-only money; masked phone numbers in lists).</p>
    {a.error ? <div className="alert bad">{a.error}</div> : null}
    <Loadable q={q}>{(rows) => <table className="t"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last login</th><th>Status</th></tr></thead><tbody>{rows.map((x) => <tr key={x.id}><td>{x.name}</td><td>{x.email}</td>
      <td><select className="in" style={{ width: 160, height: 32 }} value={x.role} onChange={(e) => a.run(async () => { await api(`/admin/admins/${x.id}`, { method: 'PATCH', body: { role: e.target.value } }); q.reload(); })}><option>SUPER_ADMIN</option><option>ADMIN</option><option>SUPPORT</option></select></td>
      <td className="small">{dt(x.lastLoginAt)}</td><td><button className={`btn sm ${x.active ? 'sec' : 'danger'}`} onClick={() => a.run(async () => { await api(`/admin/admins/${x.id}`, { method: 'PATCH', body: { active: !x.active } }); q.reload(); })}>{x.active ? 'Active' : 'Disabled'}</button></td></tr>)}</tbody></table>}</Loadable>
    <Modal open={open} onClose={() => setOpen(false)} title="Invite admin">
      <Field label="Name"><input className="in" value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} /></Field>
      <Field label="Email"><input className="in" type="email" value={n.email} onChange={(e) => setN({ ...n, email: e.target.value })} /></Field>
      <Field label="Role"><select className="in" value={n.role} onChange={(e) => setN({ ...n, role: e.target.value })}><option>ADMIN</option><option>SUPPORT</option><option>SUPER_ADMIN</option></select></Field>
      <Field label="Temporary password" hint="12+ chars, upper, lower and a number. They must change it at first login."><input className="in" type="password" value={n.password} onChange={(e) => setN({ ...n, password: e.target.value })} /></Field>
      <button className="btn" disabled={a.busy} onClick={() => a.run(async () => { await api('/admin/admins', { body: n }); setOpen(false); q.reload(); })}>Create</button>
    </Modal>
  </div>;
}

function Account() {
  const [cur, setCur] = useState(''); const [nw, setNw] = useState(''); const a = useAction(); const [ok, setOk] = useState(false);
  const me = useApi<{ mustChangePassword: boolean; email: string }>('/admin/me');
  return <div className="card" style={{ maxWidth: 480 }}>
    <h2>Change password</h2>
    {me.data?.mustChangePassword ? <div className="alert warn">You are using a temporary password. Please change it now.</div> : null}
    {a.error ? <div className="alert bad">{a.error}</div> : null}{ok ? <div className="alert ok">Password changed.</div> : null}
    <Field label="Current password"><input className="in" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
    <Field label="New password" hint="At least 12 characters with upper-case, lower-case and a number."><input className="in" type="password" autoComplete="new-password" value={nw} onChange={(e) => setNw(e.target.value)} /></Field>
    <button className="btn" disabled={a.busy || !cur || nw.length < 12} onClick={() => a.run(async () => { await api('/admin/me/password', { body: { currentPassword: cur, newPassword: nw } }); setOk(true); setCur(''); setNw(''); me.reload(); })}>Update password</button>
  </div>;
}

export default function Page() { return <Suspense fallback={<Spinner />}><Settings /></Suspense>; }
