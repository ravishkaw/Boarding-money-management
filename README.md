# Boarding

Shared expense tracker for the boarding house — replaces the monthly Excel
workbook. Paste a Keells e-bill link, pick who paid, untick personal items,
and the monthly settlement (Paid / Fair Share / Difference with carry-forward)
computes itself.

## Features

- **Keells e-bill import** — server-side fetch + parse of the e-bill HTML
  (items, weighed quantities, discounts, net total). The raw HTML is
  snapshotted at import, so bills stay viewable after the link expires.
- **Quick add** for bill-less spends (kottu, boarding fee, utilities) with
  presets.
- **Shared / Personal / Excluded** per item. A personal item on someone
  else's bill automatically becomes a debt to the payer.
- **Monthly settlement** — fair share = shared pool ÷ 3, balances carry
  forward month to month, "who pays whom" suggestions.
- **Excel export** per month (Summary / Items / Item Totals) in the old
  workbook's shape.
- **Item name memory** — tap an item on a bill, rename "BIG ONIONS" to
  "Big Onions" with "remember" ticked, and every future import uses it.
- **Every bill explains itself** — "How this bill splits" shows the shared
  amount, each person's own items, what the payer keeps, and what the payer
  is credited, using the same math as the settlement. "View receipt" opens
  the snapshot exactly as Keells printed it.
- **Log** — every change anyone makes (imports, item marks, payer changes,
  cash payments, month locks) with who and when; each bill shows its own.
- **Ledger check** on the Settings page — every bill reconciles with its
  receipt and its payers, every month's movements sum to zero, opening
  balances balance. Any mismatch is listed with a link to the bill.
- Installable on a phone home screen (web manifest + icons).
- 3-person PIN login, mobile-first UI, single SQLite file as the database.

## How the split works

All money is integer cents; every figure on screen comes from the same
`settle()` in `src/lib/settlement.ts`.

- **A bill's net** is what the receipt says was paid (Gross − all
  discounts). Keells imports are refused unless items and promotions
  reconcile with the receipt's own Net Amount to the cent.
- **Discounts**: an item promotion ("20.00% Dis", the bag's "Value Dis")
  comes straight off its own line. Anything else that came off the receipt
  is prorated across every line by value (last line absorbs the rounding
  cent), so the lines always sum exactly to the net.
- **Shared** (default) goes into the month's shared pool. Fair share = pool
  ÷ people; leftover cents go to the first people in display order.
- **Personal** (someone's own) is charged to that person at its discounted
  price and never enters the pool — a personal item on someone else's bill
  is a debt to the payer and touches nobody else.
- **Excluded** (left out) is treated as the payer's own: it's charged to no
  one and the payer's credit for the bill is reduced by its discounted
  price, so the payer effectively eats it.
- **Payer credit** = shared + personal charged on the bill (i.e. net minus
  excluded). Split payers are credited in proportion to what each put in.
- **Balance** per person = carried from last month + credited − fair share −
  own items ± cash settle-ups. Deltas always sum to zero; closings roll into
  next month's openings (manual openings win, and must themselves sum to 0).
- After a parser fix, `npm run db:reconcile` re-reads every stored receipt
  and reports (or with `--apply`, repairs) any bill whose money differs.

## Stack

Next.js 16 (App Router) · Drizzle ORM + better-sqlite3 · Tailwind 4 ·
cheerio · exceljs · vitest.

## Development

```bash
npm install
cp .env.example .env.local   # then set a real AUTH_SECRET
npm run db:push              # create tables in ./local.db
npm run db:seed              # the 3 people, default PIN 0000
npm run dev
```

Tests (settlement math + Keells parser against a real receipt fixture):

```bash
npm test
```

## Deployment

See [DEPLOY.md](DEPLOY.md) — VPS with pm2 behind a cPanel subdomain, nightly
SQLite backups.
