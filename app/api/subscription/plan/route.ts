import { NextResponse } from 'next/server';
import { currentBusiness } from '@/lib/current-user';
import { db } from '@/lib/db';
import { auditMoney } from '@/lib/audit';

const limits: Record<string, number> = { BASIC: 5, FREE: 5, PLUS: 50, PRO: 200, PLATINUM: -1 };

export async function PATCH(req: Request) {
  const c = await currentBusiness();
  if (!c) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  if (c.business.suspended) return NextResponse.json({ error: 'Your account is suspended. Contact the administrator.', code: 'ACCOUNT_SUSPENDED' }, { status: 403 });
  const body = await req.json();
  const plan = String(body.plan || '').toUpperCase();
  const action = String(body.action || '').toLowerCase();
  if (!(plan in limits)) return NextResponse.json({ error: 'Invalid plan.' }, { status: 400 });
  const s = await db.subscription.findUnique({ where: { businessId: c.business.id } });
  if (!s) return NextResponse.json({ error: 'Subscription not found.' }, { status: 404 });
  const now = new Date();
  const expired = !!s.expiresAt && s.expiresAt <= now;
  const platform = await db.platformSettings.upsert({ where: { id: 'platform' }, update: {}, create: { id: 'platform' } });
  const prices = platform.testMode ? { BASIC: platform.basicTest, PLUS: platform.plusTest, PRO: platform.proTest, PLATINUM: platform.platinumTest } : { BASIC: platform.basicLive, PLUS: platform.plusLive, PRO: platform.proLive, PLATINUM: platform.platinumLive };
  const price = prices[plan as keyof typeof prices] ?? 0;

  if (action === 'renew' && !expired) return NextResponse.json({ error: 'This plan is still active and does not need renewal yet.' }, { status: 400 });
  if (action === 'renew' && s.plan.toUpperCase() !== plan) return NextResponse.json({ error: 'Renewal must use your current plan.' }, { status: 400 });
  if (price > 0) return NextResponse.json({ error: `Payment is required for ${plan}. Use the subscription payment flow.`, code: 'PAYMENT_REQUIRED', plan, amount: price }, { status: 402 });
  if (!expired && s.plan.toUpperCase() === plan) return NextResponse.json({ ok: true, plan, unchanged: true });
  const expiresAt = new Date(now.getTime() + (platform.testMode ? platform.testExpirationMinutes : platform.liveExpirationMinutes) * 60_000);
  const updated = await db.$transaction(async tx => {
    const next = await tx.subscription.update({ where: { businessId: c.business.id }, data: { plan, maxInvoices: limits[plan], status: 'ACTIVE', startsAt: now, expiresAt, lastRenewedAt: action === 'renew' ? now : s.lastRenewedAt, lastPlanChangedAt: action === 'renew' ? s.lastPlanChangedAt : now } });
    await tx.subscriptionPlanChange.create({ data: { businessId: c.business.id, subscriptionId: s.id, fromPlan: s.plan, toPlan: plan, changedAt: now, expiresAt, expirationMinutes: platform.testMode ? platform.testExpirationMinutes : platform.liveExpirationMinutes } });
    return next;
  });
  await auditMoney({ actorUserId: c.user.id, actorType: 'MERCHANT', action: action === 'renew' ? 'FREE_SUBSCRIPTION_RENEWED' : 'FREE_SUBSCRIPTION_CHANGED', target: updated.id, details: { businessId: c.business.id, fromPlan: s.plan, toPlan: plan, amount: '0', expiresAt: updated.expiresAt?.toISOString() || null } });
  return NextResponse.json({ ok: true, plan, expiresAt: updated.expiresAt?.toISOString() || null });
}
