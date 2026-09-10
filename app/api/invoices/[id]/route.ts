import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentBusiness } from "@/lib/current-user";

function plain(invoice: any) {
  return {
    ...invoice,
    subtotal: invoice.subtotal.toString(),
    total: invoice.total.toString(),
    dueAt: invoice.dueAt ? invoice.dueAt.toISOString() : null,
    paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
    items: invoice.items.map((item: any) => ({
      ...item,
      quantity: String(item.quantity),
      unitPrice: item.unitPrice.toString(),
      total: item.total.toString()
    }))
  };
}

async function owned(id: string) {
  const context = await currentBusiness();
  if (!context) return { context: null, invoice: null };
  const invoice = await db.invoice.findFirst({
    where: { id, businessId: context.business.id },
    include: { customer: true, items: true }
  });
  return { context, invoice };
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { context, invoice } = await owned(id);
  if (!context) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  return NextResponse.json({ invoice: plain(invoice) });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { context, invoice } = await owned(id);
  if (!context) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  if (context.business.suspended) return NextResponse.json({ error: "Your account is suspended. Contact the administrator.", code: "ACCOUNT_SUSPENDED" }, { status: 403 });

  const body = await request.json();
  const allowed = ["DRAFT", "SENT", "PAID", "PARTIALLY_PAID", "OVERDUE", "CANCELLED"];
  const status = String(body.status ?? invoice.status);
  if (!allowed.includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const updated = await db.invoice.update({
    where: { id },
    data: { status },
    include: { customer: true, items: true }
  });

  return NextResponse.json({ ok: true, invoice: plain(updated) });
}
