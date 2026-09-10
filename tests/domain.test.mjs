import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUgandaPhone, calculateLedgerBalance, canSettleInvoicePayment } from '../lib/financial-domain.ts';

test('normalizes common Uganda mobile formats to 256XXXXXXXXX', () => {
  assert.equal(normalizeUgandaPhone('0772 123 456'), '256772123456');
  assert.equal(normalizeUgandaPhone('+256 772 123456'), '256772123456');
  assert.equal(normalizeUgandaPhone('256772123456'), '256772123456');
});

test('ledger balance is credits minus debits', () => {
  assert.equal(calculateLedgerBalance([{ direction:'CREDIT', amount:'50000' }, { direction:'DEBIT', amount:'1500' }, { direction:'DEBIT', amount:'1000' }]), '47500.00');
});

test('only verified invoice payments can settle and amount is bounded by invoice outstanding', () => {
  assert.equal(canSettleInvoicePayment({ status:'COMPLETED', amount:'50000', outstanding:'50000' }), true);
  assert.equal(canSettleInvoicePayment({ status:'PENDING', amount:'50000', outstanding:'50000' }), false);
  assert.equal(canSettleInvoicePayment({ status:'COMPLETED', amount:'50001', outstanding:'50000' }), false);
});

test('Paytota provider keeps credentials server-side', async () => {
  const fs = await import('node:fs');
  const source = fs.readFileSync(new URL('../lib/paytota.ts', import.meta.url), 'utf8');
  assert.match(source, /process\.env\.PAYTOTA_SECRET_KEY/);
  assert.match(source, /process\.env\.PAYTOTA_BRAND_ID/);
  assert.doesNotMatch(source, /secretKey\s*[:=]\s*['"][^'"]+['"]/i);
});
