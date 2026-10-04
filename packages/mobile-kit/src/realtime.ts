import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_URL, auth } from './api';

let socket: Socket | null = null;
let socketToken: string | null = null;

/** One shared, authenticated socket per app session. Reconnects with the latest access token. */
export function getSocket(): Socket | null {
  const token = auth.access;
  if (!token) return null;
  if (socket && socketToken === token) return socket;
  socket?.disconnect();
  socketToken = token;
  socket = io(API_URL, { auth: { token }, transports: ['websocket'], reconnectionDelayMax: 10_000 });
  return socket;
}
export function closeSocket() { socket?.disconnect(); socket = null; socketToken = null; }

/** Subscribe to events; optionally join a booking room. Handlers can change without resubscribing. */
export function useSocketEvents(handlers: Record<string, (payload: any) => void>, bookingId?: string | null) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    const names = Object.keys(ref.current);
    const fns = names.map((n) => [n, (p: unknown) => ref.current[n]?.(p)] as const);
    fns.forEach(([n, f]) => s.on(n, f));
    const join = () => { if (bookingId) s.emit('booking:join', bookingId); };
    join(); s.on('connect', join);
    return () => { fns.forEach(([n, f]) => s.off(n, f)); s.off('connect', join); if (bookingId) s.emit('booking:leave', bookingId); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, Object.keys(handlers).join('|')]);
}
