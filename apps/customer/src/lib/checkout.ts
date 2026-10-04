import { useSyncExternalStore } from 'react';
import * as Crypto from 'expo-crypto';

/** In-memory checkout draft shared by Cart → Address → Slot → Review. */
export type Draft = { addressId?: string; date?: string; slotId?: string; slotLabel?: string; asap?: boolean; couponCode?: string | null; useWallet: boolean; problem?: string; paymentMode?: 'PAY_NOW' | 'PAY_AFTER_SERVICE'; requestId: string };
let draft: Draft = { useWallet: false, requestId: Crypto.randomUUID() };
const subs = new Set<() => void>();
export const checkout = {
  get: () => draft,
  set: (p: Partial<Draft>) => { draft = { ...draft, ...p }; subs.forEach((f) => f()); },
  reset: () => { draft = { useWallet: false, requestId: Crypto.randomUUID() }; subs.forEach((f) => f()); },
};
export const useCheckout = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, checkout.get, checkout.get);
