import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await db.invoice.findFirst({
    where: { OR: [{ publicPaymentToken: id }, { id }] },
    include: { business: true, customer: true },
  });
  if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
  return NextResponse.json({
    invoice: {
      id: invoice.id,
      number: invoice.number,
      total: invoice.total.toString(),
      currency: invoice.currency,
      status: invoice.status,
      customer: invoice.customer ? { name: invoice.customer.name } : null,
      business: { name: invoice.business.name },
    },
  });
}
