"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { logActivity } from "@/lib/activity";
import { getSession } from "@/lib/auth";
import { formatCentsPlain } from "@/lib/money";

export type ActionState = { error?: string };

function personName(id: number): string {
  const person = db
    .select({ name: schema.persons.name })
    .from(schema.persons)
    .where(eq(schema.persons.id, id))
    .get();
  return person?.name.split(" ")[0] ?? `#${id}`;
}

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

  logActivity({
    personId: session.personId,
    action: "recorded a payment",
    detail: `${personName(fromPersonId)} paid ${personName(toPersonId)} ${formatCentsPlain(amountCents)} in cash`,
  });

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

  logActivity({
    personId: session.personId,
    action: "removed a payment",
    detail: `${repayment.paidDate} · ${personName(repayment.fromPersonId)} → ${personName(repayment.toPersonId)} ${formatCentsPlain(repayment.amountCents)}`,
  });

  revalidatePath("/");
  return {};
}
