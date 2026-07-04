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
- **Item name memory** — rename "914006: BIG ONIONS" to "Big Onions" once,
  it's remembered for every future import.
- 3-person PIN login, mobile-first UI, single SQLite file as the database.

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
