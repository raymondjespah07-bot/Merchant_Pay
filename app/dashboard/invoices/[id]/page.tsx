import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentBusiness } from "@/lib/current-user";
import PaymentClient from "./payment-client";

export default async function Page({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await currentBusiness();
  if (!context) redirect("/login");
  if (context.business.suspended) redirect("/dashboard/suspended");

  const { id } = await params;
  const invoice = await db.invoice.findFirst({
    where: { id, businessId: context.business.id },
    include: { customer: true, items: true, payments: { orderBy: { createdAt: "desc" } } }
  });

  if (!invoice) notFound();

  return (
    <main className="dash">
      <aside className="side">
        <strong>MerchantPay</strong>
        <nav className="nav">
          <Link href="/dashboard">Dashboard</Link>
          <Link className="active" href="/dashboard/invoices">Invoices</Link>
          <Link href="/dashboard/customers">Customers</Link>
          <Link href="/dashboard/items">Products &amp; Services</Link>
        <Link href="/dashboard/reports">Reports</Link><Link href="/dashboard/settings">Settings</Link></nav>
      </aside>

      <section className="main">
        <div className="top">
          <div>
            <p className="muted">{context.business.name}</p>
            <h1>{invoice.number}</h1>
            <p className="muted">{invoice.status}</p>
          </div>
        </div>

        <div className="detail-actions">
          <Link className="btn" href="/dashboard/invoices">← Back to invoices</Link>
        </div>

        <section className="panel customer-detail">
          <div className="detail-item">
            <span className="muted">Customer</span>
            <strong>{invoice.customer?.name ?? "No customer"}</strong>
          </div>
          <div className="detail-item">
            <span className="muted">Issue date</span>
            <strong>{invoice.createdAt.toLocaleDateString()}</strong>
          </div>
          <div className="detail-item">
            <span className="muted">Due date</span>
            <strong>{invoice.dueAt?.toLocaleDateString() ?? "No due date"}</strong>
          </div>
          <div className="detail-item">
            <span className="muted">Status</span>
            <strong>{invoice.status}</strong>
          </div>
          <div className="detail-item">
            <span className="muted">Total</span>
            <strong>{invoice.currency} {Number(invoice.total).toLocaleString()}</strong>
          </div>
        </section>

        <section className="panel">
          <h2>Invoice items</h2>
          {invoice.items.map((item) => (
            <div className="customer-row" key={item.id}>
              <div className="customer-summary">
                <strong>{item.name}</strong>
                <div className="muted">
                  {item.quantity.toLocaleString()} × {invoice.currency}{" "}
                  {Number(item.unitPrice).toLocaleString()}
                </div>
              </div>
              <strong>{invoice.currency} {Number(item.total).toLocaleString()}</strong>
            </div>
          ))}

          <div className="invoice-total">
            <strong>Total</strong>
            <strong>{invoice.currency} {Number(invoice.total).toLocaleString()}</strong>
          </div>
        </section>

        <PaymentClient
          invoiceId={invoice.id}
          paymentToken={invoice.publicPaymentToken}
          invoiceNumber={invoice.number}
          customerName={invoice.customer?.name ?? null}
          customerPhone={invoice.customer?.phone ?? null}
          total={invoice.total.toString()}
          currency={invoice.currency}
          initialStatus={invoice.status}
          initialPayments={invoice.payments.map((payment) => ({
            id: payment.id,
            provider: payment.provider,
            providerReference: payment.providerReference,
            amount: payment.amount.toString(),
            currency: payment.currency,
            status: payment.status,
            createdAt: payment.createdAt.toISOString(),
          }))}
        />

        {invoice.notes && (
          <section className="panel">
            <h2>Notes</h2>
            <p>{invoice.notes}</p>
          </section>
        )}
      </section>
    </main>
  );
}
