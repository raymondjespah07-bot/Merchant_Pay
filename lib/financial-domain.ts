export function normalizeUgandaPhone(input: string): string {
  const raw = String(input ?? '').trim().replace(/[^0-9+]/g, '');
  if (raw.startsWith('+256')) return `256${raw.slice(4)}`;
  if (raw.startsWith('256')) return raw;
  if (raw.startsWith('0')) return `256${raw.slice(1)}`;
  return raw;
}

export function calculateLedgerBalance(entries: Array<{direction: 'CREDIT'|'DEBIT'; amount: string|number}>): string {
  let total = 0;
  for (const entry of entries) {
    const amount = Number(entry.amount);
    total += entry.direction === 'CREDIT' ? amount : -amount;
  }
  return total.toFixed(2);
}

export function canSettleInvoicePayment(input: {status: string; amount: string|number; outstanding: string|number}): boolean {
  if (input.status !== 'COMPLETED') return false;
  const amount = Number(input.amount);
  const outstanding = Number(input.outstanding);
  return Number.isFinite(amount) && amount > 0 && Number.isFinite(outstanding) && amount <= outstanding;
}
