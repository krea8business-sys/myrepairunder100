export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}
export const badRequest = (msg: string, code = 'BAD_REQUEST', details?: unknown) => new AppError(400, code, msg, details);
export const unauthorized = (msg = 'Please log in again.') => new AppError(401, 'UNAUTHORIZED', msg);
export const forbidden = (msg = 'You do not have access to this.') => new AppError(403, 'FORBIDDEN', msg);
export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found.`);
export const conflict = (msg: string, code = 'CONFLICT') => new AppError(409, code, msg);
export const tooMany = (msg: string) => new AppError(429, 'RATE_LIMITED', msg);
