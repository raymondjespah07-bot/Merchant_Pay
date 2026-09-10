import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentBusiness } from "@/lib/current-user";
import { auditMoney } from "@/lib/audit";

const PLAN_LIMITS: Record<string, number | null> = { BASIC: 5, FREE: 5, PLUS: 50, PRO: 200, PLATINUM: null };

export async function GET() {
  const context = await currentBusiness();
  if (!context) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  let subscription = await db.subscription.findUnique({ where: { businessId: context.business.id } });
  if (!subscription) subscription = await db.subscription.create({ data: { businessId: context.business.id, plan: "BASIC", status: "ACTIVE", maxInvoices: 5 } });
  const effectivePlan = (subscription.plan || "BASIC").toUpperCase();
  const limit = subscription.maxInvoices ?? PLAN_LIMITS[effectivePlan] ?? 5;
  const expired = !!subscription.expiresAt && subscription.expiresAt < new Date();
  const platform = await db.platformSettings.upsert({ where: { id: "platform" }, update: {}, create: { id: "platform" } });
  const prices = platform.testMode ? { BASIC: platform.basicTest, PLUS: platform.plusTest, PRO: platform.proTest, PLATINUM: platform.platinumTest } : { BASIC: platform.basicLive, PLUS: platform.plusLive, PRO: platform.proLive, PLATINUM: platform.platinumLive };
  return NextResponse.json({
    paymentMode: platform.testMode ? "TEST" : "LIVE",
    business: { id: context.business.id, name: context.business.name, phone: context.business.phone, mobileMoneyPhone: context.business.mobileMoneyPhone, mobileMoneyNetwork: context.business.mobileMoneyNetwork, currency: context.business.currency, logoData: context.business.logoData },
    preferences: { theme: context.user.theme || "indigo", appearance: context.user.appearance || "light" },
    subscription: { ...subscription, plan: effectivePlan, maxInvoices: limit, effectiveStatus: expired ? "EXPIRED" : subscription.status },
    plans: [
      { key: "BASIC", name: "Basic", price: prices.BASIC, limit: 5, description: "All core functionality with up to 5 invoices." },
      { key: "PLUS", name: "Plus", price: prices.PLUS, limit: 50, description: "Up to 50 invoices." },
      { key: "PRO", name: "Pro", price: prices.PRO, limit: 200, description: "Up to 200 invoices." },
      { key: "PLATINUM", name: "Platinum", price: prices.PLATINUM, limit: null, description: "Unlimited invoices." },
    ]
  });
}

export async function PATCH(request: Request) {
  const context = await currentBusiness();
  if (!context) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (context.business.suspended) return NextResponse.json({ error: "Your account is suspended. Contact the administrator.", code: "ACCOUNT_SUSPENDED" }, { status: 403 });
  try {
    const body = await request.json();
    const businessName = typeof body.businessName === "string" ? body.businessName.trim() : undefined;
    const phone = typeof body.phone === "string" ? body.phone.trim() : undefined;
    const mobileMoneyPhone = typeof body.mobileMoneyPhone === "string" ? body.mobileMoneyPhone.trim() : undefined;
    const mobileMoneyNetwork = typeof body.mobileMoneyNetwork === "string" ? body.mobileMoneyNetwork.trim().toUpperCase() : undefined;
    const currency = typeof body.currency === "string" ? body.currency.trim().toUpperCase() : undefined;
    const logoData = body.logoData === null || typeof body.logoData === "string" ? body.logoData : undefined;
    const theme = typeof body.theme === "string" ? body.theme : undefined;
    const appearance = typeof body.appearance === "string" ? body.appearance : undefined;
    if (businessName !== undefined && !businessName) return NextResponse.json({ error: "Business name is required." }, { status: 400 });
    if (mobileMoneyPhone !== undefined && mobileMoneyPhone && !/^\+?2567\d{8}$|^07\d{8}$/.test(mobileMoneyPhone.replace(/\s/g, ""))) return NextResponse.json({ error: "Mobile money phone number must be a valid Ugandan number." }, { status: 400 });
    if (mobileMoneyNetwork !== undefined && !["MTN","AIRTEL"].includes(mobileMoneyNetwork)) return NextResponse.json({ error: "Choose MTN Mobile Money or Airtel Money." }, { status: 400 });
    if (currency !== undefined && !/^[A-Z]{3}$/.test(currency)) return NextResponse.json({ error: "Currency must be a 3-letter code." }, { status: 400 });
    if (logoData !== undefined && logoData !== null) {
      if (!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(logoData)) return NextResponse.json({ error: "Logo must be a PNG, JPG or WebP image." }, { status: 400 });
      if (logoData.length > 1100000) return NextResponse.json({ error: "Logo is too large. Please use an image smaller than about 800 KB." }, { status: 400 });
    }
    if (theme !== undefined && !["indigo","emerald","violet","rose","amber"].includes(theme)) return NextResponse.json({ error: "Invalid theme." }, { status: 400 });
    if (appearance !== undefined && !["light","dark"].includes(appearance)) return NextResponse.json({ error: "Invalid appearance." }, { status: 400 });
    if (theme !== undefined || appearance !== undefined) await db.user.update({ where: { id: context.user.id }, data: { ...(theme !== undefined ? { theme } : {}), ...(appearance !== undefined ? { appearance } : {}) } });
    const business = await db.business.update({ where: { id: context.business.id }, data: { ...(businessName !== undefined ? { name: businessName } : {}), ...(phone !== undefined ? { phone: phone || null } : {}), ...(currency !== undefined ? { currency } : {}), ...(mobileMoneyPhone !== undefined ? { mobileMoneyPhone: mobileMoneyPhone || null } : {}), ...(mobileMoneyNetwork !== undefined ? { mobileMoneyNetwork: mobileMoneyNetwork || null } : {}), ...(logoData !== undefined ? { logoData } : {}) } });
    if (mobileMoneyPhone !== undefined && mobileMoneyPhone !== context.business.mobileMoneyPhone) await auditMoney({ actorUserId: context.user.id, actorType: "MERCHANT", action: "MERCHANT_PAYOUT_NUMBER_CHANGED", target: business.id, details: { businessId: business.id, oldPhone: context.business.mobileMoneyPhone, newPhone: mobileMoneyPhone || null } });
    return NextResponse.json({ ok: true, business });
  } catch (error) {
    console.error("Merchant settings update failed", error);
    return NextResponse.json({ error: "Unable to save settings." }, { status: 500 });
  }
}
