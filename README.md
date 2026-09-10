# MerchantPay v0.9.6.1

MerchantPay is a merchant invoicing and payment-management SaaS. This release uses Paytota for customer collections, merchant payouts and subscription payments, with a one-hour hold before merchant settlement.

## Vercel Hobby-ready

This build deliberately has **no Vercel Cron entry**. The payout release endpoint remains protected by `CRON_SECRET` and should be called by an external HTTP scheduler:

`GET /api/cron/release-payouts`

with:

`Authorization: Bearer YOUR_CRON_SECRET`

See `docs/PAYTOTA-V0.9.6.1-SETUP.md` for the complete deployment and scheduler setup.

## Run locally

```bash
cp .env.example .env
npm install
npx prisma db push
npm run dev
```

## Production environment

Configure `DATABASE_URL`, `PAYTOTA_API_BASE_URL`, `PAYTOTA_SECRET_KEY`, `PAYTOTA_BRAND_ID`, `PAYTOTA_WEBHOOK_PUBLIC_KEY` and `CRON_SECRET` in Vercel.


## Build safety

The project now regenerates Prisma Client automatically during install, development startup, and production build. This prevents the TypeScript client/schema drift that previously caused fields such as `mobileMoneyNetwork`, `providerTransactionId`, and `holdUntil` to appear missing in VS Code/Vercel.
