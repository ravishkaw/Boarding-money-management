import { eq } from "drizzle-orm";
import Link from "next/link";
import { db, schema } from "@/db";
import { currentYm, getMonth, listPersons } from "@/lib/data";
import { checkLedger } from "@/lib/health";
import { formatCentsPlain } from "@/lib/money";
import { ChangePinForm, OpeningBalancesForm } from "./settings-forms";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const persons = listPersons();
  const { year, month } = currentYm();
  const defaultYm = `${year}-${String(month).padStart(2, "0")}`;

  // Show existing manual overrides for the current month, if any
  const monthRow = getMonth(year, month);
  const current: Record<number, string> = {};
  if (monthRow) {
    const rows = db
      .select()
      .from(schema.openingBalances)
      .where(eq(schema.openingBalances.monthId, monthRow.id))
      .all();
    for (const row of rows) {
      if (row.source === "manual")
        current[row.personId] = formatCentsPlain(row.amountCents).replace(
          /,/g,
          "",
        );
    }
  }

  const health = checkLedger();
  const errors = health.issues.filter((i) => i.level === "error");

  return (
    <main className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Ledger check</h2>
        {health.issues.length === 0 ? (
          <p className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
            <strong>Everything adds up.</strong> {health.billsChecked} confirmed
            bills across {health.monthsChecked} months: every bill reconciles
            with its receipt and its payers, every month&apos;s movements sum
            to zero, and opening balances balance.
          </p>
        ) : (
          <div
            className={`rounded-2xl border p-4 text-sm ${
              errors.length > 0
                ? "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
                : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
            }`}
          >
            <strong>
              {errors.length > 0
                ? `${errors.length} problem${errors.length === 1 ? "" : "s"} found`
                : "Nothing wrong, a few things to look at"}
            </strong>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {health.issues.map((issue, i) => (
                <li key={i}>
                  {issue.level === "warning" && (
                    <span className="mr-1 text-xs uppercase opacity-70">note</span>
                  )}
                  {issue.billId ? (
                    <Link href={`/bills/${issue.billId}`} className="underline">
                      {issue.message}
                    </Link>
                  ) : (
                    issue.message
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <h2 className="font-semibold">Opening balances</h2>
        <p className="text-sm text-zinc-500">
          Only needed for your very first month (copy the &quot;Difference&quot;
          row from the last Excel sheet), or to correct a carried balance.
        </p>
        <OpeningBalancesForm
          people={persons.map((p) => ({ id: p.id, name: p.name }))}
          defaultYm={defaultYm}
          current={current}
        />
      </section>

      <section className="flex flex-col gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <h2 className="font-semibold">Change my PIN</h2>
        <ChangePinForm />
      </section>
    </main>
  );
}
