'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { can, session, type Session } from '@/lib/api';

const NAV: { group: string; items: [string, string, string, string?][] }[] = [
  { group: 'Overview', items: [['/', 'Dashboard', '◧'], ['/reports', 'Reports & analytics', '◔', 'reports.view']] },
  { group: 'Operations', items: [['/bookings', 'Bookings', '▤'], ['/technicians', 'Technicians', '⚒'], ['/customers', 'Customers', '☺'], ['/support', 'Support tickets', '✉'], ['/warranty', 'Warranty', '⛨'], ['/reviews', 'Reviews', '★']] },
  { group: 'Catalog', items: [['/services', 'Categories, services & pricing', '❖', 'catalog.manage'], ['/areas', 'Service areas & pincodes', '⌖', 'areas.manage']] },
  { group: 'Growth & money', items: [['/coupons', 'Coupons & offers', '%', 'coupons.manage'], ['/wallet', 'Wallet', '₹'], ['/referrals', 'Referrals', '⇄', 'referrals.manage'], ['/payments', 'Payments & refunds', '▣', 'payments.view'], ['/notifications', 'Notifications', '⚑', 'notifications.send']] },
  { group: 'System', items: [['/features', 'Features (on/off)', '◐'], ['/settings', 'Settings', '⚙'], ['/audit', 'Audit logs', '☰', 'audit.view']] },
];

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter(); const path = usePathname();
  const [s, setS] = useState<Session | null>(null);
  useEffect(() => { const x = session.get(); if (!x) router.replace('/login'); else setS(x); }, [router]);
  if (!s) return null;
  return (
    <div className="shell">
      <nav className="side" aria-label="Main navigation">
        <div className="brand"><img src="/admin/logo-mark.png" alt="" width={34} height={28} />MyRepair<span>Under100</span></div>
        {NAV.map((g) => {
          const items = g.items.filter((i) => !i[3] || can(i[3]));
          if (!items.length) return null;
          return <div key={g.group}><div className="group">{g.group}</div>
            {items.map(([href, l, ic]) => <Link key={href} href={href} className={(href === '/' ? path === '/' : path.startsWith(href)) ? 'on' : ''}><span aria-hidden style={{ width: 16, textAlign: 'center' }}>{ic}</span>{l}</Link>)}
          </div>;
        })}
      </nav>
      <div className="main">
        <header className="top">
          <span className="muted small">Signed in as <b style={{ color: 'var(--ink)' }}>{s.admin.name}</b> · {s.admin.role.replace('_', ' ')}</span>
          <button className="btn sm ghost" onClick={() => { session.clear(); router.replace('/login'); }}>Sign out</button>
        </header>
        <main className="page">{children}</main>
      </div>
    </div>
  );
}
