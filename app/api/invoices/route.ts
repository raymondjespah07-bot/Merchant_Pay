import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentBusiness } from "@/lib/current-user";
import { Prisma } from "@prisma/client";

// Define strict interfaces for type safety
interface InvoiceItemInput {
  productId: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface DBInvoiceItem {
  id: string;
  invoiceId: string;
  productId: string | null;
  name: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  total: Prisma.Decimal;
}

interface DBInvoice {
  id: string;
  businessId: string;
  customerId: string | null;
  number: string;
  status: string;
  currency: string;
  subtotal: Prisma.Decimal;
  total: Prisma.Decimal;
  notes: string | null;
  dueAt: Date | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  customer?: unknown;
  items: DBInvoiceItem[];
}

function plain(i: DBInvoice) {
  return {
    ...i,
    subtotal: i.subtotal.toString(),
    total: i.total.toString(),
    dueAt: i.dueAt?.toISOString() ?? null,
    paidAt: i.paidAt?.toISOString() ?? null,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
    items: i.items.map((x) => ({
      ...x,
      unitPrice: x.unitPrice.toString(),
      total: x.total.toString(),
    })),
  };
}

async function nextNumber(
  businessId: string,
  client: Prisma.TransactionClient = db
): Promise<string> {
  let n = (await client.invoice.count({ where: { businessId } })) + 1;
  let x = `INV-${new Date().getFullYear()}-${String(n).padStart(4, "0")}`;

  while (await client.invoice.findFirst({ where: { businessId, number: x } })) {
    n++;
    x = `INV-${new Date().getFullYear()}-${String(n).padStart(4, "0")}`;
  }
  return x;
}

export async function GET() {
  const c = await currentBusiness();
  if (!c?.business?.id) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const rows = await db.invoice.findMany({
    where: { businessId: c.business.id },
    include: { customer: true, items: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ invoices: (rows as unknown as DBInvoice[]).map(plain) });
}

export async function POST(req: Request) {
  const c = await currentBusiness();
  if (!c?.business?.id) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (c.business.suspended) return NextResponse.json({ error: "Your account is suspended. Contact the administrator.", code: "ACCOUNT_SUSPENDED" }, { status: 403 });

  try {
    const subscription = await db.subscription.findUnique({ where: { businessId: c.business.id } });
    const plan = (subscription?.plan || "BASIC").toUpperCase();
    const limits: Record<string, number | null> = { BASIC: 5, FREE: 5, PLUS: 50, PRO: 200, PLATINUM: null };
    const maxInvoices = subscription?.maxInvoices ?? limits[plan] ?? 5;
    const effectiveExpired = !!subscription?.expiresAt && subscription.expiresAt < new Date();
    const effectiveStatus = effectiveExpired ? "EXPIRED" : (subscription?.status || "ACTIVE");
    if (effectiveStatus === "EXPIRED" || effectiveStatus === "CANCELLED") {
      return NextResponse.json({ error: "Your subscription has expired or is inactive. Renew your subscription to create new invoices." }, { status: 403 });
    }
    if (maxInvoices !== null) {
      const invoiceCount = await db.invoice.count({ where: { businessId: c.business.id } });
      if (invoiceCount >= maxInvoices) {
        return NextResponse.json({ error: `Your ${plan === "FREE" ? "Basic" : plan[0] + plan.slice(1).toLowerCase()} plan allows a maximum of ${maxInvoices} invoices. Upgrade your plan to create more invoices.`, code: "INVOICE_LIMIT_REACHED", limit: maxInvoices, used: invoiceCount }, { status: 403 });
      }
    }

    const b = (await req.json()) as {
      customerId?: string;
      currency?: string;
      notes?: string;
      dueAt?: string | null;
      items?: Array<{
        name?: string;
        quantity?: number | string;
        unitPrice?: number | string;
        productId?: string;
      }>;
    };

    const customerId = b.customerId ? String(b.customerId) : null;
    const currency = String(b.currency || c.business.currency || "UGX").toUpperCase();
    const notes = String(b.notes || "").trim();
    const dueAt = b.dueAt ? new Date(b.dueAt) : null;
    const raw = Array.isArray(b.items) ? b.items : [];

    if (!raw.length) {
      return NextResponse.json(
        { error: "At least one invoice item is required." },
        { status: 400 }
      );
    }

    if (customerId) {
      const customer = await db.customer.findFirst({
        where: { id: customerId, businessId: c.business.id },
      });
      if (!customer) {
        return NextResponse.json({ error: "Customer not found." }, { status: 404 });
      }
    }

    const items: InvoiceItemInput[] = [];

    for (const x of raw) {
      const name = String(x.name || "").trim();
      const quantity = Number(x.quantity);
      const unitPrice = Number(x.unitPrice);
      const productId = x.productId ? String(x.productId) : null;

      if (
        !name ||
        !Number.isFinite(quantity) ||
        !Number.isInteger(quantity) ||
        quantity <= 0 ||
        !Number.isFinite(unitPrice) ||
        unitPrice < 0
      ) {
        return NextResponse.json(
          { error: "Every invoice item must have a valid name, quantity and price." },
          { status: 400 }
        );
      }

      // Products & Services in MerchantPay are stored in the Item model.
      // The older Product model is not the catalog used by the current UI.
      // Validate the selected catalog item by business ownership, then keep
      // the invoice as a historical snapshot of its name/price.
      if (productId) {
        const catalogItem = await db.item.findFirst({
          where: { id: productId, businessId: c.business.id, active: true },
        });
        if (!catalogItem) {
          return NextResponse.json(
            { error: "Selected product/service not found." },
            { status: 404 }
          );
        }
      }

      items.push({
        // InvoiceItem.productId currently points at the legacy Product model.
        // Do not write an Item id into that foreign key.
        productId: null,
        name,
        quantity,
        unitPrice,
        total: Math.round(quantity * unitPrice * 100) / 100,
      });
    }

    const total = items.reduce((a, x) => a + x.total, 0);

    const inv = await db.$transaction(async (tx) => {
      const generatedNumber = await nextNumber(c.business.id, tx);
      return tx.invoice.create({
        data: {
          businessId: c.business.id,
          customerId,
          number: generatedNumber,
          status: "DRAFT",
          dueAt,
          notes: notes || null,
          currency,
          subtotal: new Prisma.Decimal(total.toFixed(2)),
          total: new Prisma.Decimal(total.toFixed(2)),
          items: {
            create: items.map((x) => ({
              productId: x.productId,
              name: x.name,
              quantity: x.quantity,
              unitPrice: new Prisma.Decimal(x.unitPrice.toFixed(2)),
              total: new Prisma.Decimal(x.total.toFixed(2)),
            })),
          },
        },
        include: { customer: true, items: true },
      });
    });

    return NextResponse.json(
      { ok: true, invoice: plain(inv as unknown as DBInvoice) },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("MerchantPay invoice creation failed:", error);

    let code: string | undefined;
    if (error && typeof error === "object" && "code" in error) {
      code = String((error as { code: unknown }).code);
    }

    const message =
      code === "P2021"
        ? "Invoice database tables are not available. Run the project's database push/migration command first."
        : code === "P2002"
        ? "An invoice number conflict occurred. Please try again."
        : "Unable to create invoice. Check the server console for the exact error.";

    return NextResponse.json(
      { error: message, code: process.env.NODE_ENV === "development" ? code : undefined },
      { status: 500 }
    );
  }
}

