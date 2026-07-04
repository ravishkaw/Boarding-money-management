import Link from "next/link";
import type { Person } from "@/db/schema";
import type { BillWithItems } from "@/lib/data";
import { formatCents } from "@/lib/money";

export function BillList({
  bills,
  persons,
}: {
  bills: BillWithItems[];
  persons: Person[];
}) {
  if (bills.length === 0)
    return (
      <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
        No bills yet this month.
      </p>
    );

  const nameOf = (id: number | null) =>
    persons.find((p) => p.id === id)?.name.split(" ")[0] ?? "—";

  return (
    <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      {bills.map((bill) => {
        const label =
          bill.source === "manual" && bill.items.length === 1
            ? bill.items[0].displayName
            : (bill.storeName ?? "Keells");
        return (
          <li key={bill.id}>
            <Link
              href={`/bills/${bill.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 active:bg-zinc-50 dark:active:bg-zinc-900"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{label}</div>
                <div className="text-xs text-zinc-500">
                  {bill.billDate} ·{" "}
                  {bill.payments.length > 0
                    ? `${bill.payments.map((p) => nameOf(p.personId)).join(" + ")} paid`
                    : `${nameOf(bill.payerPersonId)} paid`}
                  {bill.items.length > 1 ? ` · ${bill.items.length} items` : ""}
                  {bill.status === "draft" ? " · DRAFT" : ""}
                </div>
              </div>
              <div className="shrink-0 font-semibold">
                {formatCents(bill.netCents)}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
