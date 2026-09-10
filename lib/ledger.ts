import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

export async function createLedgerEntry(input: {
  businessId: string;
  entryType: string;
  direction: 'CREDIT' | 'DEBIT';
  affectsMerchantBalance?: boolean;
  amount: Prisma.Decimal | string | number;
  currency?: string;
  invoiceId?: string;
  paymentId?: string;
  subscriptionPaymentId?: string;
  merchantPayoutId?: string;
  provider?: string;
  providerReference?: string;
  sourceId: string;
  description?: string;
}, client: Prisma.TransactionClient = db) {
  return client.ledgerEntry.upsert({
    where: { entryType_sourceId: { entryType: input.entryType, sourceId: input.sourceId } },
    create: {
      businessId: input.businessId,
      entryType: input.entryType,
      direction: input.direction,
      affectsMerchantBalance: input.affectsMerchantBalance ?? true,
      amount: new Prisma.Decimal(input.amount),
      currency: input.currency || 'UGX',
      invoiceId: input.invoiceId,
      paymentId: input.paymentId,
      subscriptionPaymentId: input.subscriptionPaymentId,
      merchantPayoutId: input.merchantPayoutId,
      provider: input.provider,
      providerReference: input.providerReference,
      sourceId: input.sourceId,
      description: input.description,
    },
    update: {},
  });
}

export async function getMerchantAvailableBalance(businessId: string, client: Prisma.TransactionClient | typeof db = db) {
  const entries = await client.ledgerEntry.findMany({ where: { businessId, affectsMerchantBalance: true }, select: { direction: true, amount: true } });
  return entries.reduce((sum, entry) => entry.direction === 'CREDIT' ? sum.plus(entry.amount) : sum.minus(entry.amount), new Prisma.Decimal(0)).toDecimalPlaces(2);
}
