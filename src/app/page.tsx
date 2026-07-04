import Link from "next/link";
import { BillList } from "@/components/bill-list";
import { SettlementView } from "@/components/settlement-view";
import {
  currentYm,
  getOrCreateMonth,
  listBillsForMonth,
  listPersons,
  listRepaymentsForMonth,
  monthLabel,
  settleMonth,
} from "@/lib/data";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const { year, month } = currentYm();
  const monthRow = getOrCreateMonth(year, month);
  const persons = listPersons();
  const settlement = settleMonth(monthRow, persons);
  const bills = listBillsForMonth(monthRow.id);

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{monthLabel(monthRow)}</h1>
        <Link href="/months" className="text-sm text-zinc-500 underline">
          all months
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/import"
          className="rounded-2xl bg-emerald-600 px-4 py-4 text-center text-lg font-semibold text-white"
        >
          Import bill
        </Link>
        <Link
          href="/bills/new"
          className="rounded-2xl border-2 border-emerald-600 px-4 py-4 text-center text-lg font-semibold text-emerald-700 dark:text-emerald-400"
        >
          Quick add
        </Link>
      </div>

      <SettlementView
        settlement={settlement}
        persons={persons}
        monthId={monthRow.id}
        editable={monthRow.status === "open"}
        repayments={listRepaymentsForMonth(monthRow.id)}
      />

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">This month&apos;s bills</h2>
        <BillList bills={bills} persons={persons} />
      </section>
    </main>
  );
}
