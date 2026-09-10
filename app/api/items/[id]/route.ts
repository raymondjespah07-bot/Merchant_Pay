import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentBusiness } from "@/lib/current-user";

async function owned(id: string) {
  const context = await currentBusiness();
  if (!context) return { context: null, item: null };
  const item = await db.item.findFirst({ where: { id, businessId: context.business.id } });
  return { context, item };
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { context, item } = await owned(id);
  if (!context) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { context, item } = await owned(id);
  if (!context) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });
  if (context.business.suspended) return NextResponse.json({ error: "Your account is suspended. Contact the administrator.", code: "ACCOUNT_SUSPENDED" }, { status: 403 });

  const body = await request.json();
  const name = String(body.name ?? "").trim();
  const type = String(body.type ?? item.type);
  const description = String(body.description ?? "").trim();
  const price = Number(body.price);
  const currency = String(body.currency ?? item.currency).trim().toUpperCase();
  const active =
    body.active === true || body.active === "true" || body.active === "on" || body.active === 1 || body.active === "1";

  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  if (type !== "PRODUCT" && type !== "SERVICE") return NextResponse.json({ error: "Invalid item type." }, { status: 400 });
  if (!Number.isFinite(price) || price < 0) return NextResponse.json({ error: "Price must be valid and non-negative." }, { status: 400 });
  if (!/^[A-Z]{3}$/.test(currency)) return NextResponse.json({ error: "Currency must be a 3-letter code." }, { status: 400 });

  const updated = await db.item.update({
    where: { id },
    data: { name, type, description: description || null, price, currency, active }
  });
  return NextResponse.json({ ok: true, item: updated });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { context, item } = await owned(id);
  if (!context) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });
  if (context.business.suspended) return NextResponse.json({ error: "Your account is suspended. Contact the administrator.", code: "ACCOUNT_SUSPENDED" }, { status: 403 });
  await db.item.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
