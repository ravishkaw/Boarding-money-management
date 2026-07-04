"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { getSession } from "@/lib/auth";
import { getBillWithItems, getOrCreateMonth } from "@/lib/data";
import { parseAmount } from "@/lib/money";

export type ActionState = { error?: string };

function monthOfBill(billId: number) {
  const bill = db
    .select()
    .from(schema.bills)
    .where(eq(schema.bills.id, billId))
    .get();
  if (!bill) return null;
  return db
    .select()
    .from(schema.months)
    .where(eq(schema.months.id, bill.monthId))
    .get();
}

function assertOpen(billId: number): string | null {
  const month = monthOfBill(billId);
  if (!month) return "Bill not found.";
  if (month.status === "closed")
    return "That month is closed. Reopen it first to make changes.";
  return null;
}

export async function createManualBill(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };

  const description = String(formData.get("description") ?? "").trim();
  const unitPriceCents = parseAmount(String(formData.get("unitPrice") ?? ""));
  const qtyRaw = String(formData.get("quantity") ?? "1").trim() || "1";
  const quantity = /^\d+(\.\d{1,3})?$/.test(qtyRaw) ? Number(qtyRaw) : null;
  const splitMode = formData.get("splitMode") === "1";
  const payerPersonId = Number(formData.get("payerPersonId"));
  const billDate = String(formData.get("billDate") ?? "");
  const status = String(formData.get("status") ?? "shared") as
    | "shared"
    | "personal";
  const ownerRaw = formData.get("ownerPersonId");
  const ownerPersonId = ownerRaw ? Number(ownerRaw) : null;

  if (!description) return { error: "Give it a description." };
  if (unitPriceCents === null || unitPriceCents <= 0)
    return { error: "Enter a valid price." };
  if (quantity === null || quantity <= 0)
    return { error: "Enter a valid quantity." };
  const amountCents = Math.round(unitPriceCents * quantity);

  // Optional split between payers: entries must add up to the total.
  let split: { personId: number; amountCents: number }[] = [];
  if (splitMode) {
    for (const [key, value] of formData.entries()) {
      const match = /^splitAmount_(\d+)$/.exec(key);
      if (!match) continue;
      const cents = parseAmount(String(value).trim() || "0");
      if (cents === null) return { error: "Split amounts must be numbers." };
      if (cents > 0) split.push({ personId: Number(match[1]), amountCents: cents });
    }
    if (split.length === 0) return { error: "Enter who put in how much." };
    const sum = split.reduce((total, s) => total + s.amountCents, 0);
    if (sum !== amountCents)
      return {
        error: `Split adds up to ${(sum / 100).toFixed(2)} but the total is ${(amountCents / 100).toFixed(2)}.`,
      };
  }
  const effectivePayerId = splitMode
    ? [...split].sort((a, b) => b.amountCents - a.amountCents)[0].personId
    : payerPersonId;
  if (!Number.isInteger(effectivePayerId))
    return { error: "Pick who paid." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(billDate))
    return { error: "Pick a date." };
  if (status === "personal" && !ownerPersonId)
    return { error: "Pick whose personal spend this is." };

  const [year, month] = billDate.split("-").map(Number);
  const monthRow = getOrCreateMonth(year, month);
  if (monthRow.status === "closed")
    return { error: `${billDate} falls in a closed month. Reopen it first.` };

  db.transaction((tx) => {
    const bill = tx
      .insert(schema.bills)
      .values({
        monthId: monthRow.id,
        source: "manual",
        status: "confirmed",
        payerPersonId: effectivePayerId,
        billDate,
        grossCents: amountCents,
        discountCents: 0,
        netCents: amountCents,
      })
      .returning()
      .get();
    tx.insert(schema.billItems)
      .values({
        billId: bill.id,
        lineNo: 1,
        rawName: description,
        displayName: description,
        unitPriceCents,
        quantity,
        lineTotalCents: amountCents,
        status,
        ownerPersonId: status === "personal" ? ownerPersonId : null,
      })
      .run();
    if (split.length > 1) {
      for (const entry of split) {
        tx.insert(schema.billPayments)
          .values({
            billId: bill.id,
            personId: entry.personId,
            amountCents: entry.amountCents,
          })
          .run();
      }
    }
  });

  revalidatePath("/");
  redirect("/");
}

export async function setItemStatus(
  itemId: number,
  status: "shared" | "personal" | "excluded",
  ownerPersonId: number | null,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };
  if (status === "personal" && !ownerPersonId)
    return { error: "Personal items need an owner." };

  const item = db
    .select()
    .from(schema.billItems)
    .where(eq(schema.billItems.id, itemId))
    .get();
  if (!item) return { error: "Item not found." };
  const closed = assertOpen(item.billId);
  if (closed) return { error: closed };

  db.update(schema.billItems)
    .set({ status, ownerPersonId: status === "personal" ? ownerPersonId : null })
    .where(eq(schema.billItems.id, itemId))
    .run();

  revalidatePath("/");
  revalidatePath(`/bills/${item.billId}`);
  return {};
}

