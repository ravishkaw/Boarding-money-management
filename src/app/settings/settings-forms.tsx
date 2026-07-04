"use client";

import { useActionState } from "react";
import {
  changePin,
  saveOpeningBalances,
  type ActionState,
} from "./actions";

type PersonOption = { id: number; name: string };

export function OpeningBalancesForm({
  people,
  defaultYm,
  current,
}: {
  people: PersonOption[];
  defaultYm: string;
  current: Record<number, string>;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveOpeningBalances,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Month</span>
        <input
          type="month"
          name="ym"
          defaultValue={defaultYm}
          required
          className="rounded-xl border border-zinc-300 px-4 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      {people.map((p) => (
        <label key={p.id} className="flex items-center justify-between gap-3">
          <span className="text-sm">{p.name}</span>
          <input type="hidden" name="personId" value={p.id} />
          <input
            name={`amount_${p.id}`}
            defaultValue={current[p.id] ?? ""}
            inputMode="decimal"
            placeholder="carried"
            className="w-36 rounded-xl border border-zinc-300 px-3 py-2 text-right dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      ))}
      <p className="text-xs text-zinc-500">
        Positive = the house owes them. Leave blank to use the balance carried
        from the previous month.
      </p>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-600">{state.ok}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-40"
      >
        {pending ? "Saving…" : "Save opening balances"}
      </button>
    </form>
  );
}

export function ChangePinForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    changePin,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Current PIN</span>
        <input
          type="password"
          name="currentPin"
          inputMode="numeric"
          maxLength={6}
          required
          className="rounded-xl border border-zinc-300 px-4 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">New PIN (4-6 digits)</span>
        <input
          type="password"
          name="newPin"
          inputMode="numeric"
          pattern="\d{4,6}"
          maxLength={6}
          required
          className="rounded-xl border border-zinc-300 px-4 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-600">{state.ok}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-zinc-800 px-4 py-2 font-semibold text-white disabled:opacity-40 dark:bg-zinc-200 dark:text-zinc-900"
      >
        {pending ? "Saving…" : "Change PIN"}
      </button>
    </form>
  );
}
