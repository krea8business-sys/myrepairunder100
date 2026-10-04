'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Badge, Field, Loadable, Modal, Tabs, useAction, useApi, useToast } from '@/components/ui';
import { api, can, d, dt, inr } from '@/lib/api';

function Customer() {
  const id = useSearchParams().get('id') ?? '';
  const q = useApi<any>(`/admin/customers/${id}`);
  const [tab, setTab] = useState<'bookings' | 'wallet' | 'referrals' | 'tickets' | 'coupons'>('bookings');
  const [adj, setAdj] = useState(false); const [block, setBlock] = useState(false);
  const t = useToast();
  return <Loadable q={q}>{(c) => <>
    <div className="head">
      <div><Link href="/customers" className="small">← Customers</Link><h1>{c.name ?? 'Customer'}</h1><span className="muted">{c.phone} · joined {d(c.createdAt)}</span></div>
      <div className="row"><Badge s={c.status} />
        {can('wallet.adjust') ? <button className="btn sm" onClick={() => setAdj(true)}>Adjust wallet</button> : null}
        {can('customers.manage') ? <button className={`btn sm ${c.status === 'BLOCKED' ? 'sec' : 'danger'}`} onClick={() => setBlock(true)}>{c.status === 'BLOCKED' ? 'Unblock' : 'Block'}</button> : null}
      </div>
    </div>
    <div className="grid g4">
      <div className="card stat"><div className="k">Wallet balance</div><div className="v">{inr(c.walletBalance)}</div></div>
      <div className="card stat"><div className="k">Bookings</div><div className="v">{c.bookings.length}</div></div>
      <div className="card stat"><div className="k">Referral code</div><div className="v mono" style={{ fontSize: 18 }}>{c.referralCode}</div></div>
      <div className="card stat"><div className="k">Referred by</div><div className="v" style={{ fontSize: 16 }}>{c.referredBy ? <Badge s={c.referredBy.status} text={`${c.referredBy.code} · ${c.referredBy.status}`} /> : '—'}</div></div>
    </div>
    <div style={{ marginTop: 18 }}><Tabs value={tab} onChange={setTab} items={[['bookings', 'Bookings'], ['wallet', 'Wallet transactions'], ['referrals', 'Referrals made'], ['tickets', 'Support tickets'], ['coupons', 'Coupons used']]} /></div>
    <div className="tablewrap">
      {tab === 'bookings' ? <table className="t"><thead><tr><th>Booking</th><th>Services</th><th>Date</th><th>Status</th><th>Total</th></tr></thead><tbody>{c.bookings.map((b: any) => <tr key={b.id}><td><Link href={`/bookings/view?id=${b.id}`} className="mono">{b.code}</Link></td><td>{b.services}</td><td>{d(b.scheduledDate)}</td><td><Badge s={b.status} /></td><td>{inr(b.grandTotal)}</td></tr>)}</tbody></table>
      : tab === 'wallet' ? <table className="t"><thead><tr><th>ID</th><th>Type</th><th>Source</th><th>Amount</th><th>Balance after</th><th>Description</th><th>Date</th></tr></thead><tbody>{c.walletTransactions.map((w: any) => <tr key={w.id}><td className="mono">{w.id.slice(0, 8)}</td><td><Badge s={w.type === 'CREDIT' ? 'PAID' : 'PENDING'} text={w.type} /></td><td>{w.source}</td><td className="b">{w.type === 'CREDIT' ? '+' : '−'}{inr(w.amount)}</td><td>{inr(w.balanceAfter)}</td><td>{w.description}{w.createdByAdmin ? <span className="muted small"> (admin)</span> : null}</td><td>{dt(w.createdAt)}</td></tr>)}</tbody></table>
      : tab === 'referrals' ? <table className="t"><thead><tr><th>Friend</th><th>Status</th><th>Reward</th><th>Note</th><th>Date</th></tr></thead><tbody>{c.referralsMade.map((r: any) => <tr key={r.id}><td>{r.refereeName ?? '—'}</td><td><Badge s={r.status} /></td><td>{inr(r.reward)}</td><td className="small muted">{r.blockReason}</td><td>{d(r.createdAt)}</td></tr>)}</tbody></table>
      : tab === 'tickets' ? <table className="t"><thead><tr><th>Ticket</th><th>Subject</th><th>Category</th><th>Status</th><th>Created</th></tr></thead><tbody>{c.tickets.map((x: any) => <tr key={x.id}><td><Link href={`/support?ticket=${x.id}`} className="mono">{x.code}</Link></td><td>{x.subject}</td><td>{x.category}</td><td><Badge s={x.status} /></td><td>{d(x.createdAt)}</td></tr>)}</tbody></table>
      : <table className="t"><thead><tr><th>Code</th><th>Discount</th><th>Status</th><th>Date</th></tr></thead><tbody>{c.coupons.map((x: any, i: number) => <tr key={i}><td className="mono">{x.code}</td><td>{inr(x.discount)}</td><td><Badge s={x.status} /></td><td>{d(x.createdAt)}</td></tr>)}</tbody></table>}
    </div>
    <AdjustWallet open={adj} userId={c.id} onClose={() => setAdj(false)} onDone={() => { setAdj(false); t.toast('Wallet updated (audit logged)'); q.reload(); }} />
    <BlockModal open={block} id={c.id} blocked={c.status === 'BLOCKED'} onClose={() => setBlock(false)} onDone={() => { setBlock(false); q.reload(); }} />
    {t.node}
  </>}</Loadable>;
}

