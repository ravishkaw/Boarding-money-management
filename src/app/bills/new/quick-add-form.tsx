"use client";

import { useActionState, useState } from "react";
import { createManualBill, type ActionState } from "../actions";

type PersonOption = { id: number; name: string };
type Preset = { description: string; amount: string };

export function QuickAddForm({
  people,
  defaultPayerId,
  today,
  presets,
}: {
  people: PersonOption[];
  defaultPayerId: number;
  today: string;
  presets: Preset[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createManualBill,
    {},
  );
  const [description, setDescription] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [personal, setPersonal] = useState(false);

  const priceNum = Number(unitPrice.replace(/,/g, ""));
  const qtyNum = Number(quantity);
  const total =
    priceNum > 0 && qtyNum > 0
      ? Math.round(priceNum * qtyNum * 100) / 100
      : null;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <button
            key={preset.description}
            type="button"
            onClick={() => {
              setDescription(preset.description);
              setUnitPrice(preset.amount);
              setQuantity("1");
            }}
            className="rounded-full border border-zinc-300 px-3 py-1 text-sm dark:border-zinc-700"
          >
            {preset.description}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">What was it?</span>
        <input
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Kottu, Boarding Fee, Water bill…"
          required
          className="rounded-xl border border-zinc-300 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      <div className="grid grid-cols-[2fr_1fr] gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Price (Rs.)</span>
          <input
            name="unitPrice"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            inputMode="decimal"
            placeholder="1500.00"
            required
            className="rounded-xl border border-zinc-300 px-4 py-3 text-lg dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Qty</span>
          <input
            name="quantity"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            inputMode="decimal"
            placeholder="1"
            className="rounded-xl border border-zinc-300 px-4 py-3 text-lg dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      </div>
      {total !== null && qtyNum !== 1 && (
        <p className="text-sm text-zinc-500">
          Total:{" "}
          <span className="font-semibold text-zinc-800 dark:text-zinc-200">
            Rs. {total.toLocaleString("en-LK")}
          </span>
        </p>
      )}

      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">Who paid?</legend>
        <div className="grid grid-cols-3 gap-2">
          {people.map((p) => (
            <label key={p.id} className="cursor-pointer">
              <input
                type="radio"
                name="payerPersonId"
                value={p.id}
                defaultChecked={p.id === defaultPayerId}
                className="peer sr-only"
              />
              <span className="block rounded-xl border border-zinc-300 px-2 py-2 text-center text-sm peer-checked:border-emerald-600 peer-checked:bg-emerald-50 peer-checked:font-semibold dark:border-zinc-700 dark:peer-checked:bg-emerald-950">
                {p.name.split(" ")[0]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Date</span>
        <input
          type="date"
          name="billDate"
          defaultValue={today}
          required
          className="rounded-xl border border-zinc-300 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={personal}
          onChange={(e) => setPersonal(e.target.checked)}
          className="size-4"
        />
        This is a personal spend (not shared)
      </label>
      <input type="hidden" name="status" value={personal ? "personal" : "shared"} />

      {personal && (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm font-medium">Whose is it?</legend>
          <div className="grid grid-cols-3 gap-2">
            {people.map((p) => (
              <label key={p.id} className="cursor-pointer">
                <input
                  type="radio"
                  name="ownerPersonId"
                  value={p.id}
                  className="peer sr-only"
                />
                <span className="block rounded-xl border border-zinc-300 px-2 py-2 text-center text-sm peer-checked:border-amber-600 peer-checked:bg-amber-50 peer-checked:font-semibold dark:border-zinc-700 dark:peer-checked:bg-amber-950">
                  {p.name.split(" ")[0]}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-emerald-600 px-4 py-3 text-lg font-semibold text-white disabled:opacity-40"
      >
        {pending ? "Saving…" : "Add"}
      </button>
    </form>
  );
}
