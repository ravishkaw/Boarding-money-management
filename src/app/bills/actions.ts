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
  const amountCents = parseAmount(String(formData.get("amount") ?? ""));
  const payerPersonId = Number(formData.get("payerPersonId"));
  const billDate = String(formData.get("billDate") ?? "");
  const status = String(formData.get("status") ?? "shared") as
    | "shared"
    | "personal";
  const ownerRaw = formData.get("ownerPersonId");
  const ownerPersonId = ownerRaw ? Number(ownerRaw) : null;

  if (!description) return { error: "Give it a description." };
  if (amountCents === null || amountCents <= 0)
    return { error: "Enter a valid amount." };
  if (!Number.isInteger(payerPersonId))
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
        payerPersonId,
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
        unitPriceCents: amountCents,
        quantity: 1,
        lineTotalCents: amountCents,
        status,
        ownerPersonId: status === "personal" ? ownerPersonId : null,
      })
      .run();
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

  db.update(schema.bills)
    .set({ payerPersonId })
    .where(eq(schema.bills.id, billId))
    .run();

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
    tx.delete(schema.bills).where(eq(schema.bills.id, billId)).run();
  });

  revalidatePath("/");
  redirect("/");
}
