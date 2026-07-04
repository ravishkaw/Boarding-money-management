"use client";

import { useActionState, useState } from "react";
import { login, type LoginState } from "./actions";

type PersonOption = { id: number; name: string };

export function LoginForm({ people }: { people: PersonOption[] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    login,
    {},
  );

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-2">
        {people.map((p) => (
          <label
            key={p.id}
            className={`cursor-pointer rounded-xl border px-4 py-3 text-center text-lg font-medium transition ${
              selected === p.id
                ? "border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
                : "border-zinc-300 dark:border-zinc-700"
            }`}
          >
            <input
              type="radio"
              name="personId"
              value={p.id}
              className="sr-only"
              onChange={() => setSelected(p.id)}
            />
            {p.name}
          </label>
        ))}
      </div>

      <input
        type="password"
        name="pin"
        inputMode="numeric"
        autoComplete="current-password"
        pattern="\d{4,6}"
        maxLength={6}
        placeholder="PIN"
        required
        className="rounded-xl border border-zinc-300 px-4 py-3 text-center text-2xl tracking-[0.5em] dark:border-zinc-700 dark:bg-zinc-900"
      />

      {state.error && (
        <p className="text-center text-sm text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending || selected === null}
        className="rounded-xl bg-emerald-600 px-4 py-3 text-lg font-semibold text-white disabled:opacity-40"
      >
        {pending ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}
