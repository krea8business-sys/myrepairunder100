import type { Request } from 'express';
import { db, type Tx } from '../db/client.js';
import { auditLogs } from '../db/schema.js';

export async function audit(
  args: { req?: Request; actorType?: 'ADMIN' | 'SYSTEM' | 'CUSTOMER' | 'TECHNICIAN'; actorId?: string | null; action: string; entity: string; entityId?: string | null; before?: unknown; after?: unknown },
  tx: Tx = db,
) {
  await tx.insert(auditLogs).values({
    actorType: args.actorType ?? (args.req?.admin ? 'ADMIN' : 'SYSTEM'),
    actorId: args.actorId ?? args.req?.admin?.sub ?? null,
    action: args.action,
    entity: args.entity,
    entityId: args.entityId ?? null,
    before: (args.before ?? null) as never,
    after: (args.after ?? null) as never,
    ip: args.req?.ip ?? null,
  });
}
