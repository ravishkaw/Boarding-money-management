import Link from "next/link";
import { notFound } from "next/navigation";
import { BillList } from "@/components/bill-list";
import { SettlementView } from "@/components/settlement-view";
import {
  getMonth,
  listBillsForMonth,
  listPersons,
  listRepaymentsForMonth,
  monthLabel,
  parseYmSlug,
  settleMonth,
} from "@/lib/data";
import { formatCentsPlain } from "@/lib/money";
import { setMonthStatus } from "../actions";

export const dynamic = "force-dynamic";

export default async function MonthPage({
  params,
}: {
  params: Promise<{ ym: string }>;
}) {
  const { ym } = await params;
  const parsed = parseYmSlug(ym);
  if (!parsed) notFound();
  const month = getMonth(parsed.year, parsed.month);
  if (!month) notFound();

  const persons = listPersons();
  const settlement = settleMonth(month, persons);
  const bills = listBillsForMonth(month.id);

  // Pivot replacement: total spend per display name (shared+personal, not excluded)
  const itemTotals = new Map<string, { qty: number; cents: number }>();
  for (const bill of bills) {
    if (bill.status !== "confirmed") continue;
    for (const item of bill.items) {
      if (item.status === "excluded") continue;
      const entry = itemTotals.get(item.displayName) ?? { qty: 0, cents: 0 };
      entry.qty += item.quantity;
      entry.cents += item.lineTotalCents - item.discountCents;
      itemTotals.set(item.displayName, entry);
    }
  }
  const sortedTotals = [...itemTotals.entries()].sort(
    (a, b) => b[1].cents - a[1].cents,
  );

  const toggleStatus = setMonthStatus.bind(
    null,
    month.id,
    month.status === "open" ? "closed" : "open",
  );

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{monthLabel(month)}</h1>
        <div className="flex items-center gap-3">
          <a
            href={`/api/months/${ym}/export`}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium dark:border-zinc-700"
          >
            ⬇ Excel
          </a>
          <form action={toggleStatus}>
            <button
              type="submit"
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium dark:border-zinc-700"
            >
              {month.status === "open" ? "Close month" : "Reopen"}
            </button>
          </form>
        </div>
      </div>

      <SettlementView
        settlement={settlement}
        persons={persons}
        monthId={month.id}
        editable={month.status === "open"}
        repayments={listRepaymentsForMonth(month.id)}
      />

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Bills</h2>
        <BillList bills={bills} persons={persons} />
      </section>

      {sortedTotals.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Item totals</h2>
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-2 py-2 text-right font-medium">Qty</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {sortedTotals.map(([name, t]) => (
                  <tr
                    key={name}
                    className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
                  >
                    <td className="px-4 py-1.5">{name}</td>
                    <td className="px-2 py-1.5 text-right text-zinc-500">
                      {Math.round(t.qty * 1000) / 1000}
                    </td>
                    <td className="px-4 py-1.5 text-right">
                      {formatCentsPlain(t.cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Link href="/months" className="text-sm text-zinc-500 underline">
        ← all months
      </Link>
    </main>
  );
}
