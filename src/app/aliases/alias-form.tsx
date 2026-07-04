"use client";

import { useActionState } from "react";
import { saveAlias, type ActionState } from "./actions";

export function AliasForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveAlias,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-2 sm:flex-row">
      <input
        name="matchKey"
        placeholder="Item code or receipt name"
        required
        className="flex-1 rounded-xl border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      <input
        name="friendlyName"
        placeholder="Friendly name"
        required
        className="flex-1 rounded-xl border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
