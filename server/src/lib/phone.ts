import { badRequest } from './errors.js';

/** Normalises Indian mobile numbers to E.164 (+91XXXXXXXXXX). Accepts 10 digits, 0-prefixed, 91/+91-prefixed. */
export function normalizeIndianPhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2)
    : digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits;
  if (!/^[6-9]\d{9}$/.test(local)) throw badRequest('Enter a valid 10-digit Indian mobile number.', 'INVALID_PHONE');
  return '+91' + local;
}
export const maskPhone = (p: string) => p.slice(0, 3) + ' ••••• ' + p.slice(-5);
