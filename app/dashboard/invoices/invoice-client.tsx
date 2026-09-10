"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Customer = { id: string; name: string; phone?: string | null };
type Product = { id: string; name: string; type: string; price: string | number; currency: string; active: boolean };
type InvoiceLine = {
  id?: string;
  productId?: string | null;
  name: string;
  quantity: number | string;
  unitPrice: string | number;
  total?: string | number;
};
type Invoice = {
  id: string;
  number: string;
  status: string;
  customer: Customer | null;
  total: string | number;
  currency: string;
  items: InvoiceLine[];
};

export default function InvoiceClient({
  initialInvoices,
  customers,
  items: products,
  currency
}: {
  initialInvoices: Invoice[];
  customers: Customer[];
  items: Product[];
  currency: string;
}) {
  const [invoices, setInvoices] = useState(initialInvoices);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<InvoiceLine[]>([
    { name: "", quantity: 1, unitPrice: 0 }
  ]);

  const visible = useMemo(
    () =>
      invoices.filter(
        (x) =>
          !q ||
          x.number.toLowerCase().includes(q.toLowerCase()) ||
          (x.customer?.name ?? "").toLowerCase().includes(q.toLowerCase())
      ),
    [invoices, q]
  );

  const total = lines.reduce(
    (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0),
    0
  );

  function chooseProduct(index: number, productId: string) {
    const product = products.find((x) => x.id === productId);
    if (!product) return;
    setLines((current) =>
      current.map((line, i) =>
        i === index
          ? {
              ...line,
              productId: product.id,
              name: product.name,
              quantity: line.quantity || 1,
              unitPrice: product.price
            }
          : line
      )
    );
  }

  function changeLine(index: number, key: "name" | "quantity" | "unitPrice", value: string) {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, [key]: value } : line))
    );
  }

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (!customerId) {
      setError("Select a customer.");
      return;
    }

    if (
      lines.some(
        (line) =>
          !line.name.trim() ||
          Number(line.quantity) <= 0 ||
          Number(line.unitPrice) < 0
      )
    ) {
      setError("Complete every invoice item.");
      return;
    }

    try {
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, dueAt, notes, currency, items: lines })
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error ?? `Unable to create invoice (HTTP ${response.status}).`);
        return;
      }

      if (!result.invoice) {
        setError("Invoice was not returned by the server.");
        return;
      }

      setInvoices((current) => [result.invoice, ...current]);
      setOpen(false);
      setCustomerId("");
      setDueAt("");
      setNotes("");
      setLines([{ name: "", quantity: 1, unitPrice: 0 }]);
    } catch {
      setError("Unable to reach the invoice server.");
    }
  }

  async function status(id: string, nextStatus: string) {
    const response = await fetch(`/api/invoices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus })
    });
    const result = await response.json();
    if (response.ok && result.invoice) {
      setInvoices((current) => current.map((item) => (item.id === id ? result.invoice : item)));
    }
  }

  return (
    <>
      <div className="customer-toolbar">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search invoices or customers..."
        />
        <button
          className="btn primary"
          onClick={() => {
            setError("");
            setOpen(true);
          }}
        >
          + Create invoice
        </button>
      </div>

      <section className="panel">
        {visible.length ? (
          <div className="customer-list">
            {visible.map((invoice) => (
              <div className="customer-row" key={invoice.id}>
                <Link className="customer-summary" href={`/dashboard/invoices/${invoice.id}`}>
                  <strong>{invoice.number}</strong>
                  <div className="muted">
                    {invoice.customer?.name ?? "No customer"} · {invoice.currency}{" "}
                    {Number(invoice.total).toLocaleString()} · {invoice.status}
                  </div>
                </Link>
                <select
                  value={invoice.status}
                  onChange={(e) => status(invoice.id, e.target.value)}
                >
                  <option>DRAFT</option>
                  <option>SENT</option>
                  <option>PAID</option>
                  <option>PARTIALLY_PAID</option>
                  <option>OVERDUE</option>
                  <option>CANCELLED</option>
                </select>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">
            <strong>No invoices yet.</strong>
          </div>
        )}
      </section>

      {open && (
        <div className="modal-backdrop">
          <section className="modal">
            <h2>Create invoice</h2>
            <form className="form" onSubmit={create}>
              <label>
                Customer
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  required
                >
                  <option value="">Select customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Due date
                <input
                  type="date"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                />
              </label>

              <strong>Invoice items</strong>

              {lines.map((line, index) => (
                <div className="invoice-line" key={index}>
                  <select
                    value={line.productId ?? ""}
                    onChange={(e) => chooseProduct(index, e.target.value)}
                  >
                    <option value="">Choose product/service</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} · {product.currency}{" "}
                        {Number(product.price).toLocaleString()}
                      </option>
                    ))}
                  </select>

                  <input
                    value={line.name}
                    onChange={(e) => changeLine(index, "name", e.target.value)}
                    placeholder="Description"
                    required
                  />

                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={line.quantity}
                    onChange={(e) => changeLine(index, "quantity", e.target.value)}
                  />

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.unitPrice}
                    onChange={(e) => changeLine(index, "unitPrice", e.target.value)}
                  />

                  <button
                    type="button"
                    className="btn danger"
                    onClick={() =>
                      setLines((current) =>
                        current.length > 1 ? current.filter((_, i) => i !== index) : current
                      )
                    }
                  >
                    ×
                  </button>
                </div>
              ))}

              <button
                type="button"
                className="btn"
                onClick={() =>
                  setLines((current) => [
                    ...current,
                    { name: "", quantity: 1, unitPrice: 0 }
                  ])
                }
              >
                + Add line
              </button>

              <label>
                Notes
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>

              <div className="invoice-total">
                <strong>Total</strong>
                <strong>
                  {currency}{" "}
                  {total.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </strong>
              </div>

              {error && <div className="error">{error}</div>}

              <div className="row-actions">
                <button type="button" className="btn" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button className="btn primary">Create draft invoice</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
