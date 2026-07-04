"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { getSession } from "@/lib/auth";

export async function setMonthStatus(
  monthId: number,
  status: "open" | "closed",
): Promise<void> {
  const session = await getSession();
  if (!session) return;
  db.update(schema.months)
    .set({ status })
    .where(eq(schema.months.id, monthId))
    .run();
  revalidatePath("/");
  revalidatePath("/months");
}
