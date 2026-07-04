import Link from "next/link";
import { listMonths, monthLabel, ymSlug } from "@/lib/data";

export const dynamic = "force-dynamic";

export default function MonthsPage() {
  const months = listMonths();

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Months</h1>
      {months.length === 0 ? (
        <p className="text-zinc-500">Nothing tracked yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {months.map((m) => (
            <li key={m.id}>
              <Link
                href={`/months/${ymSlug(m)}`}
                className="flex items-center justify-between px-4 py-3"
              >
                <span className="font-medium">{monthLabel(m)}</span>
                <span className="text-xs text-zinc-500">
                  {m.status === "closed" ? "closed 🔒" : "open"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
