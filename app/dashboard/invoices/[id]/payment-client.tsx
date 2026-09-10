"use client";

import { useMemo, useState } from "react";
import { buildWhatsAppInvoiceUrl } from "@/lib/invoice-sharing";

type Payment = {
  id: string;
  provider: string;
  providerReference: string | null;
  amount: string;
  currency: string;
  status: string;
  createdAt: string;
};

export default function PaymentClient({
  invoiceId,
  paymentToken,
  invoiceNumber,
  customerName,
  customerPhone,
  total,
  currency,
  initialPayments,
  initialStatus,
}: {
  invoiceId: string;
  paymentToken: string;
  invoiceNumber: string;
  customerName: string | null;
  customerPhone: string | null;
  total: string;
  currency: string;
  initialPayments: Payment[];
  initialStatus: string;
}) {
  const [payments, setPayments] = useState(initialPayments);
  const [invoiceStatus, setInvoiceStatus] = useState(initialStatus);
  const [amount, setAmount] = useState("");
  const [provider, setProvider] = useState("CASH");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const paid = useMemo(
    () => payments.filter((p) => p.status === "COMPLETED").reduce((sum, p) => sum + Number(p.amount), 0),
    [payments]
  );
  const outstanding = Math.max(0, Number(total) - paid);

  const paymentUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/pay/${paymentToken}`
      : `/pay/${paymentToken}`;

  const whatsappUrl = customerPhone
    ? buildWhatsAppInvoiceUrl({
        phone: customerPhone,
        paymentUrl,
        invoiceNumber,
        amount: outstanding.toLocaleString(),
        currency,
      })
    : null;

  async function record(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return setError("Enter a valid payment amount.");
    if (value > outstanding + 0.000001) return setError("Payment cannot be greater than the outstanding balance.");

    setSaving(true);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: value, provider, providerReference: reference }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Unable to record payment.");
        return;
      }
      setPayments((current) => [result.payment, ...current]);
      setInvoiceStatus(result.invoice.status);
      setAmount("");
      setReference("");
    } catch {
      setError("Unable to reach the payment server.");
    } finally {
      setSaving(false);
    }
  }

  function copyPaymentLink() {
    navigator.clipboard?.writeText(paymentUrl);
    setShareMessage("Payment link copied. You can send it by SMS or any compatible way.");
  }

  return (
    <>
      <section className="panel">
        <h2>Payment summary</h2>
        <div className="metrics">
          <div className="metric"><span className="muted">Invoice total</span><strong>{currency} {Number(total).toLocaleString()}</strong></div>
          <div className="metric"><span className="muted">Paid</span><strong>{currency} {paid.toLocaleString()}</strong></div>
          <div className="metric"><span className="muted">Outstanding</span><strong>{currency} {outstanding.toLocaleString()}</strong></div>
        </div>
        <p className="muted">Status: <strong>{invoiceStatus}</strong></p>
      </section>

      <section className="panel">
        <h2>Send invoice to customer</h2>
        {customerPhone ? (
          <>
            <p className="muted">
              {customerName ? `Send ${customerName} this invoice on WhatsApp using the customer's saved phone number.` : "Send this invoice on WhatsApp using the customer's saved phone number."}
            </p>
            <div className="row-actions">
              <a className="btn primary" href={whatsappUrl ?? "#"} target="_blank" rel="noreferrer">Send via WhatsApp</a>
              <button type="button" className="btn" onClick={copyPaymentLink}>Copy payment link</button>
            </div>
            <p className="muted">If that number is not on WhatsApp, use Copy payment link and send it by SMS or another compatible method.</p>
          </>
        ) : (
          <>
            <p className="muted">No customer phone number was saved for this invoice. Copy the payment link and send it to the customer by SMS or another compatible method.</p>
            <div className="row-actions">
              <button type="button" className="btn" onClick={copyPaymentLink}>Copy payment link</button>
            </div>
          </>
        )}
        {shareMessage && <div className="success">{shareMessage}</div>}
        {invoiceStatus === "PAID" && <div className="success">This invoice has been successfully paid. Its payment link can no longer start another payment.</div>}
      </section>

      {outstanding > 0 && invoiceStatus !== "CANCELLED" && (
        <section className="panel">
          <h2>Record payment</h2>
          <form className="form" onSubmit={record}>
            <label>
              Amount
              <input type="number" min="0.01" step="0.01" max={outstanding} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Maximum ${outstanding.toLocaleString()}`} required />
            </label>
            <label>
              Payment method
              <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                <option value="CASH">Cash</option>
                <option value="MOBILE_MONEY">Mobile money</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label>
              Reference (optional)
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Receipt or transaction reference" />
            </label>
            {error && <div className="error">{error}</div>}
            <div className="row-actions"><button className="btn primary" disabled={saving}>{saving ? "Recording..." : "Record payment"}</button></div>
          </form>
        </section>
      )}

      <section className="panel">
        <h2>Payment history</h2>
        {payments.length ? (
          <div className="customer-list">
            {payments.map((payment) => (
              <div className="customer-row" key={payment.id}>
                <div className="customer-summary">
                  <strong>{currency} {Number(payment.amount).toLocaleString()}</strong>
                  <div className="muted">{payment.provider.replaceAll("_", " ")} · {new Date(payment.createdAt).toLocaleString()}</div>
                </div>
                <div className="muted">{payment.providerReference || "No reference"}</div>
              </div>
            ))}
          </div>
        ) : <div className="empty">No payments recorded yet.</div>}
      </section>
    </>
  );
}
