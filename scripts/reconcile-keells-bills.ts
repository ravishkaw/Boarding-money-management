/**
 * Re-parse every imported Keells bill from its stored HTML snapshot with the
 * CURRENT parser and reconcile the database against it. Use after a parser
 * fix to repair bills that were imported wrong (e.g. the 06-Sep-2026 Green
 * Discount bill). Item status / owner / payer / split payments are never
 * touched; only the money read from the receipt is.
 *
 *   npm run db:reconcile                   # report only (dry run)
 *   npm run db:reconcile -- --apply        # write the fixes
 *   npm run db:reconcile -- --fix-openings # also make manual opening balances sum to 0
 *
 * Reads DATABASE_PATH like the app. Stop the app (pm2 stop boarding) and
 * take a backup before --apply on the live database.
 */
import Database from "better-sqlite3";
import {
  normalizeMatchKey,
  parseKeellsBill,
  titleCase,
} from "../src/lib/keells/parse";

const APPLY = process.argv.includes("--apply");
const FIX_OPENINGS = process.argv.includes("--fix-openings");
const dbPath = process.env.DATABASE_PATH ?? "./local.db";

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const rs = (cents: number) => (cents / 100).toFixed(2);

type BillRow = {
  id: number;
  bill_date: string;
  gross_cents: number;
  discount_cents: number;
  net_cents: number;
  raw_html: string;
};
type ItemRow = {
  id: number;
  line_no: number;
  item_code: string | null;
  raw_name: string;
  display_name: string;
  discount_cents: number;
  discount_note: string | null;
};
type DiscountRow = { description: string; amount_cents: number };

const columns = (db.prepare("PRAGMA table_info(bill)").all() as { name: string }[])
  .map((c) => c.name);
if (!columns.includes("parse_warnings")) {
  console.error("bill.parse_warnings is missing — run `npm run db:push` first.");
  process.exit(1);
}

const aliasFor = db.prepare(
  "select friendly_name from item_alias where match_key = ?",
);
const itemsOf = db.prepare(
  "select id, line_no, item_code, raw_name, display_name, discount_cents, discount_note from bill_item where bill_id = ? order by line_no",
);
const discountsOf = db.prepare(
  "select description, amount_cents from bill_discount where bill_id = ? order by id",
);
const paymentsSum = db.prepare(
  "select count(*) n, coalesce(sum(amount_cents), 0) s from bill_payment where bill_id = ?",
);

const updateBill = db.prepare(
  "update bill set gross_cents = ?, discount_cents = ?, net_cents = ?, parse_warnings = ? where id = ?",
);
const updateItem = db.prepare(
  "update bill_item set item_code = ?, raw_name = ?, display_name = ?, discount_cents = ?, discount_note = ? where id = ?",
);
const deleteDiscounts = db.prepare("delete from bill_discount where bill_id = ?");
const insertDiscount = db.prepare(
  "insert into bill_discount (bill_id, description, amount_cents) values (?, ?, ?)",
);

console.log(`${APPLY ? "APPLYING to" : "Dry run against"} ${dbPath}\n`);

let changed = 0;
let blocked = 0;
const bills = db
  .prepare(
    "select id, bill_date, gross_cents, discount_cents, net_cents, raw_html from bill where source = 'keells' and raw_html is not null order by bill_date, id",
  )
  .all() as BillRow[];

