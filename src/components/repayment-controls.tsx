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
