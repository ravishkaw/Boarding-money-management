import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { parseKeellsBill } from "@/lib/keells/parse";
import {
  billPayers,
  listBillsForMonth,
  listMonths,
  listPersons,
  settleMonth,
  type BillWithItems,
} from "@/lib/data";
import { formatCentsPlain } from "@/lib/money";
import { effectiveCosts, payerCredits, type SettleBill } from "@/lib/settlement";

export type HealthIssue = {
  level: "error" | "warning";
  message: string;
  billId?: number;
};

export type HealthReport = {
  issues: HealthIssue[];
  billsChecked: number;
  monthsChecked: number;
};

const DRAFT_STALE_DAYS = 3;

function toSettleBill(bill: BillWithItems): SettleBill {
  return {
    payers: billPayers(bill),
    discountCents: bill.discountCents,
    items: bill.items.map((item) => ({
      lineTotalCents: item.lineTotalCents,
      discountCents: item.discountCents,
      status: item.status,
      ownerPersonId: item.ownerPersonId,
    })),
  };
}

/**
 * The same invariants the settlement relies on, checked across the whole
 * ledger so a bad bill is caught on the Settings page rather than in
 * someone's balance: every bill's money adds up, its payers cover its net,
 * its Keells receipt still parses to the stored figures, every month's
 * deltas sum to zero and manual opening balances sum to zero.
 */
export function checkLedger(): HealthReport {
  const issues: HealthIssue[] = [];
  const persons = listPersons();
  const months = listMonths();
  let billsChecked = 0;
  const now = Date.now();

  for (const month of months) {
    const label = `${month.year}-${String(month.month).padStart(2, "0")}`;
    const bills = listBillsForMonth(month.id);

    for (const bill of bills) {
      const tag = `${bill.billDate} bill #${bill.id}`;
      const lineSum = bill.items.reduce((s, i) => s + i.lineTotalCents, 0);
      if (bill.grossCents !== lineSum)
        issues.push({
          level: "error",
          billId: bill.id,
          message: `${tag}: items add up to ${formatCentsPlain(lineSum)} but gross is ${formatCentsPlain(bill.grossCents)}.`,
        });
      if (bill.netCents !== bill.grossCents - bill.discountCents)
        issues.push({
          level: "error",
          billId: bill.id,
          message: `${tag}: net ${formatCentsPlain(bill.netCents)} ≠ gross − discounts.`,
        });
      for (const item of bill.items)
        if (item.status === "personal" && item.ownerPersonId == null)
          issues.push({
            level: "error",
            billId: bill.id,
            message: `${tag}: "${item.displayName}" is personal but has no owner.`,
          });

      if (bill.status === "draft") {
        const ageDays = (now - Date.parse(bill.createdAt)) / 86_400_000;
        if (ageDays > DRAFT_STALE_DAYS)
          issues.push({
            level: "warning",
            billId: bill.id,
            message: `${tag} has been a draft for ${Math.floor(ageDays)} days — it doesn't count until confirmed.`,
          });
        continue;
      }
      billsChecked++;

      const payers = billPayers(bill);
      const paid = payers.reduce((s, p) => s + p.amountCents, 0);
      if (payers.length === 0)
        issues.push({ level: "error", billId: bill.id, message: `${tag} has no payer.` });
      else if (paid !== bill.netCents)
        issues.push({
          level: "error",
          billId: bill.id,
          message: `${tag}: payers put in ${formatCentsPlain(paid)} but the bill is ${formatCentsPlain(bill.netCents)}.`,
        });

      try {
        const sb = toSettleBill(bill);
        const costs = effectiveCosts(sb);
        const charged = bill.items.reduce(
          (s, item, i) => (item.status === "excluded" ? s : s + costs[i]),
          0,
        );
        const credited = payerCredits(sb, charged).reduce((s, c) => s + c.amountCents, 0);
        if (credited !== charged)
          issues.push({
            level: "error",
            billId: bill.id,
            message: `${tag}: ${formatCentsPlain(charged)} is charged but only ${formatCentsPlain(credited)} credited to payers.`,
          });
      } catch (error) {
        issues.push({
          level: "error",
          billId: bill.id,
          message: `${tag}: ${error instanceof Error ? error.message : String(error)}`,
        });
      }

      // Re-read the receipt snapshot for open months (closed ones were
      // checked when they were open; re-parsing years of HTML every visit
      // isn't worth it).
      if (month.status === "open" && bill.source === "keells" && bill.hasReceipt) {
        const snapshot = db
          .select({ rawHtml: schema.bills.rawHtml })
          .from(schema.bills)
          .where(eq(schema.bills.id, bill.id))
          .get();
        if (!snapshot?.rawHtml) continue;
        const parsed = parseKeellsBill(snapshot.rawHtml);
        if (parsed.errors.length > 0)
          issues.push({
            level: "error",
            billId: bill.id,
            message: `${tag}: the receipt no longer parses cleanly — ${parsed.errors.join(" ")}`,
          });
        else if (
          parsed.grossCents !== bill.grossCents ||
          parsed.totalDiscountCents !== bill.discountCents ||
          parsed.netCents !== bill.netCents
        )
          issues.push({
            level: "error",
            billId: bill.id,
            message: `${tag}: receipt says ${formatCentsPlain(parsed.grossCents ?? 0)} − ${formatCentsPlain(parsed.totalDiscountCents)} = ${formatCentsPlain(parsed.netCents ?? 0)}, stored ${formatCentsPlain(bill.grossCents)} − ${formatCentsPlain(bill.discountCents)} = ${formatCentsPlain(bill.netCents)}. Run npm run db:reconcile.`,
          });
      }
    }

    try {
      const settlement = settleMonth(month, persons);
      const sumDelta = settlement.persons.reduce((s, p) => s + p.deltaCents, 0);
      if (sumDelta !== 0)
        issues.push({
          level: "error",
          message: `${label}: this month's movements sum to ${formatCentsPlain(sumDelta)} instead of 0.`,
        });
    } catch (error) {
      issues.push({
        level: "error",
        message: `${label} can't be settled: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  const manualByMonth = new Map<number, number>();
  for (const row of db.select().from(schema.openingBalances).all()) {
    if (row.source !== "manual") continue;
    manualByMonth.set(row.monthId, (manualByMonth.get(row.monthId) ?? 0) + row.amountCents);
  }
  for (const [monthId, sum] of manualByMonth) {
    if (sum === 0) continue;
    const month = months.find((m) => m.id === monthId);
    const label = month ? `${month.year}-${String(month.month).padStart(2, "0")}` : `month #${monthId}`;
    issues.push({
      level: "error",
      message: `${label}: manual opening balances sum to ${formatCentsPlain(sum)}, not 0 — every later balance is off by that much. Run npm run db:reconcile -- --fix-openings --apply.`,
    });
  }

  issues.sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));
  return { issues, billsChecked, monthsChecked: months.length };
}
