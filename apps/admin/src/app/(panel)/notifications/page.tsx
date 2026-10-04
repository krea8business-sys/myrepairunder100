'use client';
import { useState } from 'react';
import { Field, useAction, useToast } from '@/components/ui';
import { api } from '@/lib/api';

export default function Notifications() {
  const [x, setX] = useState({ audience: 'ALL_CUSTOMERS', type: 'COUPON_AVAILABLE', title: '', body: '' }); const a = useAction(); const t = useToast();
  return <>
    <div className="head"><h1>Notifications</h1></div>
    <div className="grid g2">
      <div className="card">
        <h2>Send a broadcast</h2>
        {a.error ? <div className="alert bad">{a.error}</div> : null}
        <Field label="Audience"><select className="in" value={x.audience} onChange={(e) => setX({ ...x, audience: e.target.value })}><option value="ALL_CUSTOMERS">All customers</option><option value="ALL_TECHNICIANS">All technicians</option></select></Field>
        <Field label="Type"><select className="in" value={x.type} onChange={(e) => setX({ ...x, type: e.target.value })}><option value="COUPON_AVAILABLE">Coupon / offer</option><option value="GENERAL">General announcement</option></select></Field>
        <Field label="Title"><input className="in" maxLength={120} value={x.title} onChange={(e) => setX({ ...x, title: e.target.value })} placeholder="e.g. Summer AC service — 10% off" /></Field>
        <Field label="Message" hint={`${x.body.length}/300`}><textarea className="in" maxLength={300} value={x.body} onChange={(e) => setX({ ...x, body: e.target.value })} /></Field>
        <button className="btn" disabled={a.busy || x.title.length < 3 || x.body.length < 3} onClick={() => a.run(async () => { if (!confirm('Send this to everyone in the audience?')) return; const r = await api<{ queued: number }>('/admin/notifications/broadcast', { body: x }); t.toast(`Queued for ${r.queued} users`); setX({ ...x, title: '', body: '' }); })}>Send push + in-app</button>
      </div>
      <div className="card">
        <h2>Automatic notifications</h2>
        <p className="muted">Sent by the system as push + in-app (stored in the database):</p>
        <ul className="small" style={{ lineHeight: 1.9 }}>
          <li>Booking confirmed · Technician assigned · Technician on the way / arrived</li><li>Service started · Service completed / payment due · Additional work request</li>
          <li>Payment successful / failed · Refund processed</li><li>Referral reward received · Wallet credit · Warranty decision · Support replies</li>
          <li>Technicians: new job request, job assigned, job cancelled, approval</li>
        </ul>
        <p className="small muted">SMS/WhatsApp for these can be enabled by adding a template-based provider in <span className="mono">server/src/providers/sms.ts</span> (DLT-registered templates are required in India).</p>
      </div>
    </div>
    {t.node}
  </>;
}
