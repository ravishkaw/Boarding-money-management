import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema } from "@/db";
import { getBillWithItems, listPersons } from "@/lib/data";
import { formatCents, formatCentsPlain } from "@/lib/money";
import {
  DeleteBillButton,
  ItemStatusControl,
  PayerPicker,
} from "./bill-controls";

export const dynamic = "force-dynamic";

export default async function BillPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bill = getBillWithItems(Number(id));
  if (!bill) notFound();

  const persons = listPersons();
  const people = persons.map((p) => ({ id: p.id, name: p.name }));
  const month = db
    .select()
    .from(schema.months)
    .where(eq(schema.months.id, bill.monthId))
    .get();
  const locked = month?.status === "closed";

  const title =
    bill.source === "manual" && bill.items.length === 1
      ? bill.items[0].displayName
      : (bill.storeName ?? "Keells");

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-sm text-zinc-500">
          {bill.billDate}
          {bill.transactionRef ? ` · #${bill.transactionRef}` : ""}
          {bill.status === "draft" ? " · DRAFT" : ""}
          {locked ? " · month closed 🔒" : ""}
        </p>
      </div>

      <PayerPicker
        billId={bill.id}
        people={people}
        payerId={bill.payerPersonId}
        disabled={locked}
      />

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {bill.items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div
                  className={`truncate font-medium ${item.status === "excluded" ? "text-zinc-400 line-through" : ""}`}
                >
                  {item.displayName}
                </div>
                <div className="text-xs text-zinc-500">
                  {item.quantity} × {formatCentsPlain(item.unitPriceCents)}
                </div>
              </div>
              <div className="shrink-0 text-right font-semibold">
                {formatCentsPlain(item.lineTotalCents)}
              </div>
              <ItemStatusControl
                itemId={item.id}
                status={item.status}
                ownerPersonId={item.ownerPersonId}
                people={people}
                disabled={locked}
              />
            </li>
          ))}
        </ul>
        <div className="space-y-1 border-t border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800">
          <div className="flex justify-between">
            <span>Gross</span>
            <span>{formatCents(bill.grossCents)}</span>
          </div>
          {bill.discountCents > 0 && (
            <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
              <span>Discounts</span>
              <span>-{formatCentsPlain(bill.discountCents)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold">
            <span>Net</span>
            <span>{formatCents(bill.netCents)}</span>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-zinc-500 underline">
          ← back
        </Link>
        <DeleteBillButton billId={bill.id} disabled={locked} />
      </div>
    </main>
  );
}
