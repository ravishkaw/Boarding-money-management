"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { logActivity } from "@/lib/activity";
import { getSession } from "@/lib/auth";
import { monthLabel } from "@/lib/data";

export async function setMonthStatus(
  monthId: number,
  status: "open" | "closed",
): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const month = db
    .select()
    .from(schema.months)
    .where(eq(schema.months.id, monthId))
    .get();
  if (!month || month.status === status) return;

  db.update(schema.months)
    .set({ status })
    .where(eq(schema.months.id, monthId))
    .run();

  logActivity({
    personId: session.personId,
    action: status === "closed" ? "closed a month" : "reopened a month",
    detail:
      status === "closed"
        ? `${monthLabel(month)} is locked — nothing in it can change until it's reopened`
        : `${monthLabel(month)} can be edited again`,
  });

  revalidatePath("/");
  revalidatePath("/months");
}
