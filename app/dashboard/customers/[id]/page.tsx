import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { currentBusiness } from "@/lib/current-user";

export default async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const context = await currentBusiness();
  if (!context) redirect("/login");
  if (context.business.suspended) redirect("/dashboard/suspended");
  const { id } = await params;
  const customer = await db.customer.findFirst({
    where: { id, businessId: context.business.id },
    include: {
      invoices: {
        include: { payments: { where: { status: "COMPLETED" }, orderBy: { createdAt: "desc" } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!customer) notFound();

  const payments = customer.invoices.flatMap((invoice) => invoice.payments.map((payment) => ({ ...payment, invoiceNumber: invoice.number, invoiceId: invoice.id })));
  payments.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const totalInvoiced = customer.invoices.reduce((sum, invoice) => sum.plus(invoice.total), new Prisma.Decimal(0));
  const totalPaid = payments.reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0));
  const outstanding = Prisma.Decimal.max(new Prisma.Decimal(0), totalInvoiced.minus(totalPaid));
  const money = (value: Prisma.Decimal | number) => `${context.business.currency} ${Number(value).toLocaleString()}`;

  return <main className="dash">
    <aside className="side"><strong>MerchantPay</strong><nav className="nav">
      <Link href="/dashboard">Dashboard</Link><Link href="/dashboard/invoices">Invoices</Link><Link href="/dashboard/payments">Payments</Link>
      <Link className="active" href="/dashboard/customers">Customers</Link><Link href="/dashboard/items">Products &amp; Services</Link>
    <Link href="/dashboard/reports">Reports</Link><Link href="/dashboard/settings">Settings</Link></nav></aside>
    <section className="main">
      <div className="top"><div><p className="muted">{context.business.name}</p><h1>{customer.name}</h1><p className="muted">Customer details &amp; financial activity</p></div>
        <form action="/api/logout" method="post"><button className="btn" type="submit">Sign out</button></form></div>
      <div className="detail-actions"><Link className="btn" href="/dashboard/customers">← Back to customers</Link></div>
      <section className="panel customer-detail">
        <div className="detail-item"><span className="muted">Name</span><strong>{customer.name}</strong></div>
        <div className="detail-item"><span className="muted">Phone</span><strong>{customer.phone || "Not provided"}</strong></div>
        <div className="detail-item"><span className="muted">Email</span><strong>{customer.email || "Not provided"}</strong></div>
        <div className="detail-item"><span className="muted">Notes</span><strong>{customer.notes || "No notes saved."}</strong></div>
        <div className="detail-item"><span className="muted">Customer since</span><strong>{customer.createdAt.toLocaleDateString()}</strong></div>
      </section>

      <section className="metrics customer-metrics">
        <div className="metric"><span className="muted">Total invoiced</span><strong>{money(totalInvoiced)}</strong></div>
        <div className="metric"><span className="muted">Total paid</span><strong>{money(totalPaid)}</strong></div>
        <div className="metric"><span className="muted">Outstanding</span><strong>{money(outstanding)}</strong></div>
      </section>

      <section className="panel"><div className="section-heading"><div><h2>Payment history</h2><p className="muted">Completed payments recorded for {customer.name}.</p></div></div>
        {payments.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Date</th><th>Invoice</th><th>Method</th><th>Reference</th><th className="number">Amount</th></tr></thead><tbody>
          {payments.map((payment) => <tr key={payment.id}><td>{payment.createdAt.toLocaleDateString()}</td><td><Link className="table-link" href={`/dashboard/invoices/${payment.invoiceId}`}>{payment.invoiceNumber}</Link></td><td>{payment.provider.replaceAll("_", " ")}</td><td>{payment.providerReference || "—"}</td><td className="number"><strong>{money(payment.amount)}</strong></td></tr>)}
        </tbody></table></div> : <div className="empty">No payments recorded for this customer yet.</div>}
      </section>

      <section className="panel"><div className="section-heading"><div><h2>Invoice history</h2><p className="muted">Every invoice belonging to this customer.</p></div></div>
        {customer.invoices.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Invoice</th><th>Date</th><th>Status</th><th className="number">Total</th></tr></thead><tbody>
          {customer.invoices.map((invoice) => { const paid=invoice.payments.reduce((s,p)=>s.plus(p.amount),new Prisma.Decimal(0)); const balance=Prisma.Decimal.max(new Prisma.Decimal(0),invoice.total.minus(paid)); return <tr key={invoice.id}><td><Link className="table-link" href={`/dashboard/invoices/${invoice.id}`}>{invoice.number}</Link></td><td>{invoice.createdAt.toLocaleDateString()}</td><td><span className="status-pill">{invoice.status}</span></td><td className="number"><strong>{money(invoice.total)}</strong><div className="muted small">Balance {money(balance)}</div></td></tr>; })}
        </tbody></table></div> : <div className="empty">No invoices for this customer yet.</div>}
      </section>
    </section>
  </main>;
}
