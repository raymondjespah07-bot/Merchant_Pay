import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireActiveBusiness } from '@/lib/merchant-access';
import { db } from '@/lib/db';
import { createPurchase, executePurchase } from '@/lib/paytota';
import { auditMoney } from '@/lib/audit';

const limits: Record<string, number> = { BASIC: 5, FREE: 5, PLUS: 50, PRO: 200, PLATINUM: -1 };
export async function POST(req: Request) {
  const gate = await requireActiveBusiness();
  if (!gate.context) return gate.response;
  try {
    const { plan: rawPlan } = await req.json();
    const plan = String(rawPlan || '').toUpperCase();
    if (!(plan in limits)) return NextResponse.json({ error: 'Invalid plan.' }, { status: 400 });
    const platform = await db.platformSettings.upsert({ where: { id: 'platform' }, update: {}, create: { id: 'platform' } });
    const prices = platform.testMode ? { BASIC: platform.basicTest, PLUS: platform.plusTest, PRO: platform.proTest, PLATINUM: platform.platinumTest } : { BASIC: platform.basicLive, PLUS: platform.plusLive, PRO: platform.proLive, PLATINUM: platform.platinumLive };
    const amount = new Prisma.Decimal(prices[plan as keyof typeof prices] ?? 0);
    if (amount.lte(0)) return NextResponse.json({ error: 'This plan does not require a payment.' }, { status: 400 });
    const phone = gate.context.business.mobileMoneyPhone;
    if (!phone) return NextResponse.json({ error: 'Set your mobile money phone number before paying for a subscription.' }, { status: 400 });
    const pending = await db.subscriptionPayment.findFirst({ where: { businessId: gate.context.business.id, status: 'PENDING', provider: 'PAYTOTA' }, orderBy: { createdAt: 'desc' } });
    if (pending) return NextResponse.json({ ok: true, status: 'PENDING', paymentId: pending.id, reference: pending.providerReference, plan: pending.plan, amount: pending.amount.toString(), message: 'A subscription payment is already pending. Approve the mobile money prompt on your phone.' });
    const reference = `MP-SUB-${gate.context.business.id}-${crypto.randomUUID()}`;
    const payment = await db.subscriptionPayment.create({ data: { businessId: gate.context.business.id, plan, amount, currency: gate.context.business.currency, phone, provider: 'PAYTOTA', providerReference: reference, status: 'PENDING' } });
    try {
      const created = await createPurchase({ amount: amount.toString(), phone, reference, currency: gate.context.business.currency, description: `MerchantPay ${plan} subscription` });
      if (!created?.id) throw new Error('Paytota did not return a purchase transaction ID.');
      await executePurchase({ id: String(created.id), phone });
      await db.subscriptionPayment.update({ where: { id: payment.id }, data: { providerTransactionId: String(created.id) } });
      await auditMoney({ actorUserId: gate.context.user.id, actorType: 'MERCHANT', action: 'SUBSCRIPTION_PAYMENT_INITIATED', target: payment.id, details: { businessId: gate.context.business.id, subscriptionPaymentId: payment.id, plan, amount: amount.toString(), phone, providerReference: reference, providerTransactionId: String(created.id) } });
      return NextResponse.json({ ok: true, status: 'PENDING', paymentId: payment.id, reference, plan, amount: amount.toString(), message: 'Subscription payment request sent. Approve the mobile money prompt on your phone.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Paytota could not start the subscription payment.';
      await db.subscriptionPayment.update({ where: { id: payment.id }, data: { status: 'FAILED', errorMessage: message } });
      await auditMoney({ actorUserId: gate.context.user.id, actorType: 'MERCHANT', action: 'SUBSCRIPTION_PAYMENT_INITIATION_FAILED', target: payment.id, details: { businessId: gate.context.business.id, subscriptionPaymentId: payment.id, plan, amount: amount.toString(), phone, providerReference: reference, error: message } });
      return NextResponse.json({ error: message }, { status: 502 });
    }
  } catch (error) {
    console.error('Paytota subscription initiation failed', error);
    return NextResponse.json({ error: 'Unable to start subscription payment.' }, { status: 500 });
  }
}
