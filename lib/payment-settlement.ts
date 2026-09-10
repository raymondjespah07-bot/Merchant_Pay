import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { createPayout, executePayout, getPurchaseStatus, getPayoutStatus, normalizePaytotaNetwork, normalizeUgandaPhone } from '@/lib/paytota';
import { createLedgerEntry } from '@/lib/ledger';
import { auditMoney } from '@/lib/audit';

const HOLD_MS = 60 * 60 * 1000;
function decimal(value: unknown) { return new Prisma.Decimal(String(value ?? 0)); }

export async function queueMerchantPaymentPayout(paymentId: string) {
  const existing = await db.merchantPayout.findUnique({ where: { sourcePaymentId: paymentId } });
  if (existing) return existing;
  const payment = await db.payment.findUnique({ where: { id: paymentId }, include: { business: true, invoice: true } });
  if (!payment) throw new Error('PAYMENT_NOT_FOUND');
  if (payment.status !== 'COMPLETED') throw new Error('PAYMENT_NOT_VERIFIED');
  const holdUntil = new Date((payment.verifiedAt || new Date()).getTime() + HOLD_MS);
  if (!payment.business.mobileMoneyPhone || !payment.business.mobileMoneyNetwork) throw new Error('MERCHANT_PAYOUT_DETAILS_MISSING');
  const phone = normalizeUgandaPhone(payment.business.mobileMoneyPhone);
  const network = normalizePaytotaNetwork(payment.business.mobileMoneyNetwork);
  const payoutReference = `MP-PAYOUT-${payment.id}-${crypto.randomUUID()}`;
  try {
    return await db.merchantPayout.create({ data: {
      businessId: payment.businessId,
      sourcePaymentId: payment.id,
      phone,
      network: network === 'mtnmomo' ? 'MTN' : 'AIRTEL',
      amount: payment.amount,
      currency: payment.currency,
      provider: 'PAYTOTA',
      providerReference: payoutReference,
      status: 'HELD',
      holdUntil,
      reason: `Merchant settlement for invoice ${payment.invoice.number}${network ? ` via ${network}` : ''}`,
    }});
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && String((error as any).code) === 'P2002') return db.merchantPayout.findUniqueOrThrow({ where: { sourcePaymentId: payment.id } });
    throw error;
  }
}

async function completePayout(payoutId: string, providerData: any) {
  const payout = await db.merchantPayout.findUnique({ where: { id: payoutId }, include: { sourcePayment: { include: { invoice: true } } } });
  if (!payout || !payout.sourcePayment || payout.status === 'COMPLETED') return payout;
  const sourcePayment = payout.sourcePayment;
  const fee = decimal(providerData?.payment?.fee_amount ?? providerData?.fee_amount ?? providerData?.charge ?? 0);
  const providerTransactionId = providerData?.id ? String(providerData.id) : (payout.providerTransactionId || null);
  const updated = await db.$transaction(async tx => {
    const next = await tx.merchantPayout.update({ where: { id: payout.id }, data: { status: 'COMPLETED', providerTransactionId, fee, completedAt: new Date() } });
    await createLedgerEntry({ businessId: payout.businessId!, entryType: 'MERCHANT_PAYOUT', direction: 'DEBIT', amount: payout.amount, currency: payout.currency, invoiceId: sourcePayment.invoiceId, paymentId: payout.sourcePaymentId!, merchantPayoutId: payout.id, provider: 'PAYTOTA', providerReference: payout.providerReference, sourceId: `PAYOUT:${payout.id}`, description: `Merchant payout to ${next.phone}` }, tx);
    if (fee.gt(0)) await createLedgerEntry({ businessId: payout.businessId!, entryType: 'PAYOUT_FEE', direction: 'DEBIT', affectsMerchantBalance: false, amount: fee, currency: payout.currency, invoiceId: sourcePayment.invoiceId, paymentId: payout.sourcePaymentId!, merchantPayoutId: payout.id, provider: 'PAYTOTA', providerReference: payout.providerReference, sourceId: `PAYOUT_FEE:${payout.id}`, description: 'Paytota payout fee' }, tx);
    return next;
  });
  await auditMoney({ actorUserId: null, actorType: 'SYSTEM', action: 'MERCHANT_PAYOUT_COMPLETED', target: payout.id, details: { businessId: payout.businessId, paymentId: payout.sourcePaymentId, invoiceId: sourcePayment.invoiceId, amount: payout.amount.toString(), phone: updated?.phone, providerReference: payout.providerReference, providerTransactionId, fee: fee.toString() } });
  return updated;
}

