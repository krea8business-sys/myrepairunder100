import { api, secure } from '@kit';

let anon: string | null = null;
const queue: { name: string; props?: Record<string, string | number | boolean | null> }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

/** Batched, fire-and-forget product analytics (no PII in props). */
export function track(name: string, props?: Record<string, string | number | boolean | null>) {
  queue.push({ name, props });
  timer ??= setTimeout(flush, 3000);
}
async function flush() {
  timer = null;
  const events = queue.splice(0, 50);
  if (!events.length) return;
  anon ??= await secure.get('mru.deviceId');
  api('/analytics/events', { body: { anonymousId: anon ?? undefined, events } }).catch(() => undefined);
}
