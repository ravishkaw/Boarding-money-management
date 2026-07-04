"use server";

import { eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { getSession } from "@/lib/auth";
import { getOrCreateMonth } from "@/lib/data";
import {
  normalizeMatchKey,
  parseKeellsBill,
  titleCase,
} from "@/lib/keells/parse";

const ALLOWED_HOSTS = new Set(["digibillaccess.keellssuper.com"]);

export type ImportState = { error?: string; existingBillId?: number };

export async function importBill(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };

  const rawUrl = String(formData.get("url") ?? "").trim();
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { error: "That doesn't look like a link. Paste the full e-bill URL." };
  }
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) {
    return { error: "Only Keells e-bill links (digibillaccess.keellssuper.com) are supported." };
  }

  let html: string;
  try {
    const { fetchBillHtml } = await import("@/lib/keells/fetch");
    const res = await fetchBillHtml(url);
    if (
      res.status !== 200 ||
      /AuthenticationFailed|BlobNotFound|<\?xml/i.test(res.html.slice(0, 500))
    ) {
      return {
        error:
          "Keells says this link is no longer available — e-bill links expire after ~3 months. Add the bill manually instead.",
      };
    }
    html = res.html;
  } catch {
    return { error: "Couldn't reach Keells. Check your connection and try again." };
  }

  const parsed = parseKeellsBill(html);
  if (parsed.items.length === 0) {
    return {
      error:
        "Fetched the bill but couldn't read any items from it. The format may have changed — add it manually for now.",
    };
  }

  // Duplicate import guard
  if (parsed.transactionRef) {
    const existing = db
      .select({ id: schema.bills.id })
      .from(schema.bills)
      .where(eq(schema.bills.transactionRef, parsed.transactionRef))
      .get();
    if (existing)
      return {
        error: "This bill was already imported.",
        existingBillId: existing.id,
      };
  }

  const billDate =
    parsed.billDate ??
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" }).format(
      new Date(),
    );
  const [year, month] = billDate.split("-").map(Number);
  const monthRow = getOrCreateMonth(year, month);
  if (monthRow.status === "closed")
    return {
      error: `This bill is dated ${billDate}, but that month is closed. Reopen it first.`,
    };

  // Alias lookup for friendly display names
  const keys = parsed.items.map((item) =>
    item.itemCode ?? normalizeMatchKey(item.rawName),
  );
  const aliases =
    keys.length > 0
      ? db
          .select()
          .from(schema.itemAliases)
          .where(inArray(schema.itemAliases.matchKey, keys))
          .all()
      : [];
  const aliasMap = new Map(aliases.map((a) => [a.matchKey, a.friendlyName]));

  const discountCents = parsed.discounts.reduce(
    (sum, d) => sum + d.amountCents,
    0,
  );
  const grossCents = parsed.items.reduce(
    (sum, item) => sum + item.lineTotalCents,
    0,
  );

  const billId = db.transaction((tx) => {
    const bill = tx
      .insert(schema.bills)
      .values({
        monthId: monthRow.id,
        source: "keells",
        status: "draft",
        payerPersonId: session.personId,
        billDate,
        storeName: parsed.storeName,
        transactionRef: parsed.transactionRef,
        sourceUrl: rawUrl,
        rawHtml: html,
        grossCents,
        discountCents,
        netCents: grossCents - discountCents,
      })
      .returning()
      .get();

    for (const item of parsed.items) {
      const key = item.itemCode ?? normalizeMatchKey(item.rawName);
      tx.insert(schema.billItems)
        .values({
          billId: bill.id,
          lineNo: item.lineNo,
          itemCode: item.itemCode,
          rawName: item.rawName,
          displayName: aliasMap.get(key) ?? titleCase(item.rawName),
          unitPriceCents: item.unitPriceCents,
          quantity: item.quantity,
          lineTotalCents: item.lineTotalCents,
          status: "shared",
        })
        .run();
    }
    for (const discount of parsed.discounts) {
      tx.insert(schema.billDiscounts)
        .values({
          billId: bill.id,
          description: discount.description,
          amountCents: discount.amountCents,
        })
        .run();
    }
    return bill.id;
  });

  redirect(`/bills/${billId}`);
}
