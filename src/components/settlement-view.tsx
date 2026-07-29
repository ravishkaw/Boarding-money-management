import Link from "next/link";
import type { Person, Repayment } from "@/db/schema";
import type { PersonBreakdown } from "@/lib/data";
import type { Settlement } from "@/lib/settlement";
import { formatCents } from "@/lib/money";
import {
  DeleteRepaymentButton,
  MarkPaidButton,
  RecordPaymentForm,
} from "./repayment-controls";

export function SettlementView({
  settlement,
  persons,
  monthId,
  editable = false,
  repayments = [],
  breakdowns,
  sessionPersonId,
}: {
  settlement: Settlement;
  persons: Person[];
  monthId?: number;
  editable?: boolean;
  repayments?: Repayment[];
  breakdowns?: Map<number, PersonBreakdown>;
  sessionPersonId?: number;
}) {
  const nameOf = (id: number) =>
    persons.find((p) => p.id === id)?.name.split(" ")[0] ?? `#${id}`;
  const youOr = (id: number) => (id === sessionPersonId ? "You" : nameOf(id));

  // Show the signed-in person's card first.
  const ordered = [...settlement.persons].sort((a, b) => {
    if (a.personId === sessionPersonId) return -1;
    if (b.personId === sessionPersonId) return 1;
    return 0;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        {ordered.map((p) => {
          const isYou = p.personId === sessionPersonId;
          const breakdown = breakdowns?.get(p.personId);
          const paidLabel = isYou ? "you" : "they";
          return (
            <div
              key={p.personId}
              className={`min-w-0 rounded-2xl border p-4 ${
                isYou
                  ? "border-emerald-400 dark:border-emerald-700"
                  : "border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <div className="text-lg font-semibold">
                {nameOf(p.personId)}
                {isYou && (
                  <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                    you
                  </span>
                )}
              </div>

              <div
                className={`mt-2 text-xl font-bold ${
                  p.closingCents >= 0 ? "text-emerald-600" : "text-red-600"
                }`}
              >
                {formatCents(Math.abs(p.closingCents))}
              </div>
              <div className="text-xs text-zinc-500">
                {p.closingCents === 0
                  ? "All square"
                  : p.closingCents > 0
                    ? `The house owes ${isYou ? "you" : "them"}`
                    : isYou
                      ? "You owe the house"
                      : "They owe the house"}
              </div>

              <details className="mt-3 text-sm" open={isYou}>
                <summary className="cursor-pointer select-none text-zinc-500">
                  See the math
                </summary>
                <dl className="mt-2 space-y-1 text-zinc-600 dark:text-zinc-400">
                  <Row
                    label="Carried from last month"
                    value={p.openingCents}
                    signed
                  />
                  <Row label="Paid for bills" value={p.paidCents} signed />
                  <Row
                    label="Share of shared bills"
                    value={-p.fairShareCents}
                    signed
                  />
                  {p.personalCents !== 0 && (
                    <Row
                      label="Own (personal) items"
                      value={-p.personalCents}
                      signed
                    />
                  )}
                  {p.repaidCents !== 0 && (
                    <Row
                      label={
                        p.repaidCents > 0 ? "Handed over in cash" : "Received in cash"
                      }
                      value={p.repaidCents}
                      signed
                    />
                  )}
                  <div className="flex justify-between border-t border-zinc-200 pt-1 font-semibold text-zinc-800 dark:border-zinc-700 dark:text-zinc-200">
                    <dt>= balance</dt>
                    <dd>{formatCents(p.closingCents)}</dd>
                  </div>
                </dl>

                {breakdown && breakdown.billsPaid.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                      Bills {paidLabel} paid
                    </div>
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {breakdown.billsPaid.map((b, i) => (
                        <li key={i} className="flex justify-between gap-2">
                          <Link
                            href={`/bills/${b.billId}`}
                            className="min-w-0 truncate underline decoration-zinc-300 underline-offset-2"
                          >
                            {b.date.slice(5)} {b.label}
                            {b.splitOfCents !== null &&
                              ` (share of ${formatCents(b.splitOfCents)})`}
                          </Link>
                          <span className="shrink-0">
                            {formatCents(b.creditCents)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {breakdown &&
                  breakdown.personalItems.length > 0 &&
                  (() => {
                    const ownName = nameOf(p.personId);
                    // Group personal items by whose bill they were on.
                    const groups = new Map<
                      string,
                      typeof breakdown.personalItems
                    >();
                    for (const item of breakdown.personalItems) {
                      const arr = groups.get(item.paidBy) ?? [];
                      arr.push(item);
                      groups.set(item.paidBy, arr);
                    }
                    // own (fully self-paid) first, co-paid next, others last
                    const rank = (paidBy: string) => {
                      const payers = paidBy.split(" + ");
                      if (payers.length === 1 && payers[0] === ownName) return 0;
                      if (payers.includes(ownName)) return 1;
                      return 2;
                    };
                    const entries = [...groups.entries()].sort(
                      (a, b) => rank(a[0]) - rank(b[0]),
                    );
                    return (
                      <div className="mt-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                          {isYou ? "Your" : "Their"} personal items
                        </div>
                        <div className="mt-1 space-y-2">
                          {entries.map(([paidBy, items]) => {
                            const subtotal = items.reduce(
                              (sum, x) => sum + x.costCents,
                              0,
                            );
                            const payers = paidBy.split(" + ");
                            const ownFully =
                              payers.length === 1 && payers[0] === ownName;
                            const ownPartly =
                              payers.length > 1 && payers.includes(ownName);
                            const note = ownFully
                              ? isYou
                                ? "you paid"
                                : "self-paid"
                              : ownPartly
                                ? "partly yours"
                                : isYou
                                  ? `you owe ${paidBy}`
                                  : `owes ${paidBy}`;
                            return (
                              <div key={paidBy}>
                                <div className="flex items-baseline justify-between gap-2 text-xs font-medium text-zinc-500">
                                  <span className="min-w-0 truncate">
                                    {ownFully
                                      ? `On ${isYou ? "your" : "their"} own bill`
                                      : `On ${paidBy}'s bill`}
                                  </span>
                                  <span className="shrink-0">
                                    {formatCents(subtotal)} · {note}
                                  </span>
                                </div>
                                <ul className="mt-0.5 space-y-0.5 text-xs">
                                  {items.map((item, i) => (
                                    <li
                                      key={i}
                                      className="flex justify-between gap-2 pl-3"
                                    >
                                      <Link
                                        href={`/bills/${item.billId}`}
                                        className="min-w-0 truncate underline decoration-zinc-300 underline-offset-2"
                                      >
                                        {item.name}
                                      </Link>
                                      <span className="shrink-0">
                                        {formatCents(item.costCents)}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
              </details>
            </div>
          );
        })}
      </div>

      {settlement.transfers.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <h3 className="mb-2 font-semibold">To settle up now</h3>
          <ul className="space-y-2 text-sm">
            {settlement.transfers.map((t, i) => {
              const involvesYou =
                t.fromPersonId === sessionPersonId ||
                t.toPersonId === sessionPersonId;
              return (
                <li
                  key={i}
                  className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${
                    involvesYou ? "font-medium" : ""
                  }`}
                >
                  <span>
                    {youOr(t.fromPersonId)}
                    {t.fromPersonId === sessionPersonId ? " pay " : " pays "}
                    {youOr(t.toPersonId).toLowerCase() === "you"
                      ? "you"
                      : youOr(t.toPersonId)}{" "}
                    <span className="font-semibold">
                      {formatCents(t.amountCents)}
                    </span>
                  </span>
                  {editable && monthId !== undefined && (
                    <MarkPaidButton
                      monthId={monthId}
                      fromPersonId={t.fromPersonId}
                      toPersonId={t.toPersonId}
                      amountCents={t.amountCents}
                      fromName={nameOf(t.fromPersonId)}
                      toName={nameOf(t.toPersonId)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-zinc-500">
            Paying these brings everyone to zero. Or carry balances into next
            month — they roll over automatically.
          </p>
        </div>
      )}

      {editable && monthId !== undefined && (
        <RecordPaymentForm
          monthId={monthId}
          people={persons.map((p) => ({ id: p.id, name: p.name }))}
          sessionPersonId={sessionPersonId}
        />
      )}

      {repayments.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <h3 className="mb-2 font-semibold">Settled this month</h3>
          <ul className="space-y-1 text-sm">
            {repayments.map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                <span className="flex-1">
                  {r.paidDate} · {youOr(r.fromPersonId)} paid{" "}
                  {r.toPersonId === sessionPersonId ? "you" : nameOf(r.toPersonId)}{" "}
                  <span className="font-semibold">
                    {formatCents(r.amountCents)}
                  </span>
                </span>
                <DeleteRepaymentButton repaymentId={r.id} disabled={!editable} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  signed = false,
}: {
  label: string;
  value: number;
  signed?: boolean;
}) {
  const text = signed
    ? `${value >= 0 ? "+" : "−"} ${formatCents(Math.abs(value))}`
    : formatCents(value);
  return (
    <div className="flex justify-between">
      <dt>{label}</dt>
      <dd className={value < 0 ? "text-red-600/80" : ""}>{text}</dd>
    </div>
  );
}
