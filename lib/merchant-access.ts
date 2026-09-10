import { NextResponse } from 'next/server';
import { currentBusiness } from '@/lib/current-user';

export async function requireActiveBusiness() {
  const context = await currentBusiness();
  if (!context) return { context: null, response: NextResponse.json({ error: 'Not authenticated.' }, { status: 401 }) };
  if (context.business.suspended) return { context: null, response: NextResponse.json({ error: context.business.suspensionReason ? `Your account is suspended. ${context.business.suspensionReason}` : 'Your account is suspended. Contact the administrator.', code: 'ACCOUNT_SUSPENDED' }, { status: 403 }) };
  return { context, response: null };
}

export async function requireActiveOrThrow() {
  const context = await currentBusiness();
  if (!context) throw new Error('NOT_AUTHENTICATED');
  if (context.business.suspended) throw new Error('ACCOUNT_SUSPENDED');
  return context;
}
