import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema } from "@/db";
import { formatWhen, listBillActivity } from "@/lib/activity";
import { billPayers, getBillWithItems, listPersons } from "@/lib/data";
import { formatCents, formatCentsPlain } from "@/lib/money";
import {
  effectiveCosts,
  payerCredits,
  type SettleBill,
} from "@/lib/settlement";
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
  const firstName = (personId: number | null) =>
    persons.find((p) => p.id === personId)?.name.split(" ")[0] ?? "—";
  const month = db
    .select()
    .from(schema.months)
    .where(eq(schema.months.id, bill.monthId))
    .get();
  const locked = month?.status === "closed";
  const receiptDiscounts = db
    .select()
    .from(schema.billDiscounts)
    .where(eq(schema.billDiscounts.billId, bill.id))
    .all();
  const itemDiscountCents = bill.items.reduce(
    (sum, item) => sum + item.discountCents,
    0,
  );
  let parseWarnings: string[] = [];
  try {
    parseWarnings = bill.parseWarnings ? JSON.parse(bill.parseWarnings) : [];
  } catch {
    parseWarnings = [bill.parseWarnings ?? ""];
  }
  const activity = listBillActivity(bill.id);

  // Same math as the settlement, so what this page says is what gets split.
  const payers = billPayers(bill);
  const settleBill: SettleBill = {
    payers,
    discountCents: bill.discountCents,
    items: bill.items.map((item) => ({
      lineTotalCents: item.lineTotalCents,
      discountCents: item.discountCents,
      status: item.status,
      ownerPersonId: item.ownerPersonId,
    })),
  };
  // `priced` = every line's price after ALL discounts (receipt-level ones
  // prorated in), regardless of status; `costs` = what actually gets charged
  // (excluded lines are 0).
  let priced: number[];
  let costs: number[];
  let mathError: string | null = null;
  try {
    costs = effectiveCosts(settleBill);
    priced = effectiveCosts({
      ...settleBill,
      items: settleBill.items.map((item) => ({ ...item, status: "shared" })),
    });
  } catch (error) {
    mathError = error instanceof Error ? error.message : String(error);
    priced = bill.items.map((item) => item.lineTotalCents - item.discountCents);
    costs = priced;
  }
  const sharedCents = bill.items.reduce(
    (sum, item, i) => (item.status === "shared" ? sum + costs[i] : sum),
    0,
  );
  const personalByOwner = new Map<number, number>();
  const excludedCents = bill.items.reduce((sum, item, i) => {
    if (item.status === "personal" && item.ownerPersonId != null)
      personalByOwner.set(
        item.ownerPersonId,
        (personalByOwner.get(item.ownerPersonId) ?? 0) + costs[i],
      );
    return item.status === "excluded" ? sum + priced[i] : sum;
  }, 0);
  const personalCents = [...personalByOwner.values()].reduce((a, b) => a + b, 0);
  const chargedCents = sharedCents + personalCents;
  const credits = mathError ? [] : payerCredits(settleBill, chargedCents);
  const eachCents =
    persons.length > 0 ? Math.round(sharedCents / persons.length) : 0;

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
        {(bill.rawHtml || bill.sourceUrl) && (
          <p className="mt-1 flex flex-wrap gap-3 text-xs">
            {bill.rawHtml && (
              <a
                href={`/bills/${bill.id}/receipt`}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-700 underline dark:text-emerald-400"
              >
                View receipt ↗
              </a>
            )}
            {bill.sourceUrl && (
              <a
                href={bill.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-zinc-500 underline"
              >
                Keells e-bill ↗
              </a>
            )}
          </p>
        )}
      </div>

      {bill.status === "draft" && !locked && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <strong>Review this bill.</strong> Check who paid, tap an item name
          to rename it, mark personal items, then confirm. Drafts don&apos;t
          count in the settlement.
        </div>
      )}

      {parseWarnings.length > 0 && (
        <div className="rounded-2xl border border-orange-300 bg-orange-50 p-4 text-sm text-orange-900 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-100">
          <strong>Check this against the paper receipt.</strong>
          <ul className="mt-1 list-disc pl-5">
            {parseWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {mathError && (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100">
          <strong>This bill&apos;s discounts don&apos;t add up.</strong> It
          can&apos;t be settled until it&apos;s fixed: {mathError}
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
          {bill.items.map((item, i) => {
            const discounted = priced[i] !== item.lineTotalCents;
            const receiptShare =
              item.lineTotalCents - item.discountCents - priced[i];
            return (
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
                    {discounted ? (
                      <div className="flex flex-col items-end">
                        <span className="text-xs font-normal text-zinc-400 line-through">
                          {formatCentsPlain(item.lineTotalCents)}
                        </span>
                        {formatCentsPlain(priced[i])}
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
                    {receiptShare !== 0 && (
                      <span className="ml-2 text-emerald-700 dark:text-emerald-400">
                        share of receipt discount −
                        {formatCentsPlain(receiptShare)}
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
            );
          })}
        </ul>
        <p className="border-t border-zinc-200 px-4 py-2 text-xs text-zinc-500 dark:border-zinc-800">
          <strong>Shared</strong> is split between everyone ·{" "}
          <strong>Someone&apos;s</strong> is charged only to them ·{" "}
          <strong>Leave out</strong> means the payer keeps it for themselves,
          nobody else pays.
        </p>

        <div className="space-y-1 border-t border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800">
          <div className="flex justify-between">
            <span>Gross</span>
            <span>{formatCents(bill.grossCents)}</span>
          </div>
          {itemDiscountCents > 0 && (
            <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
              <span>Item promotions</span>
              <span>-{formatCentsPlain(itemDiscountCents)}</span>
            </div>
          )}
          {receiptDiscounts.map((d) => (
            <div
              key={d.id}
              className="flex justify-between text-emerald-700 dark:text-emerald-400"
            >
              <span>{d.description}</span>
              <span>-{formatCentsPlain(d.amountCents)}</span>
            </div>
          ))}
          {bill.discountCents !==
            itemDiscountCents +
              receiptDiscounts.reduce((sum, d) => sum + d.amountCents, 0) && (
            <div className="flex justify-between text-red-600">
              <span>Discount total doesn&apos;t match its parts</span>
              <span>-{formatCentsPlain(bill.discountCents)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold">
            <span>Net</span>
            <span>{formatCents(bill.netCents)}</span>
          </div>
        </div>

        <div className="space-y-1 border-t border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            How this bill splits
          </div>
          <div className="flex justify-between gap-3">
            <span>
              Shared — split {persons.length} ways
              {sharedCents !== 0 && (
                <span className="block text-xs text-zinc-500">
                  about {formatCentsPlain(eachCents)} each
                </span>
              )}
            </span>
            <span className="shrink-0 font-semibold">
              {formatCents(sharedCents)}
            </span>
          </div>
          {[...personalByOwner.entries()].map(([ownerId, cents]) => (
            <div
              key={ownerId}
              className="flex justify-between text-amber-700 dark:text-amber-400"
            >
              <span>{firstName(ownerId)}&apos;s own items</span>
              <span>{formatCents(cents)}</span>
            </div>
          ))}
          {excludedCents !== 0 && (
            <div className="flex justify-between text-zinc-500">
              <span>
                Left out — {payers.map((p) => firstName(p.personId)).join(" + ")}{" "}
                pays for these alone
              </span>
              <span>{formatCents(excludedCents)}</span>
            </div>
          )}
          {credits.length > 0 && (
            <div className="flex justify-between border-t border-zinc-200 pt-1 dark:border-zinc-700">
              <span>
                {credits.length === 1
                  ? `${firstName(credits[0].personId)} is credited`
                  : "Credited"}
              </span>
              <span className="text-right font-semibold">
                {credits.length === 1
                  ? formatCents(credits[0].amountCents)
                  : credits
                      .map(
                        (c) =>
                          `${firstName(c.personId)} ${formatCentsPlain(c.amountCents)}`,
                      )
                      .join(" · ")}
              </span>
            </div>
          )}
        </div>
      </section>

      {bill.status === "draft" && !locked && (
        <ConfirmBillButton billId={bill.id} />
      )}

      {activity.length > 0 && (
        <details className="rounded-2xl border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800">
          <summary className="cursor-pointer select-none text-zinc-500">
            Changes to this bill ({activity.length})
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
            {activity.map((entry) => (
              <li key={entry.id} className="flex gap-2">
                <span className="shrink-0 tabular-nums text-zinc-400">
                  {formatWhen(entry.at)}
                </span>
                <span className="min-w-0">
                  <span className="font-medium">{firstName(entry.personId)}</span>{" "}
                  {entry.action} — {entry.detail}
                </span>
              </li>
            ))}
          </ul>
        </details>
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
