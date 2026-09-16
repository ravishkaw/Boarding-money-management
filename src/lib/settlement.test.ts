import { describe, expect, it } from "vitest";
import {
  effectiveCosts,
  effectiveTotalOf,
  payerCredits,
  settle,
  type SettleBill,
} from "./settlement";

const [A, P, R] = [1, 2, 3]; // Aditha, Pahasara, Ravishka

function sharedBill(payer: number, cents: number): SettleBill {
  return {
    payers: [{ personId: payer, amountCents: cents }],
    discountCents: 0,
    items: [{ lineTotalCents: cents, status: "shared" }],
  };
}

describe("effectiveCosts", () => {
  it("passes line totals through when there is no discount", () => {
    const bill: SettleBill = {
      payers: [{ personId: A, amountCents: 300 }],
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
      payers: [{ personId: A, amountCents: 900 }],
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
      payers: [{ personId: A, amountCents: 315 }],
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
      payers: [{ personId: A, amountCents: 225 }],
      discountCents: 75,
      items: [
        { lineTotalCents: 300, discountCents: 75, status: "shared" },
        { lineTotalCents: 500, status: "excluded" },
      ],
    };
    expect(effectiveCosts(bill)).toEqual([225, 0]);
  });

  it("zeroes excluded items but still gives them their share of a receipt-level discount", () => {
    // 1,000 bill, 10% off everything, 500 of it is the payer's own (excluded).
    // The pool must only carry the discounted 450 of the shared item; the
    // other 450 (not 500) is what the payer eats for their excluded item.
    const bill: SettleBill = {
      payers: [{ personId: A, amountCents: 900 }],
      discountCents: 100,
      items: [
        { lineTotalCents: 500, status: "excluded" },
        { lineTotalCents: 500, status: "shared" },
      ],
    };
    expect(effectiveCosts(bill)).toEqual([0, 450]);
    expect(effectiveTotalOf(bill)).toBe(450);
    expect(payerCredits(bill)).toEqual([{ personId: A, amountCents: 450 }]);
  });

  it("lets a Green Discount on a Rs. 0.01 bag line go negative and reduce the pool", () => {
    // Real receipt shape: bag 0.01 with a 6.00 "Value Dis", refund line -0.01.
    const bill: SettleBill = {
      payers: [{ personId: A, amountCents: 100000 - 600 }],
      discountCents: 600,
      items: [
        { lineTotalCents: 100000, status: "shared" },
        { lineTotalCents: 1, discountCents: 600, status: "shared" },
        { lineTotalCents: -1, status: "shared" },
      ],
    };
    const costs = effectiveCosts(bill);
    expect(costs).toEqual([100000, -599, -1]);
    expect(costs.reduce((a, b) => a + b, 0)).toBe(100000 - 600);
    expect(effectiveTotalOf(bill)).toBe(100000 - 600);
  });

  it("throws when item-wise discounts exceed the bill's total discount", () => {
    const bill: SettleBill = {
      payers: [{ personId: A, amountCents: 300 }],
      discountCents: 50,
      items: [{ lineTotalCents: 300, discountCents: 75, status: "shared" }],
    };
    expect(() => effectiveCosts(bill)).toThrow(/exceed/);
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
          payers: [{ personId: A, amountCents: 245000 }],
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

  it("keeps a personal-item-on-someone-else's-bill strictly between the two people", () => {
    // Ravishka's Rs. 1,000 personal item on Aditha's bill; nothing shared.
    // Must be a two-person transfer (R -> A). Pahasara is completely untouched.
    const s = settle({
      personIds: [A, P, R],
      bills: [
        {
          payers: [{ personId: A, amountCents: 100000 }],
          discountCents: 0,
          items: [
            { lineTotalCents: 100000, status: "personal", ownerPersonId: R },
          ],
        },
      ],
    });
    const [a, p, r] = s.persons;

    // Nothing is shared, so no one pays a "fair share".
    expect(s.sharedPoolCents).toBe(0);
    expect(a.fairShareCents).toBe(0);
    expect(p.fairShareCents).toBe(0);
    expect(r.fairShareCents).toBe(0);

    // Aditha is owed exactly 1,000; Ravishka owes exactly 1,000.
    expect(a.deltaCents).toBe(100000);
    expect(r.deltaCents).toBe(-100000);

    // Pahasara: paid nothing, owns nothing, owes nothing — untouched.
    expect(p.paidCents).toBe(0);
    expect(p.personalCents).toBe(0);
    expect(p.deltaCents).toBe(0);
    expect(p.closingCents).toBe(0);

    // Settle-up is a single R -> A transfer; Pahasara appears in no transfer.
    expect(s.transfers).toEqual([
      { fromPersonId: R, toPersonId: A, amountCents: 100000 },
    ]);
    expect(
      s.transfers.some(
        (t) => t.fromPersonId === P || t.toPersonId === P,
      ),
    ).toBe(false);
  });

  it("only the shared portion touches the third person; the personal part stays two-way", () => {
    // Aditha's bill: 300 shared + Ravishka's 90 personal item (10% off = 9 discount).
    // Pahasara should be affected ONLY by his 100 share of the 300 shared pool,
    // never by Ravishka's personal item.
    const s = settle({
      personIds: [A, P, R],
      bills: [
        {
          payers: [{ personId: A, amountCents: 38100 }],
          discountCents: 900,
          items: [
            { lineTotalCents: 30000, status: "shared" },
            {
              lineTotalCents: 9000,
              discountCents: 900,
              status: "personal",
              ownerPersonId: R,
            },
          ],
        },
      ],
    });
    const [a, p, r] = s.persons;

    expect(s.sharedPoolCents).toBe(30000); // personal item excluded from pool
    // Pahasara owes exactly his third of the shared 300 — and nothing else.
    expect(p.fairShareCents).toBe(10000);
    expect(p.personalCents).toBe(0);
    expect(p.deltaCents).toBe(-10000);
    // Ravishka's personal item is the discounted 81, charged only to him.
    expect(r.personalCents).toBe(8100);
    expect(s.persons.reduce((sum, x) => sum + x.deltaCents, 0)).toBe(0);
  });

  it("bases fair share on shared-item value only, never on amounts paid", () => {
    // Same shared value (300) in both cases; the second bill just piles on a
    // big personal item and an excluded item. Fair share must NOT change.
    const bare = settle({
      personIds: [A, P, R],
      bills: [sharedBill(A, 30000)],
    });
    const withExtras = settle({
      personIds: [A, P, R],
      bills: [
        {
          payers: [{ personId: A, amountCents: 130000 }], // A paid a LOT more
          discountCents: 0,
          items: [
            { lineTotalCents: 30000, status: "shared" },
            { lineTotalCents: 90000, status: "personal", ownerPersonId: R },
            { lineTotalCents: 10000, status: "excluded" },
          ],
        },
      ],
    });

    expect(bare.sharedPoolCents).toBe(30000);
    expect(withExtras.sharedPoolCents).toBe(30000); // personal/excluded ignored
    // Every person's fair share is identical across both scenarios.
    expect(withExtras.persons.map((p) => p.fairShareCents)).toEqual(
      bare.persons.map((p) => p.fairShareCents),
    );
    expect(withExtras.persons.map((p) => p.fairShareCents)).toEqual([
      10000, 10000, 10000,
    ]);
    // Aditha paid 1,300 but her share is still only 100 — the extra is her
    // credit for covering Ravishka's personal item, not a bigger share.
    expect(withExtras.persons[0].fairShareCents).toBe(10000);
  });

  it("applies repayments: 'Pahasara paid Aditha back' zeroes the debt", () => {
    // Aditha pays Pahasara's 450.00 personal item, then Pahasara repays in cash.
    const s = settle({
      personIds: [A, P, R],
      bills: [
        {
          payers: [{ personId: A, amountCents: 45000 }],
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

  it("splits a bill paid by two people, crediting each what they handed over", () => {
    // 3,000.00 shared bill: Aditha put in 2,000, Ravishka 1,000.
    const s = settle({
      personIds: [A, P, R],
      bills: [
        {
          payers: [
            { personId: A, amountCents: 200000 },
            { personId: R, amountCents: 100000 },
          ],
          discountCents: 0,
          items: [{ lineTotalCents: 300000, status: "shared" }],
        },
      ],
    });
    const [a, p, r] = s.persons;
    expect(a.paidCents).toBe(200000);
    expect(r.paidCents).toBe(100000);
    expect(a.deltaCents).toBe(100000);
    expect(p.deltaCents).toBe(-100000);
    expect(r.deltaCents).toBe(0);
    expect(s.transfers).toEqual([
      { fromPersonId: P, toPersonId: A, amountCents: 100000 },
    ]);
  });

  it("scales split-payer credit down when items are excluded", () => {
    // 1,000 bill paid 600/400, but a 200 item was excluded (e.g. returned).
    const s = settle({
      personIds: [A, P],
      bills: [
        {
          payers: [
            { personId: A, amountCents: 600 },
            { personId: P, amountCents: 400 },
          ],
          discountCents: 0,
          items: [
            { lineTotalCents: 800, status: "shared" },
            { lineTotalCents: 200, status: "excluded" },
          ],
        },
      ],
    });
    const [a, p] = s.persons;
    // credits: round(800*600/1000)=480, remainder -> 320
    expect(a.paidCents).toBe(480);
    expect(p.paidCents).toBe(320);
    expect(a.paidCents + p.paidCents).toBe(800);
    expect(s.persons.reduce((sum, x) => sum + x.deltaCents, 0)).toBe(0);
  });

  it("throws when a personal item has no owner", () => {
    expect(() =>
      settle({
        personIds: [A, P],
        bills: [
          {
            payers: [{ personId: A, amountCents: 100 }],
            discountCents: 0,
            items: [{ lineTotalCents: 100, status: "personal" }],
          },
        ],
      }),
    ).toThrow(/owner/);
  });

  it("throws instead of leaking money when a bill's payers add up to nothing", () => {
    // Costs would enter the pool with nobody credited for them.
    expect(() =>
      settle({
        personIds: [A, P],
        bills: [
          {
            payers: [{ personId: A, amountCents: 0 }],
            discountCents: 0,
            items: [{ lineTotalCents: 100, status: "shared" }],
          },
        ],
      }),
    ).toThrow(/credits/);
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

  /**
   * Golden test for the 06-Sep-2026 Keells bill (DC89XC) as it should settle:
   * gross 7,479.50 − 415.00 (incl. the 6.00 Green Discount on the bag) =
   * net 7,064.50 paid by Pahasara, with one 260.00 personal item of his own.
   */
  it("settles the Green Discount bill to the receipt's net, to the cent", () => {
    const bill: SettleBill = {
      payers: [{ personId: P, amountCents: 706450 }],
      discountCents: 41500,
      items: [
        { lineTotalCents: 161000, discountCents: 32200, status: "shared" },
        { lineTotalCents: 45000, discountCents: 4500, status: "shared" },
        { lineTotalCents: 36000, discountCents: 3600, status: "shared" },
        { lineTotalCents: 2772, discountCents: 600, status: "shared" },
        { lineTotalCents: 26000, status: "personal", ownerPersonId: P },
        { lineTotalCents: 1, discountCents: 600, status: "shared" }, // re-use bag
        { lineTotalCents: -1, status: "shared" }, // bag refund
        { lineTotalCents: 747950 - 161000 - 45000 - 36000 - 2772 - 26000, status: "shared" },
      ],
    };
    const s = settle({ personIds: [A, P, R], bills: [bill] });
    const [a, p, r] = s.persons;
    expect(p.paidCents).toBe(706450);
    expect(p.personalCents).toBe(26000);
    expect(s.sharedPoolCents).toBe(706450 - 26000);
    expect(a.fairShareCents + p.fairShareCents + r.fairShareCents).toBe(
      706450 - 26000,
    );
    expect(a.deltaCents + p.deltaCents + r.deltaCents).toBe(0);
  });
});
