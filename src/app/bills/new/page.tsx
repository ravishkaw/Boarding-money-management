import { getSession } from "@/lib/auth";
import { listPersons } from "@/lib/data";
import { QuickAddForm } from "./quick-add-form";

export const dynamic = "force-dynamic";

const PRESETS = [
  { description: "Boarding Fee", amount: "50000" },
  { description: "Boarding Bills", amount: "" },
  { description: "Kottu", amount: "" },
  { description: "Fried Rice", amount: "" },
];

export default async function QuickAddPage() {
  const session = await getSession();
  const people = listPersons().map((p) => ({ id: p.id, name: p.name }));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
  }).format(new Date());

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Quick add</h1>
      <QuickAddForm
        people={people}
        defaultPayerId={session?.personId ?? people[0]?.id}
        today={today}
        presets={PRESETS}
      />
    </main>
  );
}
