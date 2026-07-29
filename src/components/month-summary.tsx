import type { Settlement } from "@/lib/settlement";
import { formatCents } from "@/lib/money";

/**
 * Compact stats strip for a month: total spent (shared + personal),
 * the shared pool with per-person fair share, personal-item spend, and
 * how many bills it came from.
 */
export function MonthSummary({
  settlement,
  billCount,
  personCount,
  sessionPersonId,
}: {
  settlement: Settlement;
  billCount: number;
  personCount: number;
  sessionPersonId?: number;
}) {
  const personalTotal = settlement.persons.reduce(
    (sum, p) => sum + p.personalCents,
    0,
  );
  const sharedPool = settlement.sharedPoolCents;
  const total = sharedPool + personalTotal;
  const perPerson = personCount > 0 ? Math.round(sharedPool / personCount) : 0;

  // Prefer the signed-in person's own personal spend; fall back to the
  // household total when there's no session.
  const mine = settlement.persons.find((p) => p.personId === sessionPersonId);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label="Total this month" value={formatCents(total)} accent />
      <Stat
        label="Shared"
        value={formatCents(sharedPool)}
        sub={`${formatCents(perPerson)} each`}
      />
      {mine ? (
        <Stat
          label="Your personal"
          value={formatCents(mine.personalCents)}
          sub={`${formatCents(personalTotal)} all`}
        />
      ) : (
        <Stat label="Personal" value={formatCents(personalTotal)} />
      )}
      <Stat
        label="Bills"
        value={String(billCount)}
        sub={billCount === 1 ? "entry" : "entries"}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`min-w-0 rounded-2xl border p-3 ${
        accent
          ? "border-emerald-400 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-0.5 truncate text-lg font-bold">{value}</div>
      {sub && <div className="truncate text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}
