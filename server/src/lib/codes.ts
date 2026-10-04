import { sql } from 'drizzle-orm';
import type { Tx } from '../db/client.js';
import crypto from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
export const randomCode = (n: number) => Array.from({ length: n }, () => ALPHABET[crypto.randomInt(0, ALPHABET.length)]).join('');

/** Atomic sequential counter → e.g. TECH0007. */
export async function nextCounter(tx: Tx, name: string): Promise<number> {
  const r = await tx.execute<{ value: number }>(sql`
    INSERT INTO counters (name, value) VALUES (${name}, 1)
    ON CONFLICT (name) DO UPDATE SET value = counters.value + 1 RETURNING value`);
  return Number(r.rows[0].value);
}
export const bookingCode = () => 'MRU-' + randomCode(6);
export const ticketCode = () => 'TKT-' + randomCode(6);
export const referralCodeFor = () => 'MRU' + randomCode(5);
