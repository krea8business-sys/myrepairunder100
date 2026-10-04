'use client';
import React, { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, label } from '@/lib/api';

export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true); setError(null);
    try { setData(await api<T>(path)); } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => { void load(); }, [load]);
  return { data, error, loading, reload: load, setData };
}

export const Spinner = () => <div className="spin" role="status" aria-label="Loading" />;
export const Empty = ({ children = 'Nothing here yet.' }: { children?: ReactNode }) => <div className="empty">{children}</div>;
export const ErrorBox = ({ message, onRetry }: { message: string; onRetry?: () => void }) => <div className="alert bad row sp">{message}{onRetry ? <button className="btn sm ghost" onClick={onRetry}>Retry</button> : null}</div>;

export function Loadable<T>({ q, children }: { q: { data: T | null; error: string | null; loading: boolean; reload: () => void }; children: (d: T) => ReactNode }) {
  if (q.error) return <ErrorBox message={q.error} onRetry={q.reload} />;
  if (!q.data) return <Spinner />;
  return <>{children(q.data)}</>;
}

const TONE: Record<string, string> = {
  COMPLETED: 'ok', PAID: 'ok', APPROVED: 'ok', VERIFIED: 'ok', REWARDED: 'ok', RESOLVED: 'ok', ACTIVE: 'ok', PROCESSED: 'ok', AVAILABLE: 'ok', CLOSED: 'mute',
  CANCELLED: 'bad', FAILED: 'bad', REJECTED: 'bad', SUSPENDED: 'bad', BLOCKED: 'bad', REFUNDED: 'mute', OFFLINE: 'mute',
  PENDING: 'warn', PAYMENT_PENDING: 'warn', PROCESSING: 'warn', REQUESTED: 'warn', OPEN: 'warn', PARTIALLY_REFUNDED: 'warn', BUSY: 'warn',
  TECHNICIAN_ON_THE_WAY: 'or', TECHNICIAN_ARRIVED: 'or', SERVICE_STARTED: 'or', IN_PROGRESS: 'or',
};
export const Badge = ({ s, text }: { s: string; text?: string }) => <span className={`badge ${TONE[s] ?? ''}`}>{text ?? label(s)}</span>;

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="row sp" style={{ marginBottom: 14 }}><h2 style={{ margin: 0 }}>{title}</h2><button className="btn sm ghost" onClick={onClose} aria-label="Close">✕</button></div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label: l, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="field"><span>{l}</span>{children}{hint ? <small>{hint}</small> : null}</label>;
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string][] }) {
  return <div className="tabs" role="tablist">{items.map(([k, l]) => <button key={k} role="tab" aria-selected={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>)}</div>;
}

export function Pager({ page, total, limit, onPage }: { page: number; total: number; limit: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return <div className="row sp" style={{ marginTop: 12 }}><span className="muted small">{total} total</span><div className="row">
    <button className="btn sm ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>← Prev</button><span className="small">Page {page} / {pages}</span><button className="btn sm ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next →</button>
  </div></div>;
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 2800); return () => clearTimeout(t); }, [msg]);
  return { toast: setMsg, node: msg ? <div className="toast" role="status">{msg}</div> : null };
}

/** Async action helper: runs fn, shows toast or error. */
export function useAction() {
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true); setError(null);
    try { return await fn(); } catch (e) { setError((e as Error).message); return undefined; } finally { setBusy(false); }
  };
  return { busy, error, setError, run };
}

// ───────────── Charts (dependency-free SVG) ─────────────
export function BarChart({ data, value, labelKey, format = (n) => String(n), height = 180, color = 'var(--blue)' }: { data: Record<string, unknown>[]; value: string; labelKey: string; format?: (n: number) => string; height?: number; color?: string }) {
  const max = Math.max(1, ...data.map((d) => Number(d[value])));
  const w = 100 / Math.max(1, data.length);
  return (
    <div>
      <svg viewBox={`0 0 100 ${height / 3}`} preserveAspectRatio="none" style={{ width: '100%', height }} role="img" aria-label="Bar chart">
        {data.map((d, i) => { const h = (Number(d[value]) / max) * (height / 3 - 2); return <rect key={i} x={i * w + w * 0.15} y={height / 3 - h} width={w * 0.7} height={Math.max(h, 0.3)} rx={0.6} fill={color}><title>{`${d[labelKey]}: ${format(Number(d[value]))}`}</title></rect>; })}
      </svg>
      <div className="row sp small muted" style={{ marginTop: 4 }}><span>{String(data[0]?.[labelKey] ?? '')}</span><span>{String(data.at(-1)?.[labelKey] ?? '')}</span></div>
    </div>
  );
}
export function HBars({ items, format = (n) => String(n) }: { items: { label: string; value: number }[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return <div style={{ display: 'grid', gap: 8 }}>{items.map((i) => (
    <div key={i.label}><div className="row sp small"><span>{i.label}</span><span className="b">{format(i.value)}</span></div>
      <div style={{ height: 8, background: 'var(--blue-t)', borderRadius: 6, marginTop: 4 }}><div style={{ height: 8, width: `${(i.value / max) * 100}%`, background: 'var(--orange)', borderRadius: 6 }} /></div></div>
  ))}</div>;
}