for (const bill of bills) {
  const parsed = parseKeellsBill(bill.raw_html);
  const tag = `#${bill.id} ${bill.bill_date}`;

  if (parsed.errors.length > 0 || parsed.grossCents === null || parsed.netCents === null) {
    console.log(`${tag}: CAN'T RECONCILE — ${parsed.errors.join(" | ")}`);
    blocked++;
    continue;
  }

  const stored = itemsOf.all(bill.id) as ItemRow[];
  const byLine = new Map(stored.map((i) => [i.line_no, i]));
  if (
    stored.length !== parsed.items.length ||
    parsed.items.some((p) => !byLine.has(p.lineNo))
  ) {
    console.log(
      `${tag}: item lines differ (db ${stored.length}, receipt ${parsed.items.length}) — review by hand`,
    );
    blocked++;
    continue;
  }

  const notes: string[] = [];
  if (parsed.grossCents !== bill.gross_cents)
    notes.push(`gross ${rs(bill.gross_cents)} → ${rs(parsed.grossCents)}`);
  if (parsed.totalDiscountCents !== bill.discount_cents)
    notes.push(`discount ${rs(bill.discount_cents)} → ${rs(parsed.totalDiscountCents)}`);
  if (parsed.netCents !== bill.net_cents)
    notes.push(`net ${rs(bill.net_cents)} → ${rs(parsed.netCents)}`);

  const itemUpdates: { row: ItemRow; code: string | null; raw: string; display: string; disc: number; note: string | null }[] = [];
  for (const p of parsed.items) {
    const row = byLine.get(p.lineNo)!;
    const wasAutoNamed = row.display_name === titleCase(row.raw_name);
    const key = p.itemCode ?? normalizeMatchKey(p.rawName);
    const alias = (aliasFor.get(key) as { friendly_name: string } | undefined)?.friendly_name;
    const display = wasAutoNamed ? (alias ?? titleCase(p.rawName)) : row.display_name;
    if (
      row.item_code !== p.itemCode ||
      row.raw_name !== p.rawName ||
      row.display_name !== display ||
      row.discount_cents !== p.discountCents ||
      (row.discount_note ?? null) !== (p.discountNote ?? null)
    ) {
      notes.push(
        `line ${p.lineNo}: ${row.item_code ?? "—"} "${row.display_name}" disc ${rs(row.discount_cents)} → ${p.itemCode ?? "—"} "${display}" disc ${rs(p.discountCents)}${p.discountNote ? ` (${p.discountNote})` : ""}`,
      );
      itemUpdates.push({ row, code: p.itemCode, raw: p.rawName, display, disc: p.discountCents, note: p.discountNote });
    }
  }

  const storedDiscounts = (discountsOf.all(bill.id) as DiscountRow[]).map(
    (d) => `${d.description}=${d.amount_cents}`,
  );
  const parsedDiscounts = parsed.discounts.map((d) => `${d.description}=${d.amountCents}`);
  const discountsDiffer =
    storedDiscounts.length !== parsedDiscounts.length ||
    storedDiscounts.some((d, i) => d !== parsedDiscounts[i]);
  if (discountsDiffer)
    notes.push(
      `receipt-level rows [${storedDiscounts.join(", ")}] → [${parsedDiscounts.join(", ")}]`,
    );

  if (notes.length === 0) {
    console.log(`${tag}: ok`);
    continue;
  }

  const pay = paymentsSum.get(bill.id) as { n: number; s: number };
  if (pay.n > 0 && pay.s !== parsed.netCents) {
    console.log(
      `${tag}: NEEDS A HAND — split payments add up to ${rs(pay.s)} but the receipt net is ${rs(parsed.netCents)}. Re-enter the split on the bill page, then run again.\n    ${notes.join("\n    ")}`,
    );
    blocked++;
    continue;
  }

  changed++;
  console.log(`${tag}: ${APPLY ? "FIXING" : "would fix"}\n    ${notes.join("\n    ")}`);
  if (parsed.warnings.length) console.log(`    warnings: ${parsed.warnings.join(" | ")}`);

  if (APPLY) {
    db.transaction(() => {
      updateBill.run(
        parsed.grossCents,
        parsed.totalDiscountCents,
        parsed.netCents,
        parsed.warnings.length ? JSON.stringify(parsed.warnings) : null,
        bill.id,
      );
      for (const u of itemUpdates)
        updateItem.run(u.code, u.raw, u.display, u.disc, u.note, u.row.id);
      if (discountsDiffer) {
        deleteDiscounts.run(bill.id);
        for (const d of parsed.discounts)
          insertDiscount.run(bill.id, d.description, d.amountCents);
      }
    })();
  }
}

// ---- Manual opening balances must sum to zero -----------------------------
// Money the house is owed always equals money owed to the house; a manual
// set that doesn't sum to 0 (e.g. copied from an Excel sheet that truncated
// a cent) makes every later month's closings off by that amount forever.
// The app's own rule gives the rounding cent to the first person in display
// order, so that's who absorbs the correction.
console.log("");
const monthsWithManual = db
  .prepare(
    `select ob.month_id, m.year, m.month, sum(ob.amount_cents) total
       from opening_balance ob join month m on m.id = ob.month_id
      where ob.source = 'manual' group by ob.month_id order by m.year, m.month`,
  )
  .all() as { month_id: number; year: number; month: number; total: number }[];
for (const m of monthsWithManual) {
  const label = `${m.year}-${String(m.month).padStart(2, "0")}`;
  if (m.total === 0) {
    console.log(`openings ${label}: sum to 0, ok`);
    continue;
  }
  const first = db
    .prepare(
      `select ob.person_id, p.name, ob.amount_cents
         from opening_balance ob join person p on p.id = ob.person_id
        where ob.month_id = ? and ob.source = 'manual'
        order by p.display_order limit 1`,
    )
    .get(m.month_id) as { person_id: number; name: string; amount_cents: number };
  const fixed = first.amount_cents - m.total;
  console.log(
    `openings ${label}: sum to ${rs(m.total)}, not 0 — ${FIX_OPENINGS && APPLY ? "FIXING" : "would fix with --fix-openings --apply"}: ${first.name} ${rs(first.amount_cents)} → ${rs(fixed)}`,
  );
  if (FIX_OPENINGS && APPLY) {
    db.prepare(
      "update opening_balance set amount_cents = ? where month_id = ? and person_id = ?",
    ).run(fixed, m.month_id, first.person_id);
  }
}

console.log(
  `\n${bills.length} Keells bills checked: ${changed} ${APPLY ? "fixed" : "to fix"}, ${blocked} need a hand.`,
);
db.close();
process.exit(blocked > 0 ? 2 : 0);