export function AdjustWallet({ open, userId, onClose, onDone }: { open: boolean; userId: string; onClose: () => void; onDone: () => void }) {
  const [type, setType] = useState<'CREDIT' | 'PROMO' | 'DEBIT'>('PROMO'); const [amt, setAmt] = useState(''); const [reason, setReason] = useState('');
  const [reqId] = useState(() => crypto.randomUUID()); const a = useAction();
  return <Modal open={open} onClose={onClose} title="Adjust wallet">
    {a.error ? <div className="alert bad">{a.error}</div> : null}
    <Field label="Type"><select className="in" value={type} onChange={(e) => setType(e.target.value as 'PROMO')}><option value="PROMO">Promotional credit (expires per wallet rules)</option><option value="CREDIT">Credit (no expiry)</option><option value="DEBIT">Debit</option></select></Field>
    <Field label="Amount (₹)"><input className="in" type="number" min={1} value={amt} onChange={(e) => setAmt(e.target.value)} /></Field>
    <Field label="Reason (visible to customer, recorded in audit log)"><input className="in" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" disabled={!Number(amt) || reason.length < 5 || a.busy} onClick={() => a.run(async () => { await api('/admin/wallet/adjust', { body: { userId, type, amountRupees: Number(amt), reason, requestId: reqId } }); onDone(); })}>Apply</button></div>
  </Modal>;
}
function BlockModal({ open, id, blocked, onClose, onDone }: { open: boolean; id: string; blocked: boolean; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState(''); const a = useAction();
  return <Modal open={open} onClose={onClose} title={blocked ? 'Unblock customer' : 'Block customer'}>
    {a.error ? <div className="alert bad">{a.error}</div> : null}
    <Field label="Reason (audit log)"><input className="in" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    <div className="row" style={{ justifyContent: 'flex-end' }}><button className={`btn ${blocked ? '' : 'danger'}`} disabled={reason.length < 3 || a.busy} onClick={() => a.run(async () => { await api(`/admin/customers/${id}/status`, { body: { status: blocked ? 'ACTIVE' : 'BLOCKED', reason } }); onDone(); })}>{blocked ? 'Unblock' : 'Block & sign out'}</button></div>
  </Modal>;
}

export default function Page() { return <Suspense fallback={null}><Customer /></Suspense>; }
