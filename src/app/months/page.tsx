import Link from "next/link";
import {
  listBillsForMonth,
  listMonths,
  listPersons,
  monthLabel,
  settleMonth,
  ymSlug,
} from "@/lib/data";
import { formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";

export default function MonthsPage() {
  const months = listMonths();
  const persons = listPersons();

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Months</h1>
      {months.length === 0 ? (
        <p className="text-zinc-500">Nothing tracked yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {months.map((m) => {
            const settlement = settleMonth(m, persons);
            const personal = settlement.persons.reduce(
              (sum, p) => sum + p.personalCents,
              0,
            );
            const bills = listBillsForMonth(m.id);
            const confirmed = bills.filter((b) => b.status === "confirmed").length;
            const drafts = bills.length - confirmed;
            return (
              <li key={m.id}>
                <Link
                  href={`/months/${ymSlug(m)}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 active:bg-zinc-50 dark:active:bg-zinc-900"
                >
                  <div className="min-w-0">
                    <div className="font-medium">
                      {monthLabel(m)}
                      {m.status === "closed" && (
                        <span className="ml-2 text-xs text-zinc-500">🔒</span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {formatCents(settlement.sharedPoolCents)} shared
                      {personal > 0 ? ` · ${formatCents(personal)} personal` : ""}
                      {` · ${confirmed} bill${confirmed === 1 ? "" : "s"}`}
                      {drafts > 0 ? ` · ${drafts} draft${drafts === 1 ? "" : "s"}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-right font-semibold">
                    {formatCents(settlement.sharedPoolCents + personal)}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
