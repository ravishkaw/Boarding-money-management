"use client";

import { useState, useTransition } from "react";
import { deleteBill, setBillPayer, setItemStatus } from "../actions";

type PersonOption = { id: number; name: string };

export function PayerPicker({
  billId,
  people,
  payerId,
  disabled,
}: {
  billId: number;
  people: PersonOption[];
  payerId: number | null;
  disabled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium">Who paid?</span>
      <div className="grid grid-cols-3 gap-2">
        {people.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={disabled || pending}
            onClick={() =>
              startTransition(async () => {
                const res = await setBillPayer(billId, p.id);
                setError(res.error ?? null);
              })
            }
            className={`rounded-xl border px-2 py-2 text-sm disabled:opacity-50 ${
              payerId === p.id
                ? "border-emerald-600 bg-emerald-50 font-semibold dark:bg-emerald-950"
                : "border-zinc-300 dark:border-zinc-700"
            }`}
          >
            {p.name.split(" ")[0]}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

export function ItemStatusControl({
  itemId,
  status,
  ownerPersonId,
  people,
  disabled,
}: {
  itemId: number;
  status: "shared" | "personal" | "excluded";
  ownerPersonId: number | null;
  people: PersonOption[];
  disabled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const apply = (
    next: "shared" | "personal" | "excluded",
    owner: number | null,
  ) =>
    startTransition(async () => {
      const res = await setItemStatus(itemId, next, owner);
      setError(res.error ?? null);
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <select
        value={status === "personal" ? `personal:${ownerPersonId ?? ""}` : status}
        disabled={disabled || pending}
        onChange={(e) => {
          const v = e.target.value;
          if (v.startsWith("personal:")) {
            apply("personal", Number(v.split(":")[1]));
          } else {
            apply(v as "shared" | "excluded", null);
          }
        }}
        className={`rounded-lg border px-2 py-1 text-xs dark:bg-zinc-900 ${
          status === "shared"
            ? "border-zinc-300 dark:border-zinc-700"
            : status === "personal"
              ? "border-amber-500 text-amber-700 dark:text-amber-400"
              : "border-red-300 text-red-600 line-through"
        }`}
      >
        <option value="shared">Shared</option>
        {people.map((p) => (
          <option key={p.id} value={`personal:${p.id}`}>
            {p.name.split(" ")[0]}&apos;s
          </option>
        ))}
        <option value="excluded">Exclude</option>
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function DeleteBillButton({
  billId,
  disabled,
}: {
  billId: number;
  disabled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={disabled || pending}
      onClick={() => {
        if (confirm("Delete this bill and all its items?"))
          startTransition(() => deleteBill(billId));
      }}
      className="text-sm text-red-600 underline disabled:opacity-50"
    >
      {pending ? "Deleting…" : "Delete bill"}
    </button>
  );
}
