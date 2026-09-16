import { inArray } from "drizzle-orm";
import Link from "next/link";
import { db, schema } from "@/db";
import { formatWhen, listActivity } from "@/lib/activity";
import { listPersons } from "@/lib/data";

export const dynamic = "force-dynamic";

export default function ActivityPage() {
  const entries = listActivity(150);
  const persons = listPersons();
  const firstName = (id: number | null) =>
    persons.find((p) => p.id === id)?.name.split(" ")[0] ?? "Someone";

  // Only link bills that still exist; deleted ones keep their log lines.
  const billIds = [...new Set(entries.flatMap((e) => (e.billId ? [e.billId] : [])))];
  const existing = new Set(
    billIds.length > 0
      ? db
          .select({ id: schema.bills.id })
          .from(schema.bills)
          .where(inArray(schema.bills.id, billIds))
          .all()
          .map((b) => b.id)
      : [],
  );

  return (
    <main className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Log</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Every change anyone makes, newest first. Handy when a number looks
          off and you want to know what moved it.
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          Nothing logged yet.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
          {entries.map((entry) => (
            <li key={entry.id} className="flex gap-3 px-4 py-2.5">
              <span className="shrink-0 pt-0.5 text-xs tabular-nums text-zinc-400">
                {formatWhen(entry.at)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{firstName(entry.personId)}</span>{" "}
                {entry.action}
                {entry.billId && existing.has(entry.billId) ? (
                  <>
                    {" "}
                    <Link
                      href={`/bills/${entry.billId}`}
                      className="underline decoration-zinc-300 underline-offset-2"
                    >
                      bill #{entry.billId}
                    </Link>
                  </>
                ) : null}
                <span className="block text-xs text-zinc-500">{entry.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
