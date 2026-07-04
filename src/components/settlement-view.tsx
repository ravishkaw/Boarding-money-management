import type { Person, Repayment } from "@/db/schema";
import type { Settlement } from "@/lib/settlement";
import { formatCents } from "@/lib/money";
import {
  DeleteRepaymentButton,
  MarkPaidButton,
} from "./repayment-controls";

export function SettlementView({
  settlement,
  persons,
  monthId,
  editable = false,
  repayments = [],
}: {
  settlement: Settlement;
  persons: Person[];
  monthId?: number;
  editable?: boolean;
  repayments?: Repayment[];
}) {
  const nameOf = (id: number) =>
    persons.find((p) => p.id === id)?.name.split(" ")[0] ?? `#${id}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {settlement.persons.map((p) => (
          <div
            key={p.personId}
            className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <div className="text-lg font-semibold">{nameOf(p.personId)}</div>
            <dl className="mt-2 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
              <Row label="Opening" value={p.openingCents} />
              <Row label="Paid" value={p.paidCents} />
              <Row label="Fair share" value={-p.fairShareCents} />
              {p.personalCents !== 0 && (
                <Row label="Personal" value={-p.personalCents} />
              )}
              {p.repaidCents !== 0 && (
                <Row
                  label={p.repaidCents > 0 ? "Settled up (paid)" : "Settled up (got)"}
                  value={p.repaidCents}
                />
              )}
            </dl>
            <div
              className={`mt-3 text-xl font-bold ${
                p.closingCents >= 0 ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {formatCents(p.closingCents)}
            </div>
            <div className="text-xs text-zinc-500">
              {p.closingCents >= 0 ? "house owes them" : "they owe the house"}
            </div>
          </div>
        ))}
      </div>

      {settlement.transfers.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <h3 className="mb-2 font-semibold">To settle up now</h3>
          <ul className="space-y-2 text-sm">
            {settlement.transfers.map((t, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-2">
                <span>
                  <span className="font-medium">{nameOf(t.fromPersonId)}</span>
                  {" pays "}
                  <span className="font-medium">{nameOf(t.toPersonId)}</span>{" "}
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
            ))}
          </ul>
        </div>
      )}

      {repayments.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <h3 className="mb-2 font-semibold">Settled this month</h3>
          <ul className="space-y-1 text-sm">
            {repayments.map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                <span className="flex-1">
                  {r.paidDate} · {nameOf(r.fromPersonId)} paid{" "}
                  {nameOf(r.toPersonId)}{" "}
                  <span className="font-semibold">
                    {formatCents(r.amountCents)}
                  </span>
                </span>
                <DeleteRepaymentButton
                  repaymentId={r.id}
                  disabled={!editable}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <dt>{label}</dt>
      <dd className={value < 0 ? "text-red-600/80" : ""}>
        {formatCents(value)}
      </dd>
    </div>
  );
}
