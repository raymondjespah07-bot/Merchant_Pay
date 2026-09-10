import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentBusiness } from "@/lib/current-user";
import PaymentTable from "./payment-table";

export default async function PaymentsPage() {
  const context = await currentBusiness();
  if (!context) redirect("/login");
  if (context.business.suspended) redirect("/dashboard/suspended");
  const payments = await db.payment.findMany({ where: { businessId: context.business.id, status: "COMPLETED" }, include: { invoice: { include: { customer: true } } }, orderBy: { createdAt: "desc" } });
  const total = payments.reduce((sum,p)=>sum+Number(p.amount),0);
  return <main className="dash"><aside className="side"><strong>MerchantPay</strong><nav className="nav">
    <Link href="/dashboard">Dashboard</Link><Link href="/dashboard/invoices">Invoices</Link><Link className="active" href="/dashboard/payments">Payments</Link><Link href="/dashboard/customers">Customers</Link><Link href="/dashboard/items">Products &amp; Services</Link>
  <Link href="/dashboard/reports">Reports</Link><Link href="/dashboard/settings">Settings</Link></nav></aside><section className="main"><div className="top"><div><p className="muted">{context.business.name}</p><h1>Payments</h1><p className="muted">A clear history of money received through your normal payment methods.</p></div><form action="/api/logout" method="post"><button className="btn" type="submit">Sign out</button></form></div>
    <section className="metrics"><div className="metric"><span className="muted">Payments recorded</span><strong>{payments.length}</strong></div><div className="metric"><span className="muted">Total received</span><strong>{context.business.currency} {total.toLocaleString()}</strong></div></section>
    <section className="panel"><div className="section-heading"><div><h2>Payment history</h2><p className="muted">Newest completed payments appear first.</p></div></div>
      <PaymentTable payments={payments.map(p=>({id:p.id,date:p.createdAt.toISOString(),customer:p.invoice.customer?.name??"No customer",invoice:p.invoice.number,invoiceId:p.invoiceId,method:p.provider,reference:p.providerReference??"",amount:Number(p.amount),currency:p.currency}))}/>
    </section>
  </section></main>;
}
