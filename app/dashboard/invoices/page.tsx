import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentBusiness } from "@/lib/current-user";
import InvoiceClient from "./invoice-client";

export default async function Page() {
  const context = await currentBusiness();
  if (!context) redirect("/login");
  if (context.business.suspended) redirect("/dashboard/suspended");

  const [invoices, customers, items] = await Promise.all([
    db.invoice.findMany({
      where: { businessId: context.business.id },
      include: { customer: true, items: true },
      orderBy: { createdAt: "desc" }
    }),
    db.customer.findMany({
      where: { businessId: context.business.id },
      orderBy: { name: "asc" }
    }),
    db.item.findMany({
      where: { businessId: context.business.id, active: true },
      orderBy: { name: "asc" }
    })
  ]);

  const clientInvoices = invoices.map((invoice) => ({
    ...invoice,
    subtotal: invoice.subtotal.toString(),
    total: invoice.total.toString(),
    dueAt: invoice.dueAt ? invoice.dueAt.toISOString() : null,
    paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
    customer: invoice.customer
      ? {
          id: invoice.customer.id,
          name: invoice.customer.name,
          phone: invoice.customer.phone
        }
      : null,
    items: invoice.items.map((item) => ({
      ...item,
      quantity: String(item.quantity),
      unitPrice: item.unitPrice.toString(),
      total: item.total.toString()
    }))
  }));

  const clientItems = items.map((item) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    price: item.price.toString(),
    currency: item.currency,
    active: item.active
  }));

  return (
    <main className="dash">
      <aside className="side">
        <strong>MerchantPay</strong>
        <nav className="nav">
          <Link href="/dashboard">Dashboard</Link>
          <Link className="active" href="/dashboard/invoices">Invoices</Link>
          <Link href="/dashboard/payments">Payments</Link>
          <Link href="/dashboard/customers">Customers</Link>
          <Link href="/dashboard/items">Products &amp; Services</Link>
        <Link href="/dashboard/reports">Reports</Link><Link href="/dashboard/settings">Settings</Link></nav>
      </aside>

      <section className="main">
        <div className="top">
          <div>
            <p className="muted">{context.business.name}</p>
            <h1>Invoices</h1>
            <p className="muted">Create and manage what your customers owe.</p>
          </div>
          <form action="/api/logout" method="post">
            <button className="btn" type="submit">Sign out</button>
          </form>
        </div>

        <InvoiceClient
          initialInvoices={clientInvoices}
          customers={customers.map((customer) => ({
            id: customer.id,
            name: customer.name,
            phone: customer.phone
          }))}
          items={clientItems}
          currency={context.business.currency || "UGX"}
        />
      </section>
    </main>
  );
}
