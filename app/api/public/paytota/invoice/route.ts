import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { createPurchase, executePurchase, normalizeUgandaPhone } from '@/lib/paytota';
import { auditMoney } from '@/lib/audit';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const invoiceKey = String(body.invoiceId || '').trim();
    const phone = normalizeUgandaPhone(String(body.phone || ''));
    if (!/^2567\d{8}$/.test(phone)) return NextResponse.json({ error: 'Enter a valid Ugandan mobile money number.' }, { status: 400 });
    const invoice = await db.invoice.findFirst({ where: { OR: [{ publicPaymentToken: invoiceKey }, { id: invoiceKey }] }, include: { payments: true, business: true } });
    if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    if (invoice.business.suspended) return NextResponse.json({ error: 'This merchant account is currently suspended.' }, { status: 403 });
    if (!invoice.business.mobileMoneyPhone || !invoice.business.mobileMoneyNetwork) return NextResponse.json({ error: 'This merchant has not completed its Paytota payout setup yet.' }, { status: 409 });
    if (invoice.status === 'CANCELLED') return NextResponse.json({ error: 'Cancelled invoices cannot be paid.' }, { status: 400 });
    if (invoice.status === 'PAID') return NextResponse.json({ error: 'This invoice is already fully paid.' }, { status: 400 });
    const pending = invoice.payments.find(p => p.status === 'PENDING' && p.provider === 'PAYTOTA');
    if (pending) return NextResponse.json({ ok: true, status: 'PENDING', paymentId: pending.id, reference: pending.providerReference, message: 'A payment request is already pending for this invoice. Approve the mobile money prompt on your phone.' });
    const paid = invoice.payments.filter(p => p.status === 'COMPLETED').reduce((sum,p) => sum.plus(p.amount), new Prisma.Decimal(0));
    const outstanding = invoice.total.minus(paid);
    if (outstanding.lte(0)) return NextResponse.json({ error: 'This invoice is already fully paid.' }, { status: 400 });
    const reference = `MP-INV-${invoice.id}-${crypto.randomUUID()}`;
    let payment;
    try {
      payment = await db.payment.create({ data: { businessId: invoice.businessId, invoiceId: invoice.id, provider: 'PAYTOTA', providerReference: reference, amount: outstanding, currency: invoice.currency, status: 'PENDING', pendingInvoiceId: invoice.id } });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && String((error as any).code) === 'P2002') {
        const existing = await db.payment.findFirst({ where: { invoiceId: invoice.id, pendingInvoiceId: invoice.id, status: 'PENDING', provider: 'PAYTOTA' } });
        if (existing) return NextResponse.json({ ok: true, status: 'PENDING', paymentId: existing.id, reference: existing.providerReference, message: 'A payment request is already pending for this invoice.' });
      }
      throw error;
    }
    try {
      const created = await createPurchase({ amount: outstanding.toString(), phone, reference, currency: invoice.currency, description: `MerchantPay invoice ${invoice.number}` });
      if (!created?.id) throw new Error('Paytota did not return a purchase transaction ID.');
      const executed = await executePurchase({ id: String(created.id), phone });
      await db.payment.update({ where: { id: payment.id }, data: { providerTransactionId: String(created.id) } });
      await auditMoney({ actorUserId: null, actorType: 'CUSTOMER', action: 'CUSTOMER_PAYMENT_INITIATED', target: payment.id, details: { businessId: invoice.businessId, invoiceId: invoice.id, paymentId: payment.id, amount: outstanding.toString(), customerPhone: phone, providerReference: reference, providerTransactionId: String(created.id), providerStatus: executed?.status || 'pending_execute' } });
      return NextResponse.json({ ok: true, status: 'PENDING', paymentId: payment.id, reference, providerTransactionId: String(created.id), message: 'Payment request sent. Approve the mobile money prompt on your phone.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Paytota could not start the payment.';
      await db.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', pendingInvoiceId: null } });
      await auditMoney({ actorUserId: null, actorType: 'CUSTOMER', action: 'CUSTOMER_PAYMENT_INITIATION_FAILED', target: payment.id, details: { businessId: invoice.businessId, invoiceId: invoice.id, paymentId: payment.id, amount: outstanding.toString(), customerPhone: phone, providerReference: reference, error: message } });
      return NextResponse.json({ error: message }, { status: 502 });
    }
  } catch (error) {
    console.error('Paytota invoice payment initiation failed', error);
    return NextResponse.json({ error: 'Unable to start Paytota payment.' }, { status: 500 });
  }
}
