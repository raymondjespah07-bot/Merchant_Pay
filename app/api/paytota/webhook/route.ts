import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { verifyPaytotaWebhookSignature } from '@/lib/paytota';
import { verifyAndSettleInvoicePayment, completeMerchantPayoutFromProvider } from '@/lib/payment-settlement';
import { auditMoney } from '@/lib/audit';

const successStatuses = ['paid','success','successful','completed'];
const failedStatuses = ['error','failed','cancelled','canceled','rejected','declined','timeout','timed out'];

export async function POST(req: Request) {
  const raw = await req.text();
  try {
    if (!verifyPaytotaWebhookSignature(raw, req.headers.get('x-signature') || req.headers.get('paytota-signature'))) return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
    const body = JSON.parse(raw);
    const id = String(body.id || body.paytota_reference || body.transaction_id || '').trim();
    const reference = String(body.merchant_reference || body.reference || '').trim();
    const eventType = String(body.event_type || body.transaction_status || body.status || '').toLowerCase();
    const status = String(body.status || body.transaction_status || '').toLowerCase();
    if (!id && !reference) return NextResponse.json({ ok: true, ignored: true });

    if (eventType.includes('payout') || body.type === 'payout' || body.payment?.is_outgoing === true) {
      const payout = id ? await completeMerchantPayoutFromProvider(id, body) : null;
      if (payout) return NextResponse.json({ ok: true, payoutId: payout.id, status: payout.status });
      return NextResponse.json({ ok: true, ignored: true });
    }

    const invoicePayment = await db.payment.findFirst({ where: id ? { OR: [{ providerTransactionId: id }, ...(reference ? [{ providerReference: reference }] : [])] } : { providerReference: reference } });
    if (invoicePayment) {
      const amount = new Prisma.Decimal(String(body.payment?.amount ?? body.amount ?? 0));
      if (!amount.eq(invoicePayment.amount)) return NextResponse.json({ error: 'Amount mismatch.' }, { status: 422 });
      if (successStatuses.includes(status) || eventType.includes('purchase.paid')) {
        const result = await verifyAndSettleInvoicePayment(invoicePayment.providerReference || reference, id || invoicePayment.providerTransactionId || undefined);
        return NextResponse.json({ ok: true, result });
      }
      if (failedStatuses.includes(status) || eventType.includes('payment_failure') || eventType.includes('cancelled')) {
        const failed = await db.payment.update({ where: { id: invoicePayment.id }, data: { status: 'FAILED', pendingInvoiceId: null } });
        await auditMoney({ actorUserId: null, actorType: 'SYSTEM', action: 'CUSTOMER_PAYMENT_FAILED', target: failed.id, details: { businessId: failed.businessId, invoiceId: failed.invoiceId, paymentId: failed.id, amount: failed.amount.toString(), providerReference: failed.providerReference, providerTransactionId: id, providerStatus: status || eventType } });
        return NextResponse.json({ ok: true, status: 'FAILED' });
      }
      return NextResponse.json({ ok: true, status: 'PENDING' });
    }

    const subscriptionPayment = await db.subscriptionPayment.findFirst({ where: id ? { OR: [{ providerTransactionId: id }, ...(reference ? [{ providerReference: reference }] : [])] } : { providerReference: reference } });
    if (subscriptionPayment) return handleSubscriptionWebhook(subscriptionPayment.id, id, reference, body);
    return NextResponse.json({ ok: true, ignored: true });
  } catch (error) {
    console.error('Paytota webhook processing failed', error);
    return NextResponse.json({ error: 'Unable to process payment notification.' }, { status: 500 });
  }
}