export async function releaseMerchantPayout(payoutId: string) {
  const payout = await db.merchantPayout.findUnique({ where: { id: payoutId }, include: { business: true, sourcePayment: { include: { invoice: true } } } });
  if (!payout || !payout.sourcePayment || payout.status === 'COMPLETED') return payout;
  if (payout.status === 'HELD' && payout.holdUntil && payout.holdUntil > new Date()) return payout;
  if (!payout.phone || !payout.network) {
    const updated = await db.merchantPayout.update({ where: { id: payout.id }, data: { status: 'FAILED', errorMessage: 'Merchant mobile money payout number/network was not captured for this settlement.' } });
    await auditMoney({ actorUserId: null, actorType: 'SYSTEM', action: 'MERCHANT_PAYOUT_FAILED', target: payout.id, details: { businessId: payout.businessId, paymentId: payout.sourcePaymentId, error: updated.errorMessage } });
    return updated;
  }
  const reference = payout.providerReference;
  const claimed = await db.merchantPayout.updateMany({ where: { id: payout.id, status: { in: ['HELD', 'PENDING'] } }, data: { status: 'RELEASING' } });
  if (claimed.count === 0 && payout.status !== 'RELEASING') return db.merchantPayout.findUnique({ where: { id: payout.id } });
  try {
    const initiated = await createPayout({ amount: payout.amount.toString(), phone: payout.phone, network: normalizePaytotaNetwork(payout.network), reference, currency: payout.currency, reason: payout.reason || 'MerchantPay payout' });
    const providerId = initiated?.id ? String(initiated.id) : null;
    const executionUrl = initiated?.execution_url ? String(initiated.execution_url) : null;
    if (!providerId || !executionUrl) throw new Error('Paytota payout did not return an executable transaction.');
    const executed = await executePayout({ executionUrl });
    const status = String(executed?.status || executed?.detail || '').toLowerCase();
    await db.merchantPayout.update({ where: { id: payout.id }, data: { status: status === 'success' ? 'COMPLETED' : 'PENDING', providerTransactionId: providerId, holdUntil: null } });
    if (status === 'success') return completePayout(payout.id, executed);
    await auditMoney({ actorUserId: null, actorType: 'SYSTEM', action: 'MERCHANT_PAYOUT_INITIATED', target: payout.id, details: { businessId: payout.businessId, paymentId: payout.sourcePaymentId, amount: payout.amount.toString(), phone: payout.phone, providerReference: reference, providerTransactionId: providerId } });
    return db.merchantPayout.findUnique({ where: { id: payout.id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Paytota payout failed.';
    const updated = await db.merchantPayout.update({ where: { id: payout.id }, data: { status: 'FAILED', errorMessage: message, holdUntil: null } });
    await auditMoney({ actorUserId: null, actorType: 'SYSTEM', action: 'MERCHANT_PAYOUT_FAILED', target: payout.id, details: { businessId: payout.businessId, paymentId: payout.sourcePaymentId, invoiceId: payout.sourcePayment?.invoiceId, amount: payout.amount.toString(), phone: payout.phone, providerReference: reference, error: message } });
    return updated;
  }
}

export async function releaseDueMerchantPayouts(limit = 50) {
  const due = await db.merchantPayout.findMany({ where: { status: 'HELD', holdUntil: { lte: new Date() }, sourcePaymentId: { not: null } }, orderBy: { holdUntil: 'asc' }, take: limit, select: { id: true } });
  const results = [];
  for (const row of due) results.push(await releaseMerchantPayout(row.id));
  return results;
}

export async function verifyAndSettleInvoicePayment(reference: string, providerTransactionId?: string) {
  const payment = await db.payment.findFirst({ where: providerTransactionId ? { OR: [{ providerTransactionId }, { providerReference: reference }] } : { providerReference: reference }, include: { business: true, invoice: { include: { payments: true } } } });
  if (!payment) return { status: 'UNKNOWN_REFERENCE' as const };
  if (payment.status === 'COMPLETED') return { status: 'COMPLETED' as const, payout: await queueMerchantPaymentPayout(payment.id) };
  if (payment.status === 'FAILED') return { status: 'FAILED' as const };
  const provider = providerTransactionId ? await getPurchaseStatus(providerTransactionId) : null;
  const data = provider || {};
  const providerStatus = String(data.status || data.transaction_status || '').toLowerCase();
  if (providerStatus && !['paid','success','successful','completed'].includes(providerStatus)) {
    if (['error','failed','cancelled','canceled','rejected','declined','timeout','timed out'].includes(providerStatus)) {
      const failed = await db.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', pendingInvoiceId: null } });
      await auditMoney({ actorUserId: null, actorType: 'SYSTEM', action: 'CUSTOMER_PAYMENT_FAILED', target: failed.id, details: { businessId: failed.businessId, invoiceId: failed.invoiceId, paymentId: failed.id, amount: failed.amount.toString(), providerReference: reference, providerStatus } });
      return { status: 'FAILED' as const };
    }
    return { status: 'PENDING' as const };
  }
  const providerAmount = decimal(data?.payment?.amount ?? data?.amount);
  if (!providerAmount.eq(payment.amount)) throw new Error('PROVIDER_AMOUNT_MISMATCH');
  const completed = await db.$transaction(async tx => {
    const fresh = await tx.payment.findUnique({ where: { id: payment.id }, include: { invoice: { include: { payments: true } } } });
    if (!fresh) throw new Error('PAYMENT_NOT_FOUND');
    if (fresh.status === 'COMPLETED') return fresh;
    const paidBefore = fresh.invoice.payments.filter(p => p.status === 'COMPLETED').reduce((sum,p) => sum.plus(p.amount), new Prisma.Decimal(0));
    const outstanding = fresh.invoice.total.minus(paidBefore);
    if (!fresh.amount.gt(0) || fresh.amount.gt(outstanding)) throw new Error('PAYMENT_OUTSTANDING_MISMATCH');
    const now = new Date();
    const newPaid = paidBefore.plus(fresh.amount);
    const fullyPaid = newPaid.gte(fresh.invoice.total);
    const next = await tx.payment.update({ where: { id: fresh.id }, data: { status: 'COMPLETED', pendingInvoiceId: null, providerTransactionId: providerTransactionId || String(data.id || '') || null, verifiedAt: now } });
    await tx.invoice.update({ where: { id: fresh.invoiceId }, data: { status: fullyPaid ? 'PAID' : 'PARTIALLY_PAID', paidAt: fullyPaid ? now : null } });
    await createLedgerEntry({ businessId: fresh.businessId, entryType: 'CUSTOMER_PAYMENT', direction: 'CREDIT', amount: fresh.amount, currency: fresh.currency, invoiceId: fresh.invoiceId, paymentId: fresh.id, provider: 'PAYTOTA', providerReference: reference, sourceId: `PAYMENT:${fresh.id}`, description: `Verified customer payment for invoice ${fresh.invoice.number}` }, tx);
    return next;
  });
  await auditMoney({ actorUserId: null, actorType: 'SYSTEM', action: 'CUSTOMER_PAYMENT_VERIFIED', target: completed.id, details: { businessId: completed.businessId, invoiceId: completed.invoiceId, paymentId: completed.id, amount: completed.amount.toString(), providerReference: reference, providerTransactionId: completed.providerTransactionId } });
  return { status: 'COMPLETED' as const, payout: await queueMerchantPaymentPayout(completed.id) };
}

export async function completeMerchantPayoutFromProvider(providerId: string, providerData: any) {
  const payout = await db.merchantPayout.findFirst({ where: { providerTransactionId: providerId } });
  if (!payout) return null;
  const status = String(providerData?.status || providerData?.transaction_status || providerData?.event_type || '').toLowerCase();
  if (['success','completed','payout.success'].some(x => status.includes(x))) return completePayout(payout.id, providerData);
  if (['error','failed','payout.failed'].some(x => status.includes(x))) {
    const updated = await db.merchantPayout.update({ where: { id: payout.id }, data: { status: 'FAILED', errorMessage: String(providerData?.error?.message || providerData?.message || 'Paytota payout failed.'), holdUntil: null } });
    await auditMoney({ actorUserId: null, actorType: 'SYSTEM', action: 'MERCHANT_PAYOUT_FAILED', target: payout.id, details: { providerTransactionId: providerId, error: updated.errorMessage } });
    return updated;
  }
  return payout;
}
