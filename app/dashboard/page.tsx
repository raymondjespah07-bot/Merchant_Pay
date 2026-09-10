import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import LiveMerchantBrand from "@/components/live-merchant-brand";

export default async function Dashboard() {
  const c = await cookies();
  const uid = c.get("merchantpay_session")?.value?.split(".")[0];
  if (!uid) redirect("/login");

  const m = await db.businessMember.findFirst({
    where: { userId: uid },
    include: { business: true, user: true },
  });
  if (!m) redirect("/onboarding");
  if (m.business.suspended) redirect("/dashboard/suspended");

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [invoices, payments, todayPayments, monthPayments] = await Promise.all([
    db.invoice.findMany({
      where: { businessId: m.business.id },
      select: { total: true, dueAt: true, status: true },
    }),
    db.payment.findMany({
      where: { businessId: m.business.id, status: "COMPLETED" },
      include: { invoice: { include: { customer: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    db.payment.aggregate({
      where: { businessId: m.business.id, status: "COMPLETED", createdAt: { gte: startOfToday } },
      _sum: { amount: true },
    }),
    db.payment.aggregate({
      where: { businessId: m.business.id, status: "COMPLETED", createdAt: { gte: startOfMonth } },
      _sum: { amount: true },
    }),
  ]);

  const completedPayments = await db.payment.aggregate({
    where: { businessId: m.business.id, status: "COMPLETED" },
    _sum: { amount: true },
  });

  const totalInvoiced = invoices.reduce((sum, invoice) => sum.plus(invoice.total), new Prisma.Decimal(0));
  const collected = completedPayments._sum.amount ?? new Prisma.Decimal(0);
  const awaiting = Prisma.Decimal.max(new Prisma.Decimal(0), totalInvoiced.minus(collected));
  const overdue = invoices
    .filter((invoice) => invoice.dueAt && invoice.dueAt < now && invoice.status !== "PAID" && invoice.status !== "CANCELLED")
    .reduce((sum, invoice) => sum.plus(invoice.total), new Prisma.Decimal(0));

  const money = (value: Prisma.Decimal | null | undefined) =>
    `${m.business.currency} ${Number(value ?? 0).toLocaleString()}`;

  return (
    <main className="dash">
      <aside className="side"><Link className="brand-link" href="/dashboard/profile"><LiveMerchantBrand name={m.business.name} logoData={m.business.logoData}/></Link><nav className="nav">
        <Link className="active" href="/dashboard">Dashboard</Link><Link href="/dashboard/invoices">Invoices</Link>
        <Link href="/dashboard/payments">Payments</Link><Link href="/dashboard/customers">Customers</Link>
        <Link href="/dashboard/items">Products</Link><Link href="/dashboard/reports">Reports</Link>{m.user.isAdmin&&<Link href="/admin">Admin panel</Link>}<Link href="/dashboard/settings">Settings</Link>
      </nav></aside>
      <section className="main">
        <div className="top"><div><p className="muted">{m.business.name}</p><h1>Good morning, {m.user.name?.split(" ")[0] ?? "Merchant"}</h1></div>
          <form action="/api/logout" method="post"><button className="btn" type="submit">Sign out</button></form></div>

        <section className="metrics dashboard-metrics">
          <div className="metric"><span className="muted">Collected</span><strong>{money(collected)}</strong><small className="muted">All completed payments</small></div>
          <div className="metric"><span className="muted">Awaiting</span><strong>{money(awaiting)}</strong><small className="muted">Estimated outstanding</small></div>
          <div className="metric"><span className="muted">Overdue</span><strong>{money(overdue)}</strong><small className="muted">Invoices past due</small></div>
          <div className="metric"><span className="muted">Today</span><strong>{money(todayPayments._sum.amount)}</strong><small className="muted">Payments received today</small></div>
          <div className="metric"><span className="muted">This month</span><strong>{money(monthPayments._sum.amount)}</strong><small className="muted">Payments received this month</small></div>
          <div className="metric"><span className="muted">Invoiced</span><strong>{money(totalInvoiced)}</strong><small className="muted">Total invoice value</small></div>
        </section>

        <section className="panel">
          <div className="section-heading"><div><h2>Recent payments</h2><p className="muted">Your latest completed collections.</p></div><Link className="btn" href="/dashboard/payments">View all</Link></div>
          {payments.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Date</th><th>Customer</th><th>Invoice</th><th>Method</th><th className="number">Amount</th></tr></thead><tbody>
            {payments.map((payment) => <tr key={payment.id}><td>{payment.createdAt.toLocaleDateString()}</td><td>{payment.invoice.customer?.name ?? "No customer"}</td><td><Link className="table-link" href={`/dashboard/invoices/${payment.invoiceId}`}>{payment.invoice.number}</Link></td><td>{payment.provider.replaceAll("_", " ")}</td><td className="number"><strong>{money(payment.amount)}</strong></td></tr>)}
          </tbody></table></div> : <div className="empty">No completed payments yet.</div>}
        </section>
      </section>
    </main>
  );
}
