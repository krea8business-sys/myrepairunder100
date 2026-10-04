'use client';
import { useEffect, useState } from 'react';
import { Field, Loadable, useAction, useApi, useToast } from '@/components/ui';
import { api, can } from '@/lib/api';

type S = Record<string, Record<string, any>>;
/**
 * One page of on/off switches. Each switch is stored in a settings section on the server, which enforces it;
 * the customer and technician apps read the same values and hide what is switched off (within ~15 seconds).
 */
const GROUPS: { title: string; note: string; items: [section: string, key: string, label: string, help: string][] }[] = [
  { title: 'Booking & payment', note: 'How customers book and pay.', items: [
    ['booking', 'asapEnabled', 'ASAP bookings', 'Customers can ask for a technician “as soon as possible” instead of a time slot.'],
    ['payments', 'payNowEnabled', 'Pay online before service', 'UPI / card / net banking at the time of booking.'],
    ['payments', 'payAfterServiceEnabled', 'Pay after service', 'Customer pays once the job is done.'],
    ['payments', 'cashEnabled', 'Cash to technician', 'Technician can mark the bill as paid in cash.'],
    ['features', 'coupons', 'Coupons', 'Coupon box at checkout and the Offers & coupons screen.'],
    ['features', 'wallet', 'Wallet', 'Wallet tab, wallet balance at checkout.'],
    ['referral', 'enabled', 'Refer & Earn', 'Refer tab, referral codes and rewards.'],
    ['tax', 'enabled', 'Add GST to bills', 'Rate and inclusive/exclusive are in Settings → Tax.'],
  ]},
  { title: 'During the job', note: 'What happens between booking and completion.', items: [
    ['assignment', 'autoAssign', 'Automatic technician assignment', 'Off = every booking waits for you to assign a technician in Bookings.'],
    ['features', 'liveTracking', 'Live technician tracking', 'Customers see the technician on a map while they travel.'],
    ['features', 'chat', 'In-app chat', 'Customer and technician can message each other during a job.'],
    ['booking', 'requireStartOtp', 'Start code', 'Technician must enter the 4-digit code from the customer’s app to start.'],
  ]},
  { title: 'After the job', note: '', items: [
    ['features', 'reviews', 'Ratings & reviews', '“Rate your technician” after completion.'],
    ['features', 'warrantyClaims', 'Warranty requests in app', 'Off = customers are asked to call you instead.'],
  ]},
  { title: 'Home screen', note: 'What the customer sees first.', items: [
    ['features', 'search', 'Search bar', '“What do you need repaired?” search.'],
    ['features', 'offersOnHome', 'Offer banners', 'Edit banners in Coupons & offers.'],
    ['features', 'popularOnHome', 'Popular services', 'Mark services as popular in Services.'],
    ['features', 'whyChooseUsOnHome', '“Why choose us”', 'Edit the points below.'],
  ]},
  { title: 'Technicians', note: '', items: [
    ['features', 'technicianSelfSignup', 'Technicians can sign up from the app', 'Off = only you can add technicians (Technicians → Add).'],
  ]},
];

