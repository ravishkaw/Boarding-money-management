import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeMatchKey, parseKeellsBill, titleCase } from "./parse";

const fixture = (name: string) =>
  readFileSync(join(__dirname, "__fixtures__", name), "utf8");

const html = fixture("sample-bill.html");

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
    expect(itemSum - bill.totalDiscountCents).toBe(bill.netCents);
    expect(bill.errors).toEqual([]);
    expect(bill.warnings).toEqual([]);
  });
});

describe("parseKeellsBill (03-Jun-2026 receipt with item-wise promotions)", () => {
  const bill = parseKeellsBill(fixture("sample-bill-promo.html"));

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
    expect(bill.errors).toEqual([]);
    expect(bill.warnings).toEqual([]);
  });
});

/**
 * The bill that broke the old parser (DC89XC, 06-Sep-2026): a re-usable bag
 * line with a lettered SKU (R1234) carrying the Rs. 6.00 "Green Discount".
 * The old code skipped that promo row, so the item-wise sum (409) no longer
 * matched the "Promotion Discount" row (415) and BOTH restatement rows were
 * added on top: 409 + 415 + 415 = 1,239 instead of 415.
 */
describe("parseKeellsBill (06-Sep-2026 receipt with a Green Discount on the bag)", () => {
  const bill = parseKeellsBill(fixture("sample-bill-green.html"));

  it("reads lettered item codes (R1234 / E1234) instead of leaving them in the name", () => {
    const bag = bill.items.find((i) => i.lineNo === 24);
    expect(bag).toMatchObject({
      itemCode: "R1234",
      rawName: "KEELLS BAG 16 X 18 RE-USE.",
      lineTotalCents: 1,
    });
    const refund = bill.items.find((i) => i.lineNo === 25);
    expect(refund).toMatchObject({
      itemCode: "E1234",
      rawName: "KEELLS BAG 16 X 18 REFUND",
      quantity: -1,
      lineTotalCents: -1,
    });
  });

  it("puts the Green Discount on the bag line", () => {
    const bag = bill.items.find((i) => i.lineNo === 24);
    expect(bag?.discountCents).toBe(600);
    expect(bag?.discountNote).toBe("Value Dis");
  });

  it("still reads the ordinary promotions", () => {
    expect(bill.items.find((i) => i.lineNo === 2)?.discountCents).toBe(32200);
    expect(bill.items.find((i) => i.lineNo === 16)?.discountCents).toBe(600);
    expect(bill.items.find((i) => i.lineNo === 5)?.discountCents).toBe(4500);
    expect(bill.items.find((i) => i.lineNo === 12)?.discountCents).toBe(3600);
  });

  it("totals: gross 7,479.50 − 415.00 = net 7,064.50, nothing double-counted", () => {
    expect(bill.items).toHaveLength(25);
    expect(bill.grossCents).toBe(747950);
    expect(bill.totalDiscountCents).toBe(41500);
    expect(bill.netCents).toBe(706450);
    expect(bill.discounts).toEqual([]);
    expect(bill.errors).toEqual([]);
    expect(bill.warnings).toEqual([]);
    const itemwise = bill.items.reduce((s, i) => s + i.discountCents, 0);
    expect(itemwise).toBe(41500);
  });
});

/** Synthetic receipts exercising the reconciliation rules. */
function receipt(opts: {
  items: { ln: number; code: string; name: string; price: string; qty: string; amt: string }[];
  promos?: { ln: number; code: string; note: string; amt: string }[];
  totals: [string, string][];
}): string {
  const td = (id: string, text: string) => `<td id="${id}">${text}</td>`;
  const itemRows = opts.items
    .map(
      (i) =>
        `<tr>${td("ln", String(i.ln))}${td("itm", `${i.code}: ${i.name}`)}${td("prz", i.price)}${td("qty", i.qty)}${td("amt", i.amt)}</tr>`,
    )
    .join("");
  const promoRows = (opts.promos ?? [])
    .map(
      (p) =>
        `<tr><td>${p.ln}</td><td>${p.code}</td><td>${p.note}</td><td>${p.amt}</td></tr>`,
    )
    .join("");
  const totalRows = opts.totals
    .map(([label, amt]) => `<tr><td colspan="6">${label}</td><td>${amt}</td></tr>`)
    .join("");
  return `<html><body>
    <div class="title"><p>Store Code: SCNW</p><p>01-Sep-2026 09:00:00 C:1 R:2</p></div>
    <table>${itemRows}</table>
    <table>${totalRows}${promoRows}</table>
  </body></html>`;
}