export async function setBillPayer(
  billId: number,
  payerPersonId: number,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };
  const closed = assertOpen(billId);
  if (closed) return { error: closed };

  db.transaction((tx) => {
    // single payer: drop any split rows
    tx.delete(schema.billPayments)
      .where(eq(schema.billPayments.billId, billId))
      .run();
    tx.update(schema.bills)
      .set({ payerPersonId })
      .where(eq(schema.bills.id, billId))
      .run();
  });

  revalidatePath("/");
  revalidatePath(`/bills/${billId}`);
  return {};
}

export async function setBillSplit(
  billId: number,
  split: { personId: number; amountCents: number }[],
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };
  const closed = assertOpen(billId);
  if (closed) return { error: closed };

  const bill = db
    .select()
    .from(schema.bills)
    .where(eq(schema.bills.id, billId))
    .get();
  if (!bill) return { error: "Bill not found." };

  const entries = split.filter(
    (s) => Number.isInteger(s.amountCents) && s.amountCents > 0,
  );
  if (entries.length === 0) return { error: "Enter at least one amount." };
  const sum = entries.reduce((total, s) => total + s.amountCents, 0);
  if (sum !== bill.netCents)
    return {
      error: `Shares add up to ${(sum / 100).toFixed(2)} but the bill is ${(bill.netCents / 100).toFixed(2)}.`,
    };

  const primary = [...entries].sort((a, b) => b.amountCents - a.amountCents)[0];
  db.transaction((tx) => {
    tx.delete(schema.billPayments)
      .where(eq(schema.billPayments.billId, billId))
      .run();
    if (entries.length === 1) {
      tx.update(schema.bills)
        .set({ payerPersonId: entries[0].personId })
        .where(eq(schema.bills.id, billId))
        .run();
      return;
    }
    for (const entry of entries) {
      tx.insert(schema.billPayments)
        .values({
          billId,
          personId: entry.personId,
          amountCents: entry.amountCents,
        })
        .run();
    }
    tx.update(schema.bills)
      .set({ payerPersonId: primary.personId })
      .where(eq(schema.bills.id, billId))
      .run();
  });

  revalidatePath("/");
  revalidatePath(`/bills/${billId}`);
  return {};
}

export async function confirmBill(billId: number): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };
  const closed = assertOpen(billId);
  if (closed) return { error: closed };

  const bill = db
    .select()
    .from(schema.bills)
    .where(eq(schema.bills.id, billId))
    .get();
  if (!bill) return { error: "Bill not found." };
  if (bill.payerPersonId == null)
    return { error: "Pick who paid before confirming." };

  const missingOwner = db
    .select()
    .from(schema.billItems)
    .where(eq(schema.billItems.billId, billId))
    .all()
    .some((item) => item.status === "personal" && item.ownerPersonId == null);
  if (missingOwner)
    return { error: "A personal item is missing its owner." };

  db.update(schema.bills)
    .set({ status: "confirmed" })
    .where(eq(schema.bills.id, billId))
    .run();

  revalidatePath("/");
  revalidatePath(`/bills/${billId}`);
  return {};
}

export async function renameItem(
  itemId: number,
  displayName: string,
  remember: boolean,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };
  const name = displayName.trim();
  if (!name) return { error: "Name can't be empty." };

  const item = db
    .select()
    .from(schema.billItems)
    .where(eq(schema.billItems.id, itemId))
    .get();
  if (!item) return { error: "Item not found." };
  const closed = assertOpen(item.billId);
  if (closed) return { error: closed };

  db.update(schema.billItems)
    .set({ displayName: name })
    .where(eq(schema.billItems.id, itemId))
    .run();

  if (remember) {
    const { normalizeMatchKey } = await import("@/lib/keells/parse");
    const matchKey = item.itemCode ?? normalizeMatchKey(item.rawName);
    db.insert(schema.itemAliases)
      .values({ matchKey, friendlyName: name })
      .onConflictDoUpdate({
        target: schema.itemAliases.matchKey,
        set: { friendlyName: name },
      })
      .run();
  }

  revalidatePath(`/bills/${item.billId}`);
  revalidatePath("/aliases");
  return {};
}

export async function deleteBill(billId: number): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const closed = assertOpen(billId);
  if (closed) return;

  const bill = getBillWithItems(billId);
  if (!bill) return;

  db.transaction((tx) => {
    tx.delete(schema.billItems)
      .where(eq(schema.billItems.billId, billId))
      .run();
    tx.delete(schema.billDiscounts)
      .where(eq(schema.billDiscounts.billId, billId))
      .run();
    tx.delete(schema.billPayments)
      .where(eq(schema.billPayments.billId, billId))
      .run();
    tx.delete(schema.bills).where(eq(schema.bills.id, billId)).run();
  });

  revalidatePath("/");
  redirect("/");
}
