import { db } from '@/lib/db';

export async function auditMoney(input: {
  action: string;
  actorUserId?: string | null;
  actorType?: string;
  target?: string;
  details: Record<string, unknown>;
}) {
  return db.adminAuditLog.create({ data: {
    adminId: input.actorType === 'ADMIN' ? input.actorUserId || null : null,
    actorUserId: input.actorUserId || null,
    actorType: input.actorType || 'MERCHANT',
    action: input.action,
    target: input.target,
    details: JSON.stringify(input.details),
  }});
}
