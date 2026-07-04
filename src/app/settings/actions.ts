"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { getSession, hashPin, verifyPin } from "@/lib/auth";
import { getOrCreateMonth } from "@/lib/data";
import { parseAmount } from "@/lib/money";

export type ActionState = { error?: string; ok?: string };

export async function saveOpeningBalances(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };

  const ym = String(formData.get("ym") ?? "");
  const match = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!match) return { error: "Pick a month (e.g. 2026-07)." };
  const month = getOrCreateMonth(Number(match[1]), Number(match[2]));

  const personIds = formData
    .getAll("personId")
    .map(Number)
    .filter(Number.isInteger);

  for (const personId of personIds) {
    const raw = String(formData.get(`amount_${personId}`) ?? "").trim();
    if (raw === "") {
      // blank = remove the manual override, fall back to carried balance
      db.delete(schema.openingBalances)
        .where(
          and(
            eq(schema.openingBalances.monthId, month.id),
            eq(schema.openingBalances.personId, personId),
          ),
        )
        .run();
      continue;
    }
    const amountCents = parseAmount(raw);
    if (amountCents === null)
      return { error: `"${raw}" is not a valid amount.` };
    db.insert(schema.openingBalances)
      .values({ monthId: month.id, personId, amountCents, source: "manual" })
      .onConflictDoUpdate({
        target: [
          schema.openingBalances.monthId,
          schema.openingBalances.personId,
        ],
        set: { amountCents, source: "manual" },
      })
      .run();
  }

  revalidatePath("/");
  revalidatePath("/settings");
  return { ok: `Opening balances saved for ${ym}.` };
}

export async function changePin(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };

  const currentPin = String(formData.get("currentPin") ?? "");
  const newPin = String(formData.get("newPin") ?? "");
  if (!/^\d{4,6}$/.test(newPin))
    return { error: "New PIN must be 4-6 digits." };

  const person = db
    .select()
    .from(schema.persons)
    .where(eq(schema.persons.id, session.personId))
    .get();
  if (!person) return { error: "Not signed in." };
  if (!verifyPin(currentPin, person.pinHash))
    return { error: "Current PIN is wrong." };

  db.update(schema.persons)
    .set({ pinHash: hashPin(newPin) })
    .where(eq(schema.persons.id, person.id))
    .run();

  return { ok: "PIN changed." };
}
