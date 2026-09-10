# MerchantPay V0.6.2

## Fixes
- Customers -> Invoices now loads `/dashboard/invoices` directly.
- Products & Services -> Invoices now loads `/dashboard/invoices` directly.
- Invoice creation uses Prisma Decimal explicitly for all monetary/quantity fields.
- Invoice number generation runs inside the same Prisma transaction as invoice creation.
- Invoice creation logs the real server exception and returns a useful development-safe message instead of hiding every failure behind the same generic error.
- P2021 database-table errors now tell the developer to run the database push/migration command.
- P2002 invoice-number conflicts are reported distinctly.

## Project navigation rule
A selected feature must load directly. The dashboard is never an intentional intermediate route.
