import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema } from "@/db";
import { getBillWithItems, listPersons } from "@/lib/data";
import { formatCents, formatCentsPlain } from "@/lib/money";
import {
  ConfirmBillButton,
  DeleteBillButton,
  ItemName,
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

      {bill.status === "draft" && !locked && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <strong>Review this bill.</strong> Check who paid, tap an item name
          to rename it, mark personal items, then confirm. Drafts don&apos;t
          count in the settlement.
        </div>
      )}

      <PayerPicker
        billId={bill.id}
        people={people}
        payerId={bill.payerPersonId}
        split={bill.payments.map((p) => ({
          personId: p.personId,
          amountCents: p.amountCents,
        }))}
        netCents={bill.netCents}
        disabled={locked}
      />

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {bill.items.map((item) => (
            <li key={item.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <span
                  className={`flex min-w-0 flex-1 ${
                    item.status === "excluded"
                      ? "text-zinc-400 line-through"
                      : ""
                  }`}
                >
                  <ItemName
                    itemId={item.id}
                    displayName={item.displayName}
                    rawName={item.rawName}
                    disabled={locked}
                  />
                </span>
                <div className="shrink-0 text-right font-semibold">
                  {item.discountCents > 0 ? (
                    <div className="flex flex-col items-end">
                      <span className="text-xs font-normal text-zinc-400 line-through">
                        {formatCentsPlain(item.lineTotalCents)}
                      </span>
                      {formatCentsPlain(
                        item.lineTotalCents - item.discountCents,
                      )}
                    </div>
                  ) : (
                    formatCentsPlain(item.lineTotalCents)
                  )}
                </div>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3">
                <div className="min-w-0 text-xs text-zinc-500">
                  {item.quantity} × {formatCentsPlain(item.unitPriceCents)}
                  {item.discountCents > 0 && (
                    <span className="ml-2 text-emerald-700 dark:text-emerald-400">
                      {item.discountNote ?? "Discount"} −
                      {formatCentsPlain(item.discountCents)}
                    </span>
                  )}
                </div>
                <ItemStatusControl
                  itemId={item.id}
                  status={item.status}
                  ownerPersonId={item.ownerPersonId}
                  people={people}
                  disabled={locked}
                />
              </div>
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

      {bill.status === "draft" && !locked && (
        <ConfirmBillButton billId={bill.id} />
      )}

      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-zinc-500 underline">
          ← Back
        </Link>
        <DeleteBillButton billId={bill.id} disabled={locked} />
      </div>
    </main>
  );
}
