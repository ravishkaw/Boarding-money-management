import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Activity } from "@/db/schema";

/**
 * Record who did what. Called after the change has been written, never
 * inside its transaction, so a failed change leaves no log entry.
 */
export function logActivity(entry: {
  personId: number | null;
  billId?: number | null;
  action: string;
  detail: string;
}): void {
  db.insert(schema.activity)
    .values({
      personId: entry.personId,
      billId: entry.billId ?? null,
      action: entry.action,
      detail: entry.detail,
    })
    .run();
}

export function listActivity(limit = 100): Activity[] {
  return db
    .select()
    .from(schema.activity)
    .orderBy(desc(schema.activity.id))
    .limit(limit)
    .all();
}

export function listBillActivity(billId: number): Activity[] {
  return db
    .select()
    .from(schema.activity)
    .where(eq(schema.activity.billId, billId))
    .orderBy(desc(schema.activity.id))
    .all();
}

/** "17 Sep, 02:41" in the house's timezone. */
export function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Colombo",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
