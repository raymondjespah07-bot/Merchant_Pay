import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('onboarding explicitly identifies the saved customer-payment payout number', () => {
  const page = read('app/onboarding/page.tsx');
  assert.match(page, /This mobile phone number will receive the customer invoice payments, ensure it's the right one\./);
  assert.match(page, /mobileMoneyNetwork/);
  const route = read('app/api/onboarding/route.ts');
  assert.match(route, /mobileMoneyPhone/);
  assert.match(route, /mobileMoneyNetwork/);
});

test('suspension page limits the visible merchant navigation to status and payment history', () => {
  const page = read('app/dashboard/suspended/page.tsx');
  assert.match(page, /Your MerchantPay account has been suspended/);
  assert.match(page, /Send message to administrator/);
  assert.match(page, /Payment history/);
});

test('admin search contains money transaction sources', () => {
  const route = read('app/api/admin/search-all/route.ts');
  for (const term of ['ledgerEntry','merchantPayout','subscriptionPayment','customer','product','item','subscription','adminAnnouncement','announcementView','providerReference','providerTransactionId','mobileMoneyPhone','mobileMoneyNetwork']) assert.match(route, new RegExp(term));
});

test('Paytota credentials are environment variables, not source literals', () => {
  const source = read('lib/paytota.ts');
  assert.match(source, /process\.env\.PAYTOTA_SECRET_KEY/);
  assert.match(source, /process\.env\.PAYTOTA_BRAND_ID/);
  assert.match(source, /process\.env\.PAYTOTA_WEBHOOK_PUBLIC_KEY/);
  assert.doesNotMatch(source, /secretKey\s*[:=]\s*['"][^'"]+['"]/i);
});

test('invoice sharing uses a dedicated public token and prevents duplicate pending payment requests', () => {
  const schema = read('prisma/schema.prisma');
  assert.match(schema, /publicPaymentToken\s+String\??\s+@unique/);
  assert.match(schema, /pendingInvoiceId\s+String\?\s+@unique/);
  const route = read('app/api/public/paytota/invoice/route.ts');
  assert.match(route, /pendingInvoiceId/);
  assert.match(route, /P2002/);
});

test('manual merchant-recorded payments cannot race a pending Paytota payment', () => {
  const route = read('app/api/invoices/[id]/payments/route.ts');
  assert.match(route, /payment\.status === ["']PENDING["']/);
  assert.match(route, /PAYTOTA/);
  assert.match(route, /already.*pending|pending.*payment/i);
});
