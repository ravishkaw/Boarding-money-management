import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentYm, getMonth, listPersons } from "@/lib/data";
import { formatCentsPlain } from "@/lib/money";
import { ChangePinForm, OpeningBalancesForm } from "./settings-forms";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const persons = listPersons();
  const { year, month } = currentYm();
  const defaultYm = `${year}-${String(month).padStart(2, "0")}`;

  // Show existing manual overrides for the current month, if any
  const monthRow = getMonth(year, month);
  const current: Record<number, string> = {};
  if (monthRow) {
    const rows = db
      .select()
      .from(schema.openingBalances)
      .where(eq(schema.openingBalances.monthId, monthRow.id))
      .all();
    for (const row of rows) {
      if (row.source === "manual")
        current[row.personId] = formatCentsPlain(row.amountCents).replace(
          /,/g,
          "",
        );
    }
  }

  return (
    <main className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Opening balances</h2>
        <p className="text-sm text-zinc-500">
          Only needed for your very first month (copy the &quot;Difference&quot;
          row from the last Excel sheet), or to correct a carried balance.
        </p>
        <OpeningBalancesForm
          people={persons.map((p) => ({ id: p.id, name: p.name }))}
          defaultYm={defaultYm}
          current={current}
        />
      </section>

      <section className="flex flex-col gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <h2 className="font-semibold">Change my PIN</h2>
        <ChangePinForm />
      </section>
    </main>
  );
}
