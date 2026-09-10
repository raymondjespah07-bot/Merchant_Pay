import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { currentBusiness } from "@/lib/current-user";
import { createLedgerEntry } from "@/lib/ledger";
import { auditMoney } from "@/lib/audit";

function money(value: Prisma.Decimal | number | string) {
  return new Prisma.Decimal(value).toDecimalPlaces(2);
}

function plainPayment(payment: any) {
  return {
    ...payment,
    amount: payment.amount.toString(),
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
    verifiedAt: payment.verifiedAt?.toISOString() ?? null,
  };
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await currentBusiness();
  if (!context) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await params;
  const invoice = await db.invoice.findFirst({
    where: { id, businessId: context.business.id },
    include: { payments: { orderBy: { createdAt: "desc" } } },
  });
  if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  return NextResponse.json({ payments: invoice.payments.map(plainPayment) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await currentBusiness();
  if (!context) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (context.business.suspended) return NextResponse.json({ error: "Your account is suspended. Contact the administrator.", code: "ACCOUNT_SUSPENDED" }, { status: 403 });

  try {
    const { id } = await params;
    const body = await request.json();
    const amount = money(body.amount);
    const provider = String(body.provider || "OTHER").trim().toUpperCase();
    const providerReference = body.providerReference ? String(body.providerReference).trim() : null;

    if (!amount.isFinite() || amount.lte(0)) {
      return NextResponse.json({ error: "Payment amount must be greater than zero." }, { status: 400 });
    }

    const allowedProviders = ["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "OTHER"];
    if (!allowedProviders.includes(provider)) {
      return NextResponse.json({ error: "Invalid payment method." }, { status: 400 });
    }

    const result = await db.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id, businessId: context.business.id },
        include: { payments: true },
      });
      if (!invoice) throw new Error("INVOICE_NOT_FOUND");
      if (invoice.status === "CANCELLED") throw new Error("INVOICE_CANCELLED");
      const pendingPaytota = invoice.payments.find(
        (payment) => payment.provider === "PAYTOTA" && payment.status === "PENDING"
      );
      if (pendingPaytota) throw new Error("PAYMENT_PENDING");

      const paid = invoice.payments
        .filter((p) => p.status === "COMPLETED")
        .reduce((sum, p) => sum.plus(p.amount), new Prisma.Decimal(0));
      const outstanding = invoice.total.minus(paid);
      if (amount.gt(outstanding)) throw new Error("PAYMENT_EXCEEDS_BALANCE");

      const payment = await tx.payment.create({
        data: {
          businessId: context.business.id,
          invoiceId: invoice.id,
          provider,
          providerReference,
          amount,
          currency: invoice.currency,
          status: "COMPLETED",
          verifiedAt: new Date(),
        },
      });

      await createLedgerEntry({ businessId: context.business.id, entryType: 'CUSTOMER_PAYMENT', direction: 'CREDIT', amount, currency: invoice.currency, invoiceId: invoice.id, paymentId: payment.id, provider, providerReference: providerReference || undefined, sourceId: `PAYMENT:${payment.id}`, description: `Recorded customer payment for invoice ${invoice.number}` }, tx);

      const newPaid = paid.plus(amount);
      const fullyPaid = newPaid.gte(invoice.total);
      const newStatus = fullyPaid
        ? "PAID"
        : newPaid.gt(0)
          ? "PARTIALLY_PAID"
          : (invoice.dueAt && invoice.dueAt < new Date() ? "OVERDUE" : invoice.status);

      const updatedInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: newStatus,
          paidAt: fullyPaid ? new Date() : null,
        },
        include: { customer: true, items: true, payments: { orderBy: { createdAt: "desc" } } },
      });

      return { payment, invoice: updatedInvoice, paid: newPaid, outstanding: updatedInvoice.total.minus(newPaid) };
    });

    await auditMoney({ actorUserId: context.user.id, actorType: 'MERCHANT', action: 'CUSTOMER_PAYMENT_RECORDED', target: result.payment.id, details: { businessId: context.business.id, invoiceId: id, paymentId: result.payment.id, amount: amount.toString(), provider, providerReference } });

    return NextResponse.json({
      ok: true,
      payment: plainPayment(result.payment),
      invoice: {
        id: result.invoice.id,
        status: result.invoice.status,
        paidAt: result.invoice.paidAt?.toISOString() ?? null,
        total: result.invoice.total.toString(),
      },
      paid: result.paid.toString(),
      outstanding: result.outstanding.toString(),
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "INVOICE_NOT_FOUND") return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    if (message === "INVOICE_CANCELLED") return NextResponse.json({ error: "Cancelled invoices cannot receive payments." }, { status: 400 });
    if (message === "PAYMENT_PENDING") return NextResponse.json({ error: "A mobile money payment is already pending for this invoice. Wait for it to complete or fail before recording another payment.", code: "PAYMENT_PENDING" }, { status: 409 });
    if (message === "PAYMENT_EXCEEDS_BALANCE") return NextResponse.json({ error: "Payment cannot be greater than the outstanding balance." }, { status: 400 });
    console.error("MerchantPay payment recording failed:", error);
    return NextResponse.json({ error: "Unable to record payment." }, { status: 500 });
  }
}
