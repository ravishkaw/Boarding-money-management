"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { getSession } from "@/lib/auth";

export type ActionState = { error?: string };

export async function saveAlias(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };

  const matchKey = String(formData.get("matchKey") ?? "").trim().toLowerCase();
  const friendlyName = String(formData.get("friendlyName") ?? "").trim();
  if (!matchKey || !friendlyName)
    return { error: "Both the receipt name/code and the friendly name are needed." };

  db.insert(schema.itemAliases)
    .values({ matchKey, friendlyName })
    .onConflictDoUpdate({
      target: schema.itemAliases.matchKey,
      set: { friendlyName },
    })
    .run();

  revalidatePath("/aliases");
  return {};
}

export async function deleteAlias(aliasId: number): Promise<void> {
  const session = await getSession();
  if (!session) return;
  db.delete(schema.itemAliases)
    .where(eq(schema.itemAliases.id, aliasId))
    .run();
  revalidatePath("/aliases");
}
