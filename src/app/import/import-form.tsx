"use client";

import Link from "next/link";
import { useActionState } from "react";
import { importBill, type ImportState } from "./actions";

export function ImportForm() {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(
    importBill,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Keells e-bill link</span>
        <textarea
          name="url"
          rows={4}
          required
          placeholder="https://digibillaccess.keellssuper.com/ebill/…"
          className="rounded-xl border border-zinc-300 px-4 py-3 text-sm break-all dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      <p className="text-xs text-zinc-500">
        Open the e-bill email/SMS, copy the link, and paste it here. Items,
        prices and quantities are read automatically. You review everything
        before it counts.
      </p>

      {state.error && (
        <p className="text-sm text-red-600">
          {state.error}{" "}
          {state.existingBillId && (
            <Link
              href={`/bills/${state.existingBillId}`}
              className="underline"
            >
              View it →
            </Link>
          )}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-emerald-600 px-4 py-3 text-lg font-semibold text-white disabled:opacity-40"
      >
        {pending ? "Fetching bill…" : "Fetch & review"}
      </button>
    </form>
  );
}
