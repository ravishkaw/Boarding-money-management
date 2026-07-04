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

describe("parseKeellsBill (03-Jun-2026 receipt with item-wise promotions)", () => {
  const promoHtml = readFileSync(
    join(__dirname, "__fixtures__", "sample-bill-promo.html"),
    "utf8",
  );
  const bill = parseKeellsBill(promoHtml);

  it("reads all 19 items", () => {
    expect(bill.items).toHaveLength(19);
  });

  it("attributes promotions to their lines (25% off KIST → 75.00 on line 15)", () => {
    const kist = bill.items.find((i) => i.lineNo === 15);
    expect(kist).toMatchObject({
      itemCode: "127671",
      lineTotalCents: 30000,
      discountCents: 7500,
    });
    expect(kist?.discountNote).toMatch(/25\.00% Dis/);
    const marie = bill.items.find((i) => i.lineNo === 14);
    expect(marie?.discountCents).toBe(2700);
    const yoghurt = bill.items.find((i) => i.lineNo === 6);
    expect(yoghurt?.discountCents).toBe(3400);
    const capsicum = bill.items.find((i) => i.lineNo === 11);
    expect(capsicum?.discountCents).toBe(1800);
  });

  it("totals reconcile: gross 4,014.98 − 154.00 promos = net 3,860.98", () => {
    expect(bill.grossCents).toBe(401498);
    expect(bill.totalDiscountCents).toBe(15400);
    expect(bill.netCents).toBe(386098);
    // the restated "Promotion Discount"/"Total savings" rows must not double-count
    expect(bill.discounts).toEqual([]);
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