async function handleSubscriptionWebhook(paymentId: string, providerId: string, reference: string, body: any) {
  const payment = await db.subscriptionPayment.findUnique({ where: { id: paymentId }, include: { business: true } });
  if (!payment) return NextResponse.json({ ok: true, ignored: true });
  const status = String(body.status || body.transaction_status || body.event_type || '').toLowerCase();
  if (failedStatuses.some(s => status.includes(s)) || status.includes('payment_failure')) {
    const failed = await db.subscriptionPayment.update({ where: { id: payment.id }, data: { status: 'FAILED', errorMessage: `Paytota status: ${status}` } });
    await auditMoney({ actorUserId: null, actorType: 'SYSTEM', action: 'SUBSCRIPTION_PAYMENT_FAILED', target: failed.id, details: { businessId: failed.businessId, subscriptionPaymentId: failed.id, plan: failed.plan, amount: failed.amount.toString(), providerReference: reference || failed.providerReference, providerTransactionId: providerId, providerStatus: status } });
    return NextResponse.json({ ok: true, status: 'FAILED' });
  }
  if (!successStatuses.some(s => status.includes(s)) && !status.includes('purchase.paid')) return NextResponse.json({ ok: true, status: 'PENDING' });
  const amount = new Prisma.Decimal(String(body.payment?.amount ?? body.amount ?? 0));
  if (!amount.eq(payment.amount)) return NextResponse.json({ error: 'Amount mismatch.' }, { status: 422 });
  const platform = await db.platformSettings.upsert({ where: { id: 'platform' }, update: {}, create: { id: 'platform' } });
  const minutes = platform.testMode ? platform.testExpirationMinutes : platform.liveExpirationMinutes;
  const now = new Date();
  const limits: Record<string, number> = { BASIC: 5, FREE: 5, PLUS: 50, PRO: 200, PLATINUM: -1 };
  await db.$transaction(async tx => {
    const fresh = await tx.subscriptionPayment.findUnique({ where: { id: payment.id } });
    if (!fresh || fresh.status === 'COMPLETED') return;
    await tx.subscriptionPayment.update({ where: { id: fresh.id }, data: { status: 'COMPLETED', providerTransactionId: providerId || fresh.providerTransactionId, completedAt: now } });
    const sub = await tx.subscription.findUnique({ where: { businessId: fresh.businessId } });
    const fromPlan = sub?.plan || 'BASIC';
    const expiresAt = new Date(now.getTime() + minutes * 60_000);
    let subscriptionId = sub?.id;
    if (sub) await tx.subscription.update({ where: { businessId: fresh.businessId }, data: { plan: fresh.plan, maxInvoices: limits[fresh.plan] ?? 5, status: 'ACTIVE', startsAt: now, expiresAt, lastRenewedAt: now, lastPlanChangedAt: fresh.plan !== fromPlan ? now : sub.lastPlanChangedAt } });
    else { const created = await tx.subscription.create({ data: { businessId: fresh.businessId, plan: fresh.plan, maxInvoices: limits[fresh.plan] ?? 5, status: 'ACTIVE', startsAt: now, expiresAt, lastRenewedAt: now } }); subscriptionId = created.id; }
    await tx.subscriptionPlanChange.create({ data: { businessId: fresh.businessId, subscriptionId: subscriptionId!, fromPlan, toPlan: fresh.plan, changedAt: now, expiresAt, expirationMinutes: minutes } });
    await tx.ledgerEntry.create({ data: { businessId: fresh.businessId, entryType: 'SUBSCRIPTION_REVENUE', direction: 'CREDIT', affectsMerchantBalance: false, amount: fresh.amount, currency: fresh.currency, subscriptionPaymentId: fresh.id, provider: 'PAYTOTA', providerReference: fresh.providerReference, sourceId: `SUBSCRIPTION:${fresh.id}`, description: `MerchantPay ${fresh.plan} subscription payment` } });
  });
  await auditMoney({ actorUserId: null, actorType: 'SYSTEM', action: 'SUBSCRIPTION_PAYMENT_COMPLETED', target: payment.id, details: { businessId: payment.businessId, subscriptionPaymentId: payment.id, plan: payment.plan, amount: payment.amount.toString(), providerReference: reference || payment.providerReference, providerTransactionId: providerId } });
  return NextResponse.json({ ok: true, status: 'COMPLETED' });
}
