import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { AliasForm } from "./alias-form";
import { deleteAlias } from "./actions";

export const dynamic = "force-dynamic";

export default function AliasesPage() {
  const aliases = db
    .select()
    .from(schema.itemAliases)
    .orderBy(asc(schema.itemAliases.friendlyName))
    .all();

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">Item names</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Receipt names are auto-renamed using this list on every import. Add
          to it here, or tap an item name on any bill and tick
          &quot;remember&quot;.
        </p>
      </div>

      <AliasForm />

      {aliases.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No saved names yet.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {aliases.map((alias) => (
            <li
              key={alias.id}
              className="flex items-center justify-between gap-3 px-4 py-2.5"
            >
              <div className="min-w-0">
                <div className="font-medium">{alias.friendlyName}</div>
                <div className="truncate text-xs text-zinc-500">
                  {alias.matchKey}
                </div>
              </div>
              <form action={deleteAlias.bind(null, alias.id)}>
                <button
                  type="submit"
                  className="text-xs text-red-600 underline"
                >
                  remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
