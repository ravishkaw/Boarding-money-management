import { describe, expect, it } from "vitest";
import {
  effectiveCosts,
  settle,
  type SettleBill,
} from "./settlement";

const [A, P, R] = [1, 2, 3]; // Aditha, Pahasara, Ravishka

function sharedBill(payer: number, cents: number): SettleBill {
  return {
    payerPersonId: payer,
    discountCents: 0,
    items: [{ lineTotalCents: cents, status: "shared" }],
  };
}

describe("effectiveCosts", () => {
  it("passes line totals through when there is no discount", () => {
    const bill: SettleBill = {
      payerPersonId: A,
      discountCents: 0,
      items: [
        { lineTotalCents: 100, status: "shared" },
        { lineTotalCents: 200, status: "personal", ownerPersonId: P },
      ],
    };
    expect(effectiveCosts(bill)).toEqual([100, 200]);
  });

  it("prorates the discount and sums exactly to gross - discount", () => {
    const bill: SettleBill = {
      payerPersonId: A,
      discountCents: 100,
      items: [
        { lineTotalCents: 333, status: "shared" },
        { lineTotalCents: 333, status: "shared" },
        { lineTotalCents: 334, status: "shared" },
      ],
    };
    const costs = effectiveCosts(bill);
    expect(costs.reduce((a, b) => a + b, 0)).toBe(1000 - 100);
  });

  it("takes item-wise discounts off their own line, prorates only the rest", () => {
    // Receipt: 300 (25% off = 75 item-wise) + 100, plus a 10 receipt-level discount.
    const bill: SettleBill = {
      payerPersonId: A,
      discountCents: 85, // 75 item-wise + 10 receipt-level
      items: [
        { lineTotalCents: 300, discountCents: 75, status: "shared" },
        { lineTotalCents: 100, status: "shared" },
      ],
    };
    const costs = effectiveCosts(bill);
    // bases: 225 and 100; remaining 10 prorated: round(10*225/325)=7, last absorbs 3
    expect(costs).toEqual([218, 97]);
    expect(costs.reduce((a, b) => a + b, 0)).toBe(400 - 85);
  });

  it("keeps a discounted item's own discount when another item is excluded", () => {
    const bill: SettleBill = {
      payerPersonId: A,
      discountCents: 75,
      items: [
        { lineTotalCents: 300, discountCents: 75, status: "shared" },
        { lineTotalCents: 500, status: "excluded" },
      ],
    };
    expect(effectiveCosts(bill)).toEqual([225, 0]);
  });

  it("gives excluded items zero cost and no discount share", () => {
    const bill: SettleBill = {
      payerPersonId: A,
      discountCents: 100,
      items: [
        { lineTotalCents: 500, status: "excluded" },
        { lineTotalCents: 500, status: "shared" },
      ],
    };
    expect(effectiveCosts(bill)).toEqual([0, 400]);
  });
});

