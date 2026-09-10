# MerchantPay V0.5.1 — Products & Services Fix

Fixes:
- Active/inactive edits now persist correctly.
- Checkbox state is submitted as a real boolean.
- PATCH correctly interprets false instead of Boolean("false").
- Edit forms remount per item so fields do not retain stale values.
- Updated records replace the edited record in client state.
- Prisma Decimal price values are converted to plain strings before Server -> Client transfer.
- Database persistence remains unchanged, so data survives refresh and sign-out/sign-in.

Retest:
1. Edit a service and switch Active OFF.
2. Save; it must show Inactive.
3. Refresh; it must remain Inactive.
4. Sign out and sign in; it must remain Inactive.
5. Switch it ON and save; it must show Active.
6. Edit its price; refresh and sign back in; the new price must remain.
7. Navigate Dashboard <-> Products & Services; the Decimal console error must be gone.
