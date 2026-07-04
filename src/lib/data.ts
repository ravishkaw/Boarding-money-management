import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Bill, BillItem, Month, Person } from "@/db/schema";
import { settle, type SettleBill, type Settlement } from "./settlement";

export function listPersons(): Person[] {
  return db
    .select()
    .from(schema.persons)
    .orderBy(asc(schema.persons.displayOrder))
    .all();
}

/** Today's year/month in the house's timezone. */
export function currentYm(): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month") };
}

export function getMonth(year: number, month: number): Month | undefined {
  return db
    .select()
    .from(schema.months)
    .where(and(eq(schema.months.year, year), eq(schema.months.month, month)))
    .get();
}

export function getOrCreateMonth(year: number, month: number): Month {
  const existing = getMonth(year, month);
  if (existing) return existing;
  return db
    .insert(schema.months)
    .values({ year, month })
    .returning()
    .get();
}

export function listMonths(): Month[] {
  return db
    .select()
    .from(schema.months)
    .orderBy(desc(schema.months.year), desc(schema.months.month))
    .all();
}

export type BillWithItems = Bill & { items: BillItem[] };

export function listBillsForMonth(monthId: number): BillWithItems[] {
  const bills = db
    .select()
    .from(schema.bills)
    .where(eq(schema.bills.monthId, monthId))
    .orderBy(desc(schema.bills.billDate), desc(schema.bills.id))
    .all();
  if (bills.length === 0) return [];
  const items = db
    .select()
    .from(schema.billItems)
    .where(
      inArray(
        schema.billItems.billId,
        bills.map((b) => b.id),
      ),
    )
    .orderBy(asc(schema.billItems.lineNo))
    .all();
  return bills.map((bill) => ({
    ...bill,
    items: items.filter((item) => item.billId === bill.id),
  }));
}

export function getBillWithItems(billId: number): BillWithItems | undefined {
  const bill = db
    .select()
    .from(schema.bills)
    .where(eq(schema.bills.id, billId))
    .get();
  if (!bill) return undefined;
  const items = db
    .select()
    .from(schema.billItems)
    .where(eq(schema.billItems.billId, billId))
    .orderBy(asc(schema.billItems.lineNo))
    .all();
  return { ...bill, items };
}

function toSettleBills(bills: BillWithItems[]): SettleBill[] {
  return bills
    .filter((b) => b.status === "confirmed" && b.payerPersonId != null)
    .map((b) => ({
      payerPersonId: b.payerPersonId as number,
      discountCents: b.discountCents,
      items: b.items.map((item) => ({
        lineTotalCents: item.lineTotalCents,
        status: item.status,
        ownerPersonId: item.ownerPersonId,
      })),
    }));
}

function previousMonth(month: Month): Month | undefined {
  const prev =
    month.month === 1
      ? { year: month.year - 1, month: 12 }
      : { year: month.year, month: month.month - 1 };
  return getMonth(prev.year, prev.month);
}

/**
 * Opening balances for a month: manual rows win; otherwise derived live from
 * the previous month's closing balances (recursively). Always consistent,
 * even when old months are edited after the fact.
 */
export function openingBalancesFor(
  month: Month,
  persons: Person[],
  depth = 0,
): Map<number, number> {
  const manualRows = db
    .select()
    .from(schema.openingBalances)
    .where(eq(schema.openingBalances.monthId, month.id))
    .all()
    .filter((row) => row.source === "manual");
  const manual = new Map(manualRows.map((r) => [r.personId, r.amountCents]));
  if (manual.size === persons.length || depth > 48) return manual;

  const openings = new Map<number, number>();
  const prev = previousMonth(month);
  const prevClosings = prev
    ? new Map(
        settleMonth(prev, persons, depth + 1).persons.map((p) => [
          p.personId,
          p.closingCents,
        ]),
      )
    : new Map<number, number>();

  for (const person of persons) {
    openings.set(
      person.id,
      manual.get(person.id) ?? prevClosings.get(person.id) ?? 0,
    );
  }
  return openings;
}

export function settleMonth(
  month: Month,
  persons: Person[] = listPersons(),
  depth = 0,
): Settlement {
  return settle({
    personIds: persons.map((p) => p.id),
    bills: toSettleBills(listBillsForMonth(month.id)),
    openings: openingBalancesFor(month, persons, depth),
  });
}

export function ymSlug(month: Month): string {
  return `${month.year}-${String(month.month).padStart(2, "0")}`;
}

export function parseYmSlug(
  slug: string,
): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(slug);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function monthLabel(month: Month): string {
  return `${MONTH_NAMES[month.month - 1]} ${month.year}`;
}