describe("parseKeellsBill reconciliation", () => {
  const twoItems = [
    { ln: 1, code: "100", name: "RICE", price: "300.00", qty: "1.0", amt: "300.00" },
    { ln: 2, code: "200", name: "DHAL", price: "100.00", qty: "1.0", amt: "100.00" },
  ];

  it("anchors the total discount to gross − net, ignoring restated promotion rows", () => {
    const bill = parseKeellsBill(
      receipt({
        items: twoItems,
        promos: [{ ln: 1, code: "100", note: "25.00% Dis", amt: "75.00" }],
        totals: [
          ["Gross Amount", "400.00"],
          ["Promotion Discount", "75.00"],
          ["Net Amount", "325.00"],
          ["Total promotion(s) savings", "75.00"],
        ],
      }),
    );
    expect(bill.errors).toEqual([]);
    expect(bill.totalDiscountCents).toBe(7500);
    expect(bill.discounts).toEqual([]);
    expect(bill.items[0].discountCents).toBe(7500);
  });

  it("keeps a genuine receipt-level discount when the labelled rows explain it", () => {
    const bill = parseKeellsBill(
      receipt({
        items: twoItems,
        promos: [{ ln: 1, code: "100", note: "25.00% Dis", amt: "75.00" }],
        totals: [
          ["Gross Amount", "400.00"],
          ["Promotion Discount", "75.00"],
          ["Loyalty Discount", "10.00"],
          ["Net Amount", "315.00"],
        ],
      }),
    );
    expect(bill.errors).toEqual([]);
    expect(bill.warnings).toEqual([]);
    expect(bill.totalDiscountCents).toBe(8500);
    expect(bill.discounts).toEqual([
      { description: "Loyalty Discount", amountCents: 1000 },
    ]);
  });

  it("records an unexplained gap as one receipt-level discount and warns", () => {
    const bill = parseKeellsBill(
      receipt({
        items: twoItems,
        totals: [
          ["Gross Amount", "400.00"],
          ["Net Amount", "390.00"],
        ],
      }),
    );
    expect(bill.errors).toEqual([]);
    expect(bill.totalDiscountCents).toBe(1000);
    expect(bill.discounts).toEqual([
      { description: "Receipt-level discount", amountCents: 1000 },
    ]);
    expect(bill.warnings).toHaveLength(1);
  });

  it("refuses a promotion row that doesn't match any item", () => {
    const bill = parseKeellsBill(
      receipt({
        items: twoItems,
        promos: [{ ln: 9, code: "999", note: "10.00% Dis", amt: "10.00" }],
        totals: [
          ["Gross Amount", "400.00"],
          ["Net Amount", "390.00"],
        ],
      }),
    );
    expect(bill.errors).toEqual([
      expect.stringMatching(/doesn't match any item/),
    ]);
    // the money still anchors to the receipt, so nothing is double-counted
    expect(bill.totalDiscountCents).toBe(1000);
  });

  it("refuses when item promotions exceed the receipt's total discount", () => {
    const bill = parseKeellsBill(
      receipt({
        items: twoItems,
        promos: [
          { ln: 1, code: "100", note: "25.00% Dis", amt: "75.00" },
          { ln: 1, code: "100", note: "25.00% Dis", amt: "75.00" }, // duplicated row
        ],
        totals: [
          ["Gross Amount", "400.00"],
          ["Net Amount", "325.00"],
        ],
      }),
    );
    expect(bill.errors).toEqual([expect.stringMatching(/more than the receipt/)]);
  });

  it("refuses when the line items don't add up to the gross", () => {
    const bill = parseKeellsBill(
      receipt({
        items: twoItems,
        totals: [
          ["Gross Amount", "401.00"],
          ["Net Amount", "401.00"],
        ],
      }),
    );
    expect(bill.errors).toEqual([expect.stringMatching(/Gross Amount is 401\.00/)]);
  });

  it("refuses when the net amount can't be read", () => {
    const bill = parseKeellsBill(
      receipt({ items: twoItems, totals: [["Gross Amount", "400.00"]] }),
    );
    expect(bill.errors).toEqual([expect.stringMatching(/Net Amount/)]);
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
