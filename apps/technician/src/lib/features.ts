import { useQuery } from '@tanstack/react-query';
import { api } from '@kit';

type Config = { testMode: boolean; features: { chat: boolean; liveTracking: boolean; technicianSelfSignup: boolean; cashPayment?: boolean } };
/** Feature switches from Admin → Features (everything ON until loaded). */
export function useFeatures() {
  const c = useQuery({ queryKey: ['config'], queryFn: () => api<Config>('/config', { auth: false }), staleTime: 15_000, refetchInterval: 60_000 }).data;
  const f = c?.features;
  return { testMode: !!c?.testMode, chat: f?.chat ?? true, liveTracking: f?.liveTracking ?? true, selfSignup: f?.technicianSelfSignup ?? true, cash: f?.cashPayment ?? true };
}
