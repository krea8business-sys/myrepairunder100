import { eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { notifications, pushTokens } from '../../db/schema.js';
import { push } from '../../providers/push.js';
import { emitToUser } from '../../realtime/io.js';
import { logger } from '../../lib/logger.js';

export type NotificationType =
  | 'BOOKING_CONFIRMED' | 'TECHNICIAN_ASSIGNED' | 'TECHNICIAN_ON_THE_WAY' | 'TECHNICIAN_ARRIVED' | 'SERVICE_STARTED'
  | 'SERVICE_COMPLETED' | 'ADDON_REQUESTED' | 'PAYMENT_SUCCESS' | 'PAYMENT_FAILED' | 'REFUND_PROCESSED'
  | 'REFERRAL_REWARD' | 'WALLET_CREDIT' | 'COUPON_AVAILABLE' | 'BOOKING_CANCELLED' | 'JOB_OFFER' | 'JOB_ASSIGNED'
  | 'SUPPORT_REPLY' | 'WARRANTY_UPDATE' | 'TECHNICIAN_APPROVED' | 'GENERAL' | 'CHAT_MESSAGE';

/** Stores the notification, pushes it in real time over the socket and to the device. Never throws. */
export async function notify(userId: string, type: NotificationType, title: string, body: string, data: Record<string, unknown> = {}) {
  try {
    const [n] = await db.insert(notifications).values({ userId, type, title, body, data }).returning();
    emitToUser(userId, 'notification', n);
    const tokens = await db.select({ token: pushTokens.token }).from(pushTokens).where(eq(pushTokens.userId, userId));
    if (tokens.length) {
      const { invalidTokens } = await push.send({ to: tokens.map((t) => t.token), title, body, data: { type, ...data } });
      if (invalidTokens.length) await db.delete(pushTokens).where(inArray(pushTokens.token, invalidTokens));
    }
  } catch (e) { logger.error(e, 'notify failed'); }
}
