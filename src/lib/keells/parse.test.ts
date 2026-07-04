import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeMatchKey, parseKeellsBill, titleCase } from "./parse";

const html = readFileSync(
  join(__dirname, "__fixtures__", "sample-bill.html"),
  "utf8",
);

describe("parseKeellsBill (real 20-Jun-2026 receipt)", () => {
  const bill = parseKeellsBill(html);

  it("reads the header", () => {
    expect(bill.billDate).toBe("2026-06-20");
    expect(bill.billTime).toBe("10:35:43");
    expect(bill.storeCode).toBe("SCNW");
    expect(bill.transactionRef).toBe("SCNW-20260620-103543-R2026742-C154218");
  });

  it("reads all line items with codes, prices and weighed quantities", () => {
    expect(bill.items.length).toBeGreaterThanOrEqual(3);
    const onions = bill.items.find((i) => i.rawName === "BIG ONIONS");
    expect(onions).toMatchObject({
      itemCode: "914006",
      unitPriceCents: 28000,
      quantity: 0.52,
      lineTotalCents: 14560,
    });
    const bag = bill.items.find((i) => /Polythene Bag/i.test(i.rawName));
    expect(bag).toMatchObject({ unitPriceCents: 500, lineTotalCents: 500 });
  });

  it("reads gross and net amounts", () => {
    expect(bill.grossCents).toBe(122932);
    expect(bill.netCents).toBe(122932);
  });

  it("item totals reconcile with the net amount", () => {
    const itemSum = bill.items.reduce((s, i) => s + i.lineTotalCents, 0);
    const discountSum = bill.discounts.reduce((s, d) => s + d.amountCents, 0);
    expect(Math.abs(itemSum - discountSum - (bill.netCents ?? 0))).toBeLessThanOrEqual(5);
    expect(
      bill.warnings.filter((w) => !w.includes("duplicate detection")),
    ).toEqual([]);
  });
});

describe("helpers", () => {
  it("titleCase", () => {
    expect(titleCase("EH I/C WONDER CONE FALUDA 120ML")).toBe(
      "Eh I/C Wonder Cone Faluda 120ml",
    );
    expect(titleCase("BIG ONIONS")).toBe("Big Onions");
  });
  it("normalizeMatchKey", () => {
    expect(normalizeMatchKey("  BIG   Onions ")).toBe("big onions");
  });
});
