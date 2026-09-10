import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentBusiness } from "@/lib/current-user";
import ItemClient from "./item-client";

export default async function ItemsPage() {
  const context = await currentBusiness();
  if (!context) redirect("/login");
  if (context.business.suspended) redirect("/dashboard/suspended");
  const items = await db.item.findMany({ where: { businessId: context.business.id }, orderBy: { createdAt: "desc" } });

  // Prisma Decimal cannot cross the Server -> Client Component boundary.
  const clientItems = items.map((item) => ({
    id: item.id,
    name: item.name,
    type: item.type as "PRODUCT" | "SERVICE",
    description: item.description,
    price: item.price.toString(),
    currency: item.currency,
    active: item.active,
    createdAt: item.createdAt.toISOString(),
  }));

  return <main className="dash">
    <aside className="side"><strong>MerchantPay</strong><nav className="nav">
      <Link href="/dashboard">Dashboard</Link><Link href="/dashboard/invoices">Invoices</Link><Link href="/dashboard/payments">Payments</Link>
      <Link href="/dashboard/customers">Customers</Link><Link className="active" href="/dashboard/items">Products &amp; Services</Link>
    <Link href="/dashboard/reports">Reports</Link><Link href="/dashboard/settings">Settings</Link></nav></aside>
    <section className="main">
      <div className="top"><div><p className="muted">{context.business.name}</p><h1>Products &amp; Services</h1>
      <p className="muted">Create reusable products and services for future invoices.</p></div>
      <form action="/api/logout" method="post"><button className="btn" type="submit">Sign out</button></form></div>
      <ItemClient initialItems={clientItems} defaultCurrency={context.business.currency || "UGX"} />
    </section>
  </main>;
}
