"use client";

import { useState, useTransition } from "react";
import { deleteRepayment, recordRepayment } from "@/app/repayments/actions";
import { formatCents } from "@/lib/money";

export function MarkPaidButton({
  monthId,
  fromPersonId,
  toPersonId,
  amountCents,
  fromName,
  toName,
}: {
  monthId: number;
  fromPersonId: number;
  toPersonId: number;
  amountCents: number;
  fromName: string;
  toName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (
            !confirm(
              `${fromName} handed ${toName} ${formatCents(amountCents)}?`,
            )
          )
            return;
          startTransition(async () => {
            const res = await recordRepayment(
              monthId,
              fromPersonId,
              toPersonId,
              amountCents,
            );
            setError(res.error ?? null);
          });
        }}
        className="rounded-lg border border-emerald-600 px-2 py-0.5 text-xs font-medium text-emerald-700 disabled:opacity-50 dark:text-emerald-400"
      >
        {pending ? "…" : "Mark paid"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}

/**
 * Free-amount settle-up: e.g. Ravishka hands Aditha 2,000 mid-month just to
 * bring the balances closer. Recorded like any repayment.
 */
export function RecordPaymentForm({
  monthId,
  people,
  sessionPersonId,
}: {
  monthId: number;
  people: { id: number; name: string }[];
  sessionPersonId?: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [fromId, setFromId] = useState(sessionPersonId ?? people[0]?.id);
  const [toId, setToId] = useState(
    people.find((p) => p.id !== (sessionPersonId ?? people[0]?.id))?.id,
  );
  const [amount, setAmount] = useState("");

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-sm text-emerald-700 underline dark:text-emerald-400"
      >
        Record a payment between people…
      </button>
    );

  const first = (name: string) => name.split(" ")[0];

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="font-semibold">Record a payment</h3>
      <p className="text-xs text-zinc-500">
        Any amount, any time — e.g. handing over some cash mid-month to
        reduce what you owe. It counts toward the settlement immediately.
      </p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select
          value={fromId}
          onChange={(e) => setFromId(Number(e.target.value))}
          className="rounded-lg border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
        >
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {first(p.name)}
            </option>
          ))}
        </select>
        <span>paid</span>
        <select
          value={toId}
          onChange={(e) => setToId(Number(e.target.value))}
          className="rounded-lg border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
        >
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {first(p.name)}
            </option>
          ))}
        </select>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="Rs. 0.00"
          className="w-28 rounded-lg border border-zinc-300 px-3 py-1.5 text-right dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const cents = Math.round(
              Number(amount.replace(/[,\s]/g, "").replace(/^Rs\.?/i, "")) * 100,
            );
            if (!Number.isFinite(cents) || cents <= 0) {
              setError("Enter a valid amount.");
              return;
            }
            if (fromId === toId) {
              setError("Pick two different people.");
              return;
            }
            startTransition(async () => {
              const res = await recordRepayment(monthId, fromId!, toId!, cents);
              setError(res.error ?? null);
              if (!res.error) {
                setAmount("");
                setOpen(false);
              }
            });
          }}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-zinc-500 underline"
        >
          cancel
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

export function DeleteRepaymentButton({
  repaymentId,
  disabled,
}: {
  repaymentId: number;
  disabled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={disabled || pending}
      onClick={() => {
        if (confirm("Remove this repayment?"))
          startTransition(async () => {
            await deleteRepayment(repaymentId);
          });
      }}
      className="text-xs text-red-600 underline disabled:opacity-40"
    >
      undo
    </button>
  );
}
