"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog, Modal } from "@/components/modal";
import {
  confirmBill,
  deleteBill,
  renameItem,
  setBillPayer,
  setBillSplit,
  setItemStatus,
} from "../actions";

type PersonOption = { id: number; name: string };
type SplitEntry = { personId: number; amountCents: number };

export function PayerPicker({
  billId,
  people,
  payerId,
  split,
  netCents,
  disabled,
}: {
  billId: number;
  people: PersonOption[];
  payerId: number | null;
  /** existing split rows; empty = single payer */
  split: SplitEntry[];
  netCents: number;
  disabled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [splitMode, setSplitMode] = useState(split.length > 0);
  const [amounts, setAmounts] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      people.map((p) => {
        const existing = split.find((s) => s.personId === p.id);
        return [p.id, existing ? (existing.amountCents / 100).toFixed(2) : ""];
      }),
    ),
  );

  const entered = people
    .map((p) => ({
      personId: p.id,
      amountCents: Math.round(Number(amounts[p.id]?.replace(/,/g, "") || 0) * 100),
    }))
    .filter((e) => e.amountCents > 0);
  const enteredSum = entered.reduce((sum, e) => sum + e.amountCents, 0);
  const remaining = netCents - enteredSum;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Who paid?</span>
        {!disabled && (
          <button
            type="button"
            onClick={() => setSplitMode(!splitMode)}
            className="text-xs text-emerald-700 underline dark:text-emerald-400"
          >
            {splitMode ? "Single payer" : "Split between people…"}
          </button>
        )}
      </div>

      {!splitMode ? (
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
                payerId === p.id && split.length === 0
                  ? "border-emerald-600 bg-emerald-50 font-semibold dark:bg-emerald-950"
                  : "border-zinc-300 dark:border-zinc-700"
              }`}
            >
              {p.name.split(" ")[0]}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
          {people.map((p) => (
            <label
              key={p.id}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span>{p.name.split(" ")[0]} put in (Rs.)</span>
              <input
                value={amounts[p.id] ?? ""}
                onChange={(e) =>
                  setAmounts({ ...amounts, [p.id]: e.target.value })
                }
                inputMode="decimal"
                placeholder="0.00"
                disabled={disabled}
                className="w-32 rounded-lg border border-zinc-300 px-3 py-1.5 text-right dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
          ))}
          <p
            className={`text-xs ${remaining === 0 ? "text-emerald-600" : "text-amber-600"}`}
          >
            {remaining === 0
              ? "Adds up to the bill ✓"
              : remaining > 0
                ? `Rs. ${(remaining / 100).toFixed(2)} still unassigned`
                : `Rs. ${(-remaining / 100).toFixed(2)} over the bill total`}
          </p>
          <button
            type="button"
            disabled={disabled || pending || remaining !== 0}
            onClick={() =>
              startTransition(async () => {
                const res = await setBillSplit(billId, entered);
                setError(res.error ?? null);
              })
            }
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {pending ? "Saving…" : "Save split"}
          </button>
        </div>
      )}
      {split.length > 0 && !splitMode && (
        <p className="text-xs text-zinc-500">
          Currently split:{" "}
          {split
            .map(
              (s) =>
                `${people.find((p) => p.id === s.personId)?.name.split(" ")[0]} ${(s.amountCents / 100).toFixed(2)}`,
            )
            .join(" · ")}
        </p>
      )}
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

export function ItemName({
  itemId,
  displayName,
  rawName,
  disabled,
}: {
  itemId: number;
  displayName: string;
  rawName: string;
  disabled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(displayName);
  const [remember, setRemember] = useState(true);

  return (
    <>
      <button
        type="button"
        disabled={disabled || pending}
        title={rawName}
        onClick={() => {
          setName(displayName);
          setOpen(true);
        }}
        className="truncate text-left font-medium underline decoration-dotted underline-offset-2 disabled:no-underline"
      >
        {pending ? "…" : displayName}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Rename item">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = name.trim();
            setOpen(false);
            if (!trimmed || trimmed === displayName) return;
            startTransition(async () => {
              await renameItem(itemId, trimmed, remember);
            });
          }}
          className="flex flex-col gap-3"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className="rounded-xl border border-zinc-300 px-4 py-2.5 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <p className="text-xs text-zinc-500">
            Receipt says: <span className="font-medium">{rawName}</span>
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-4"
            />
            Always use this name on future bills
          </label>
          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Save
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function ConfirmBillButton({ billId }: { billId: number }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await confirmBill(billId);
            if (res.error) setError(res.error);
            else router.push("/");
          })
        }
        className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-lg font-semibold text-white disabled:opacity-40"
      >
        {pending ? "Confirming…" : "Confirm bill"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
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
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() => setOpen(true)}
        className="text-sm text-red-600 underline disabled:opacity-50"
      >
        {pending ? "Deleting…" : "Delete bill"}
      </button>
      <ConfirmDialog
        open={open}
        title="Delete this bill?"
        message="The bill and all its items will be removed, and the settlement will recalculate."
        confirmLabel="Delete"
        danger
        pending={pending}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          startTransition(() => deleteBill(billId));
        }}
      />
    </>
  );
}
