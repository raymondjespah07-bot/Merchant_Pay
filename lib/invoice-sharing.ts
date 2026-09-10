export function buildWhatsAppInvoiceUrl(input: {
  phone: string;
  paymentUrl: string;
  invoiceNumber: string;
  amount: string | number;
  currency: string;
}): string {
  const raw = String(input.phone ?? "").trim().replace(/[^0-9+]/g, "");
  const phone = raw.startsWith("+256") ? `256${raw.slice(4)}` : raw.startsWith("256") ? raw : raw.startsWith("0") ? `256${raw.slice(1)}` : raw;
  const message = [
    `Invoice ${input.invoiceNumber}`,
    `Amount: ${input.currency} ${input.amount}`,
    `Please tap this secure MerchantPay payment link to pay: ${input.paymentUrl}`,
  ].join("\n");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
