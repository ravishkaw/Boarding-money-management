"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { getSession } from "@/lib/auth";

export type ActionState = { error?: string };

function monthById(monthId: number) {
  return db
    .select()
    .from(schema.months)
    .where(eq(schema.months.id, monthId))
    .get();
}

export async function recordRepayment(
  monthId: number,
  fromPersonId: number,
  toPersonId: number,
  amountCents: number,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };
  if (fromPersonId === toPersonId)
    return { error: "Payer and receiver must differ." };
  if (!Number.isInteger(amountCents) || amountCents <= 0)
    return { error: "Invalid amount." };

  const month = monthById(monthId);
  if (!month) return { error: "Month not found." };
  if (month.status === "closed")
    return { error: "That month is closed. Reopen it first." };

  db.insert(schema.repayments)
    .values({
      monthId,
      fromPersonId,
      toPersonId,
      amountCents,
      paidDate: new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Colombo",
      }).format(new Date()),
    })
    .run();

  revalidatePath("/");
  return {};
}

export async function deleteRepayment(
  repaymentId: number,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };

  const repayment = db
    .select()
    .from(schema.repayments)
    .where(eq(schema.repayments.id, repaymentId))
    .get();
  if (!repayment) return { error: "Not found." };
  const month = monthById(repayment.monthId);
  if (month?.status === "closed")
    return { error: "That month is closed. Reopen it first." };

  db.delete(schema.repayments)
    .where(eq(schema.repayments.id, repaymentId))
    .run();

  revalidatePath("/");
  return {};
}
