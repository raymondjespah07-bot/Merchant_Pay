import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentBusiness } from "@/lib/current-user";

export async function GET(request: Request) {
  const context = await currentBusiness();
  if (!context) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const type = url.searchParams.get("type");
  const active = url.searchParams.get("active");

  const items = await db.item.findMany({
    where: {
      businessId: context.business.id,
      ...(q ? { OR: [
        { name: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } }
      ] } : {}),
      ...(type === "PRODUCT" || type === "SERVICE" ? { type } : {}),
      ...(active === "true" || active === "false" ? { active: active === "true" } : {})
    },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const context = await currentBusiness();
  if (!context) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (context.business.suspended) return NextResponse.json({ error: "Your account is suspended. Contact the administrator.", code: "ACCOUNT_SUSPENDED" }, { status: 403 });

  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const type = String(body.type ?? "PRODUCT");
    const description = String(body.description ?? "").trim();
    const price = Number(body.price);
    const currency = String(body.currency ?? context.business.currency ?? "UGX").trim().toUpperCase() || "UGX";

    if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
    if (type !== "PRODUCT" && type !== "SERVICE") return NextResponse.json({ error: "Invalid item type." }, { status: 400 });
    if (!Number.isFinite(price) || price < 0) return NextResponse.json({ error: "Price must be a valid non-negative number." }, { status: 400 });
    if (!/^[A-Z]{3}$/.test(currency)) return NextResponse.json({ error: "Currency must be a 3-letter code." }, { status: 400 });

    const item = await db.item.create({
      data: {
        businessId: context.business.id, name, type,
        description: description || null, price, currency,
        active: body.active !== false
      }
    });
    return NextResponse.json({ ok: true, item }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unable to create item." }, { status: 500 });
  }
}
