import type { z } from 'zod';
import { badRequest } from './errors.js';

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const first = r.error.issues[0];
    const field = first?.path.join('.');
    throw badRequest(field ? `${field}: ${first.message}` : first?.message ?? 'Invalid input', 'VALIDATION_ERROR', r.error.issues);
  }
  return r.data;
}
