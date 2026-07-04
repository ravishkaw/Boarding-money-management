import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Bill, BillItem, BillPayment, Month, Person } from "@/db/schema";
import {
  effectiveCosts,
  payerCredits,
  settle,
  type SettleBill,
  type Settlement,
} from "./settlement";

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

export type BillWithItems = Bill & {
  items: BillItem[];
  /** Split payments; empty for single-payer bills (use payerPersonId). */
  payments: BillPayment[];
};

/** Effective payer list: split rows when present, else the single payer. */
export function billPayers(
  bill: BillWithItems,
): { personId: number; amountCents: number }[] {
  if (bill.payments.length > 0)
    return bill.payments.map((p) => ({
      personId: p.personId,
      amountCents: p.amountCents,
    }));
  if (bill.payerPersonId == null) return [];
  return [{ personId: bill.payerPersonId, amountCents: bill.netCents }];
}

export function listBillsForMonth(monthId: number): BillWithItems[] {
  const bills = db
    .select()
    .from(schema.bills)
    .where(eq(schema.bills.monthId, monthId))
    .orderBy(desc(schema.bills.billDate), desc(schema.bills.id))
    .all();
  if (bills.length === 0) return [];
  const billIds = bills.map((b) => b.id);
  const items = db
    .select()
    .from(schema.billItems)
    .where(inArray(schema.billItems.billId, billIds))
    .orderBy(asc(schema.billItems.lineNo))
    .all();
  const payments = db
    .select()
    .from(schema.billPayments)
    .where(inArray(schema.billPayments.billId, billIds))
    .all();
  return bills.map((bill) => ({
    ...bill,
    items: items.filter((item) => item.billId === bill.id),
    payments: payments.filter((p) => p.billId === bill.id),
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
  const payments = db
    .select()
    .from(schema.billPayments)
    .where(eq(schema.billPayments.billId, billId))
    .all();
  return { ...bill, items, payments };
}

function toSettleBills(bills: BillWithItems[]): SettleBill[] {
  return bills
    .filter((b) => b.status === "confirmed")
    .map((b) => ({
      payers: billPayers(b),
      discountCents: b.discountCents,
      items: b.items.map((item) => ({
        lineTotalCents: item.lineTotalCents,
        discountCents: item.discountCents,
        status: item.status,
        ownerPersonId: item.ownerPersonId,
      })),
    }))
    .filter((b) => b.payers.length > 0);
}

export function listRepaymentsForMonth(monthId: number) {
  return db
    .select()
    .from(schema.repayments)
    .where(eq(schema.repayments.monthId, monthId))
    .orderBy(asc(schema.repayments.paidDate), asc(schema.repayments.id))
    .all();
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
    repayments: listRepaymentsForMonth(month.id).map((r) => ({
      fromPersonId: r.fromPersonId,
      toPersonId: r.toPersonId,
      amountCents: r.amountCents,
    })),
  });
}

export function billLabel(bill: BillWithItems): string {
  return bill.source === "manual" && bill.items.length === 1
    ? bill.items[0].displayName
    : (bill.storeName ?? "Keells");
}

export type BreakdownBillPaid = {
  billId: number;
  label: string;
  date: string;
  /** what this person was credited for the bill (their split share) */
  creditCents: number;
  splitOfCents: number | null; // bill net when split between people
};

export type BreakdownPersonalItem = {
  billId: number;
  name: string;
  date: string;
  costCents: number;
  paidBy: string; // "Aditha" or "Aditha + Ravishka"
};

export type PersonBreakdown = {
  personId: number;
  billsPaid: BreakdownBillPaid[];
  personalItems: BreakdownPersonalItem[];
};

/**
 * Itemized "why is my number what it is" data per person: every bill they
 * were credited for and every personal item charged to them, using the same
 * effective-cost math as the settlement.
 */
export function monthBreakdowns(
  monthId: number,
  persons: Person[],
): Map<number, PersonBreakdown> {
  const result = new Map<number, PersonBreakdown>(
    persons.map((p) => [p.id, { personId: p.id, billsPaid: [], personalItems: [] }]),
  );
  const firstName = (id: number) =>
    persons.find((p) => p.id === id)?.name.split(" ")[0] ?? `#${id}`;

  for (const bill of listBillsForMonth(monthId)) {
    if (bill.status !== "confirmed") continue;
    const payers = billPayers(bill);
    if (payers.length === 0) continue;
    const settleBill: SettleBill = {
      payers,
      discountCents: bill.discountCents,
      items: bill.items.map((item) => ({
        lineTotalCents: item.lineTotalCents,
        discountCents: item.discountCents,
        status: item.status,
        ownerPersonId: item.ownerPersonId,
      })),
    };
    const costs = effectiveCosts(settleBill);
    const label = billLabel(bill);
    const paidBy = payers.map((p) => firstName(p.personId)).join(" + ");

    for (const credit of payerCredits(settleBill)) {
      if (credit.amountCents === 0) continue;
      result.get(credit.personId)?.billsPaid.push({
        billId: bill.id,
        label,
        date: bill.billDate,
        creditCents: credit.amountCents,
        splitOfCents: payers.length > 1 ? bill.netCents : null,
      });
    }

    bill.items.forEach((item, i) => {
      if (item.status !== "personal" || item.ownerPersonId == null) return;
      result.get(item.ownerPersonId)?.personalItems.push({
        billId: bill.id,
        name: item.displayName,
        date: bill.billDate,
        costCents: costs[i],
        paidBy,
      });
    });
  }
  return result;
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
