import type { Person } from "@/db/schema";
import type { Settlement } from "@/lib/settlement";
import { formatCents } from "@/lib/money";

export function SettlementView({
  settlement,
  persons,
}: {
  settlement: Settlement;
  persons: Person[];
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
          <ul className="space-y-1 text-sm">
            {settlement.transfers.map((t, i) => (
              <li key={i}>
                <span className="font-medium">{nameOf(t.fromPersonId)}</span>
                {" pays "}
                <span className="font-medium">{nameOf(t.toPersonId)}</span>{" "}
                <span className="font-semibold">
                  {formatCents(t.amountCents)}
                </span>
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
