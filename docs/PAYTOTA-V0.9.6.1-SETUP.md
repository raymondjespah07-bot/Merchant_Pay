# MerchantPay v0.9.6.1 — Paytota + Vercel Hobby setup

## What changed from v0.9.6

v0.9.6.1 is Vercel Hobby-safe. It removes the frequent Vercel Cron registration from `vercel.json`.

The payout-release endpoint is still included and protected with `CRON_SECRET`, but it is now intended to be called by an external HTTP scheduler. This keeps the one-hour merchant payout hold working without requiring a Vercel Pro plan.

## Environment variables

Set these in Vercel Production:

- `DATABASE_URL`
- `PAYTOTA_API_BASE_URL=https://paygateway.paytota.com`
- `PAYTOTA_SECRET_KEY`
- `PAYTOTA_BRAND_ID`
- `PAYTOTA_WEBHOOK_PUBLIC_KEY`
- `CRON_SECRET` (use a long random value; do not expose it in the browser)

## Paytota webhook

Configure Paytota to POST payment updates to:

`https://YOUR-DOMAIN/api/paytota/webhook`

MerchantPay verifies the RSA signature from Paytota before processing a callback.

## Database

After deploying the new source, apply the Prisma schema changes with the project's normal Prisma workflow, for example:

`npx prisma db push`

The schema includes the Paytota provider transaction ID, merchant payout network, and one-hour payout hold timestamp.

## One-hour merchant settlement

A verified customer invoice payment is recorded immediately in the MerchantPay ledger, while its merchant payout is created with status `HELD` and `holdUntil` set to one hour after verification.

The protected release endpoint is:

`GET /api/cron/release-payouts`

It requires this HTTP header:

`Authorization: Bearer YOUR_CRON_SECRET`

### External scheduler setup

Use any external HTTP scheduler that can make authenticated GET requests. For example, a service such as cron-job.org can call the endpoint.

Configure the scheduler approximately as follows:

- **URL:** `https://YOUR-DOMAIN/api/cron/release-payouts`
- **Method:** `GET`
- **Schedule:** every 1 minute if you want the closest possible release to the one-hour mark; every 5 minutes is also acceptable.
- **Header:** `Authorization: Bearer YOUR_CRON_SECRET`

Replace `YOUR-DOMAIN` and `YOUR_CRON_SECRET` with your real values. Keep the secret only in the scheduler and Vercel environment variables.

The endpoint is idempotency-aware: due payouts are claimed before provider payout initiation so concurrent scheduler calls are much less likely to create duplicate payouts.

### Why there is no Vercel Cron entry

Vercel Hobby supports Cron Jobs, but Hobby schedules are limited to once per day. A minute/hour schedule in `vercel.json` can prevent a Hobby deployment from being accepted. v0.9.6.1 therefore deliberately contains no `crons` entry in `vercel.json`.

## Admin Money Center

The Money Center reads Paytota's UGX account-balance API and shows balance, available balance, gross balance, reserved amount, pending outgoing amount, payout balance, available payout balance, pending payouts, payout fees, transaction fees, payout gross balance and payout overdraft.

The manual payout tool remains available to administrators and accepts a recipient phone number, network, amount and reason.

## Vercel deployment checklist

1. Import/deploy the project normally on Vercel Hobby.
2. Add all environment variables above to Production.
3. Deploy the project.
4. Configure the Paytota webhook URL.
5. Configure the external scheduler to call the payout-release endpoint.
6. Test with a small controlled payment and confirm the payout stays `HELD` until `holdUntil`, then changes to the provider payout state after the scheduler runs.
