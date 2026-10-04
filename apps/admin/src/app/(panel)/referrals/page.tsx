'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Badge, Loadable, Tabs, useAction, useApi } from '@/components/ui';
import { api, d, inr } from '@/lib/api';

export default function Referrals() {
  const [status, setStatus] = useState<'' | 'PENDING' | 'REWARDED' | 'BLOCKED'>('');
  const q = useApi<any>(`/admin/referrals${status ? `?status=${status}` : ''}`, [status]); const a = useAction();
  return <>
    <div className="head"><h1>Referrals</h1><Link className="btn ghost" href="/settings?tab=referral">Edit referral rules</Link></div>
    {a.error ? <div className="alert bad">{a.error}</div> : null}
    <Loadable q={q}>{(x) => <>
      <div className="grid g4">
        <div className="card stat"><div className="k">Total referrals</div><div className="v">{x.stats.total}</div></div>
        <div className="card stat"><div className="k">Successful</div><div className="v">{x.stats.successful}</div></div>
        <div className="card stat"><div className="k">Pending (awaiting first service)</div><div className="v">{x.stats.pending}</div></div>
        <div className="card stat"><div className="k">Rewards issued</div><div className="v">{inr(x.stats.rewardsIssued)}</div><div className="small muted">{x.stats.blocked} blocked as suspicious</div></div>
      </div>
      <div className="card" style={{ margin: '14px 0' }}><b>Current rules:</b> referrer {inr(x.rules.referrerRewardPaise)}, friend {inr(x.rules.refereeRewardPaise)}, after first completed booking ≥ {inr(x.rules.minBookingValuePaise)}, max {x.rules.monthlyLimit}/month per referrer, rewards expire in {x.rules.rewardExpiryDays} days, same-device block {x.rules.blockSameDevice ? 'on' : 'off'}. {x.rules.enabled ? '' : <Badge s="FAILED" text="Program paused" />}</div>
      <Tabs value={status} onChange={setStatus} items={[['', 'All'], ['PENDING', 'Pending'], ['REWARDED', 'Rewarded'], ['BLOCKED', 'Blocked']]} />
      <div className="tablewrap"><table className="t"><thead><tr><th>Referrer</th><th>Friend</th><th>Code</th><th>Status</th><th>Rewards</th><th>Note</th><th>Date</th><th /></tr></thead><tbody>
        {x.items.map((r: any) => <tr key={r.id}><td><Link href={`/customers/view?id=${r.referrerId}`}>{r.referrerName ?? r.referrerPhone}</Link></td><td><Link href={`/customers/view?id=${r.refereeId}`}>{r.refereeName ?? r.refereePhone}</Link></td><td className="mono">{r.code}</td><td><Badge s={r.status} /></td>
          <td>{r.status === 'REWARDED' ? `${inr(r.referrerReward)} + ${inr(r.refereeReward)}` : '—'}</td><td className="small muted">{r.blockReason}</td><td>{d(r.createdAt)}</td>
          <td>{r.status === 'PENDING' ? <button className="btn sm danger" onClick={() => { const reason = prompt('Reason for blocking (fraud, duplicate…)'); if (reason) a.run(async () => { await api(`/admin/referrals/${r.id}/block`, { body: { reason } }); q.reload(); }); }}>Block</button> : r.status === 'BLOCKED' ? <button className="btn sm ghost" onClick={() => a.run(async () => { await api(`/admin/referrals/${r.id}/unblock`, { body: {} }); q.reload(); })}>Unblock</button> : null}</td></tr>)}
      </tbody></table></div>
    </>}</Loadable>
  </>;
}
