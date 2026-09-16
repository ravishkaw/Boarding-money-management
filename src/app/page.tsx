import Link from "next/link";
import { BillList } from "@/components/bill-list";
import { MonthSummary } from "@/components/month-summary";
import { SettlementView } from "@/components/settlement-view";
import { getSession } from "@/lib/auth";
import {
  billLabel,
  currentYm,
  getOrCreateMonth,
  listBillsForMonth,
  listPersons,
  listRepaymentsForMonth,
  monthBreakdowns,
  monthLabel,
  settleMonth,
} from "@/lib/data";
import { checkLedger } from "@/lib/health";
import { formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  const { year, month } = currentYm();
  const monthRow = getOrCreateMonth(year, month);
  const persons = listPersons();
  const settlement = settleMonth(monthRow, persons);
  const bills = listBillsForMonth(monthRow.id);
  const drafts = bills.filter((b) => b.status === "draft");
  const problems = checkLedger().issues.filter((i) => i.level === "error");

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{monthLabel(monthRow)}</h1>
        <Link href="/months" className="text-sm text-zinc-500 underline">
          All months
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

      {problems.length > 0 && (
        <Link
          href="/settings"
          className="block rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
        >
          <strong>
            The ledger check found {problems.length} problem
            {problems.length === 1 ? "" : "s"}
          </strong>{" "}
          — the balances below may be off. See Settings →
        </Link>
      )}

      {drafts.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <strong>
            {drafts.length === 1
              ? "1 bill is waiting for review"
              : `${drafts.length} bills are waiting for review`}
          </strong>{" "}
          — drafts don&apos;t count until they&apos;re confirmed.
          <ul className="mt-2 space-y-1">
            {drafts.map((d) => (
              <li key={d.id}>
                <Link href={`/bills/${d.id}`} className="underline">
                  {d.billDate} · {billLabel(d)} · {formatCents(d.netCents)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <MonthSummary
        settlement={settlement}
        billCount={bills.filter((b) => b.status === "confirmed").length}
        personCount={persons.length}
        sessionPersonId={session?.personId}
      />

      <SettlementView
        settlement={settlement}
        persons={persons}
        monthId={monthRow.id}
        editable={monthRow.status === "open"}
        repayments={listRepaymentsForMonth(monthRow.id)}
        breakdowns={monthBreakdowns(monthRow.id, persons)}
        sessionPersonId={session?.personId}
      />

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">This month&apos;s bills</h2>
        <BillList bills={bills} persons={persons} />
      </section>
    </main>
  );
}
