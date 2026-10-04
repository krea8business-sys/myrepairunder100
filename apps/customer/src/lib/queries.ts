import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@kit';
import type * as T from './types';

export const qk = {
  home: ['home'] as const, config: ['config'] as const, category: (s: string) => ['category', s] as const, service: (id: string) => ['service', id] as const,
  cart: ['cart'] as const, addresses: ['addresses'] as const, bookings: (tab: string) => ['bookings', tab] as const, booking: (id: string) => ['booking', id] as const,
  wallet: ['wallet'] as const, walletTx: ['walletTx'] as const, referral: ['referral'] as const, notifications: ['notifications'] as const, offers: ['offers'] as const,
  slots: ['slots'] as const, me: ['me'] as const, tickets: ['tickets'] as const,
};

export const useHome = () => useQuery({ queryKey: qk.home, queryFn: () => api<T.Home>('/home', { auth: false }), staleTime: 15_000 });
export const useConfig = () => useQuery({ queryKey: qk.config, queryFn: () => api<T.AppConfig>('/config', { auth: false }), staleTime: 15_000, refetchInterval: 60_000 });
/** Feature switches from Admin → Features. Everything defaults to ON until the config has loaded. */
export function useFeatures() {
  const c = useConfig().data;
  const f = c?.features;
  return { testMode: !!c?.testMode, wallet: f?.wallet ?? true, coupons: f?.coupons ?? true, chat: f?.chat ?? true, liveTracking: f?.liveTracking ?? true, reviews: f?.reviews ?? true, warrantyClaims: f?.warrantyClaims ?? true, referEarn: f?.referEarn ?? true, search: f?.search ?? true };
}
export const useCategory = (slug: string) => useQuery({ queryKey: qk.category(slug), queryFn: () => api<T.CategoryDetail>(`/categories/${slug}`, { auth: false }), staleTime: 60_000 });
export const useService = (id: string) => useQuery({ queryKey: qk.service(id), queryFn: () => api<{ service: T.Service; category: { name: string; slug: string }; related: T.Service[] }>(`/services/${id}`, { auth: false }) });
export const useOffers = () => useQuery({ queryKey: qk.offers, queryFn: () => api<{ offers: T.Offer[]; coupons: T.CouponInfo[] }>('/offers', { auth: false }) });

export const useCart = (enabled = true) => useQuery({ queryKey: qk.cart, queryFn: () => api<T.Cart>('/me/cart'), enabled });
export function useCartMutations() {
  const qc = useQueryClient();
  const set = (data: T.Cart) => qc.setQueryData(qk.cart, data);
  return {
    add: useMutation({ mutationFn: (serviceId: string) => api<T.Cart>('/me/cart', { body: { serviceId, quantity: 1 } }), onSuccess: set }),
    setQty: useMutation({ mutationFn: (v: { serviceId: string; quantity: number }) => api<T.Cart>('/me/cart', { method: 'PUT', body: v }), onSuccess: set }),
    remove: useMutation({ mutationFn: (serviceId: string) => api<T.Cart>(`/me/cart/item/${serviceId}`, { method: 'DELETE' }), onSuccess: set }),
  };
}

export const useAddresses = () => useQuery({ queryKey: qk.addresses, queryFn: () => api<T.Address[]>('/me/addresses') });
export const useSlots = () => useQuery({ queryKey: qk.slots, queryFn: () => api<T.Slots>('/me/slots'), staleTime: 30_000 });
export const useBookings = (tab: string) => useQuery({ queryKey: qk.bookings(tab), queryFn: () => api<{ items: T.BookingSummary[] }>(`/bookings?tab=${tab}`) });
export const useBooking = (id: string) => useQuery({ queryKey: qk.booking(id), queryFn: () => api<T.Booking>(`/bookings/${id}`), refetchInterval: 30_000 });
export const useWallet = () => useQuery({ queryKey: qk.wallet, queryFn: () => api<T.Wallet>('/me/wallet') });
export const useWalletTx = () => useQuery({ queryKey: qk.walletTx, queryFn: () => api<{ items: T.WalletTxn[] }>('/me/wallet/transactions?limit=50') });
export const useReferral = () => useQuery({ queryKey: qk.referral, queryFn: () => api<T.Referral>('/me/referral') });
export const useNotifications = (enabled = true) => useQuery({ queryKey: qk.notifications, queryFn: () => api<{ items: T.Notification[]; unread: number }>('/me/notifications'), enabled, refetchInterval: 60_000 });