describe("settle", () => {
  it("splits a single shared bill three ways", () => {
    const s = settle({
      personIds: [A, P, R],
      bills: [sharedBill(A, 300000)],
    });
    expect(s.sharedPoolCents).toBe(300000);
    const [a, p, r] = s.persons;
    expect(a.deltaCents).toBe(200000);
    expect(p.deltaCents).toBe(-100000);
    expect(r.deltaCents).toBe(-100000);
    expect(s.transfers).toEqual([
      { fromPersonId: P, toPersonId: A, amountCents: 100000 },
      { fromPersonId: R, toPersonId: A, amountCents: 100000 },
    ]);
  });

  it("sum of deltas is always zero, including with rounding remainders", () => {
    const s = settle({
      personIds: [A, P, R],
      bills: [sharedBill(A, 100), sharedBill(P, 33), sharedBill(R, 1)],
    });
    expect(s.persons.reduce((sum, p) => sum + p.deltaCents, 0)).toBe(0);
    // 134 / 3 = 44 rem 2 -> first two persons pay 45
    expect(s.persons.map((p) => p.fairShareCents)).toEqual([45, 45, 44]);
  });

  it("charges a personal item to its owner and credits the payer (the -450 case)", () => {
    // Aditha pays a bill with 2000.00 shared + Pahasara's 450.00 personal item.
    const s = settle({
      personIds: [A, P, R],
      bills: [
        {
          payerPersonId: A,
          discountCents: 0,
          items: [
            { lineTotalCents: 200000, status: "shared" },
            { lineTotalCents: 45000, status: "personal", ownerPersonId: P },
          ],
        },
      ],
    });
    const [a, p, r] = s.persons;
    expect(a.paidCents).toBe(245000);
    expect(p.personalCents).toBe(45000);
    // shares: 66667, 66667, 66666
    expect(a.deltaCents).toBe(245000 - 66667);
    expect(p.deltaCents).toBe(0 - 66667 - 45000);
    expect(r.deltaCents).toBe(0 - 66666);
    expect(s.persons.reduce((sum, x) => sum + x.deltaCents, 0)).toBe(0);
  });

  it("applies repayments: 'Pahasara paid Aditha back' zeroes the debt", () => {
    // Aditha pays Pahasara's 450.00 personal item, then Pahasara repays in cash.
    const s = settle({
      personIds: [A, P, R],
      bills: [
        {
          payerPersonId: A,
          discountCents: 0,
          items: [
            { lineTotalCents: 45000, status: "personal", ownerPersonId: P },
          ],
        },
      ],
      repayments: [{ fromPersonId: P, toPersonId: A, amountCents: 45000 }],
    });
    const [a, p, r] = s.persons;
    expect(a.repaidCents).toBe(-45000);
    expect(p.repaidCents).toBe(45000);
    expect(a.closingCents).toBe(0);
    expect(p.closingCents).toBe(0);
    expect(r.closingCents).toBe(0);
    expect(s.transfers).toEqual([]);
  });

  it("throws when a personal item has no owner", () => {
    expect(() =>
      settle({
        personIds: [A, P],
        bills: [
          {
            payerPersonId: A,
            discountCents: 0,
            items: [{ lineTotalCents: 100, status: "personal" }],
          },
        ],
      }),
    ).toThrow(/owner/);
  });

  it("carries opening balances into closings", () => {
    const s = settle({
      personIds: [A, P, R],
      bills: [sharedBill(A, 30000)],
      openings: new Map([
        [A, -5000],
        [P, 5000],
        [R, 0],
      ]),
    });
    const [a, p, r] = s.persons;
    expect(a.closingCents).toBe(-5000 + 20000);
    expect(p.closingCents).toBe(5000 - 10000);
    expect(r.closingCents).toBe(-10000);
    // chain: feeding closings in as next month's openings keeps the invariant
    const next = settle({
      personIds: [A, P, R],
      bills: [sharedBill(P, 9000)],
      openings: new Map(s.persons.map((x) => [x.personId, x.closingCents])),
    });
    expect(next.persons.reduce((sum, x) => sum + x.closingCents, 0)).toBe(0);
  });

  /**
   * Golden test against the real May sheet.
   * Excel: net total 86,463.94; fair share 28,821.31⅓;
   * differences -1,755.90 / -2,392.95 / +4,148.86 (carried into June).
   * Our integer-cent rule gives Aditha the 1-cent rounding remainder,
   * so Aditha is -1,755.91 instead of Excel's truncated -1,755.90.
   */
  it("matches the May 2026 sheet (golden test)", () => {
    const s = settle({
      personIds: [A, P, R],
      bills: [
        sharedBill(A, 2706541), // Aditha paid 27,065.41
        sharedBill(P, 2642836), // Pahasara paid 26,428.36
        sharedBill(R, 3297017), // Ravishka paid 32,970.17
      ],
    });
    expect(s.sharedPoolCents).toBe(8646394); // 86,463.94
    const [a, p, r] = s.persons;
    expect(a.fairShareCents).toBe(2882132); // 28,821.32 (remainder cent)
    expect(p.fairShareCents).toBe(2882131);
    expect(r.fairShareCents).toBe(2882131);
    expect(a.deltaCents).toBe(-175591); // Excel: -1,755.90 (±1c)
    expect(p.deltaCents).toBe(-239295); // Excel: -2,392.95 exact
    expect(r.deltaCents).toBe(414886); //  Excel: +4,148.86 exact
    expect(a.deltaCents + p.deltaCents + r.deltaCents).toBe(0);
  });
});