export default function Features() {
  const q = useApi<S>('/admin/settings');
  const [draft, setDraft] = useState<S | null>(null);
  const a = useAction(); const t = useToast();
  const editable = can('settings.manage');
  useEffect(() => { if (q.data) setDraft(JSON.parse(JSON.stringify(q.data))); }, [q.data]);
  const set = (sec: string, key: string, v: unknown) => setDraft((d) => (d ? { ...d, [sec]: { ...d[sec], [key]: v } } : d));
  const changed = draft && q.data ? Object.keys(draft).filter((k) => JSON.stringify(draft[k]) !== JSON.stringify(q.data![k])) : [];
  const save = () => a.run(async () => {
    for (const sec of changed) await api(`/admin/settings/${sec}`, { method: 'PUT', body: draft![sec] });
    t.toast('Saved — the apps update within 15 seconds'); q.reload();
  });
  return <>
    <div className="head">
      <h1>Features</h1>
      <div className="row">{changed.length ? <span className="small muted">{changed.length} section(s) changed</span> : null}
        {editable ? <button className="btn" disabled={!changed.length || a.busy} onClick={save}>{a.busy ? 'Saving…' : 'Save changes'}</button> : <span className="small muted">Only a Super Admin can change features.</span>}</div>
    </div>
    <p className="muted" style={{ marginTop: -8 }}>Turn parts of the app on or off. No app update is needed: phones pick up the change the next time a screen loads.</p>
    {a.error ? <div className="alert bad">{a.error}</div> : null}
    <Loadable q={{ ...q, data: draft }}>{(d) => <>
      <div className="grid g2">
        {GROUPS.map((g) => (
          <div key={g.title} className="card">
            <h2 style={{ marginBottom: 2 }}>{g.title}</h2>{g.note ? <p className="muted small" style={{ marginTop: 0 }}>{g.note}</p> : null}
            {g.items.map(([sec, key, label, help]) => {
              const on = !!d[sec]?.[key];
              const id = `f-${sec}-${key}`;
              return (
                <div key={id} className="row sp" style={{ padding: '10px 0', borderTop: '1px solid var(--line)', alignItems: 'flex-start' }}>
                  <label htmlFor={id} style={{ flex: 1, cursor: editable ? 'pointer' : 'default' }}><b style={{ color: 'var(--ink)' }}>{label}</b><div className="small muted">{help}</div></label>
                  <button id={id} role="switch" aria-checked={on} disabled={!editable} onClick={() => set(sec, key, !on)}
                    style={{ width: 46, height: 26, borderRadius: 13, border: 0, padding: 3, cursor: editable ? 'pointer' : 'not-allowed', background: on ? 'var(--ok)' : '#CBD3E1', display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start', flexShrink: 0 }}>
                    <span style={{ width: 20, height: 20, borderRadius: 10, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.25)' }} />
                  </button>
                </div>
              );
            })}
          </div>
        ))}
        <div className="card">
          <h2>Texts in the customer app</h2>
          <Field label="Home notice (thin banner at top of home; leave empty to hide)" hint="e.g. Closed on 1 Nov for Diwali. Bookings open from 2 Nov."><input id="t-notice" className="in" disabled={!editable} maxLength={140} value={d.features.homeNotice} onChange={(e) => set('features', 'homeNotice', e.target.value)} /></Field>
          <Field label="Tagline (bottom of home, invoices)"><input id="t-tagline" className="in" disabled={!editable} value={d.company.tagline} onChange={(e) => set('company', 'tagline', e.target.value)} /></Field>
          <Field label="Search bar text"><input id="t-search" className="in" disabled={!editable} maxLength={60} value={d.features.searchPlaceholder} onChange={(e) => set('features', 'searchPlaceholder', e.target.value)} /></Field>
          <Field label="Refer & Earn banner title"><input id="t-refer" className="in" disabled={!editable} maxLength={80} value={d.features.referBannerTitle} onChange={(e) => set('features', 'referBannerTitle', e.target.value)} /></Field>
          <Field label="“Why choose us” points (one per line, up to 8)" hint="Only write things that are true for your business."><textarea id="t-why" className="in" disabled={!editable} rows={6} value={d.features.whyChooseUs.join('\n')} onChange={(e) => set('features', 'whyChooseUs', e.target.value.split('\n').map((x) => x.slice(0, 60)).slice(0, 8))} /></Field>
        </div>
      </div>
      <p className="small muted" style={{ marginTop: 16 }}>Prices, services, areas, coupons and payment limits have their own pages in the menu. Detailed rules (cancellation fee, wallet limits, referral amounts, assignment) are in Settings.</p>
    </>}</Loadable>
    {t.node}
  </>;
}
