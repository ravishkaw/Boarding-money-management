/**
 * Pure settlement math. Mirrors (and fixes) the old Excel workflow:
 * each person's Paid is the sum of the bills they paid, the shared pool is
 * split evenly, personal items are charged to their owner, and balances
 * carry forward month to month.
 *
 * Everything is integer cents; invariant: sum of deltas === 0.
 */

export type ItemStatus = "shared" | "personal" | "excluded";

export type SettleItem = {
  lineTotalCents: number;
  /** Item-wise (promotion) discount already attributed to this line. */
  discountCents?: number;
  status: ItemStatus;
  ownerPersonId?: number | null;
};

export type SettlePayer = { personId: number; amountCents: number };

export type SettleBill = {
  /** Who handed over money, and how much each. Single payer = one entry. */
  payers: SettlePayer[];
  /** TOTAL bill discount (item-wise + receipt-level). */
  discountCents: number;
  items: SettleItem[];
};

export type SettleRepayment = {
  fromPersonId: number;
  toPersonId: number;
  amountCents: number;
};

export type SettleInput = {
  /** In display order — the fair-share rounding remainder goes to the first persons. */
  personIds: number[];
  /** Confirmed bills only; callers must filter out drafts. */
  bills: SettleBill[];
  /** openingCents per personId; missing = 0. +ve = house owes them. */
  openings?: Map<number, number>;
  /** Cash settle-ups recorded this month. */
  repayments?: SettleRepayment[];
};

export type PersonSettlement = {
  personId: number;
  openingCents: number;
  paidCents: number;
  fairShareCents: number;
  personalCents: number;
  /** repayments made − repayments received */
  repaidCents: number;
  /** paid − fairShare − personal + repaid (this month's movement) */
  deltaCents: number;
  /** opening + delta */
  closingCents: number;
};

export type Transfer = {
  fromPersonId: number;
  toPersonId: number;
  amountCents: number;
};

export type Settlement = {
  sharedPoolCents: number;
  persons: PersonSettlement[];
  /** Payments that would bring every closing balance to zero. */
  transfers: Transfer[];
};

/**
 * Effective cost per item — what each line really cost after discounts.
 *
 * Item-wise discounts come straight off their own line. Any remaining
 * receipt-level discount (total − Σ item-wise) is prorated across EVERY
 * line, excluded ones included, with the last line absorbing the rounding
 * remainder: the costs then sum exactly to gross − discount, i.e. the net
 * the payer actually handed over. Excluded lines are zeroed afterwards, so
 * the payer eats an excluded item at its discounted price rather than at
 * full price while everyone else pockets its share of the discount.
 *
 * Throws if the item-wise discounts exceed the bill's total discount: that
 * bill would settle for less than was paid, so it must not be settled.
 */
export function effectiveCosts(bill: SettleBill): number[] {
  const base = bill.items.map(
    (item) => item.lineTotalCents - (item.discountCents ?? 0),
  );
  const itemwiseTotal = bill.items.reduce(
    (sum, item) => sum + (item.discountCents ?? 0),
    0,
  );
  if (itemwiseTotal > bill.discountCents)
    throw new Error(
      `settle: item-wise discounts (${itemwiseTotal}) exceed the bill discount (${bill.discountCents})`,
    );
  const remaining = bill.discountCents - itemwiseTotal;
  const baseTotal = base.reduce((sum, b) => sum + b, 0);

  const costs = [...base];
  if (remaining > 0 && costs.length > 0) {
    let discountLeft = remaining;
    base.forEach((lineBase, i) => {
      const last = i === base.length - 1;
      const share = last
        ? discountLeft
        : baseTotal > 0
          ? Math.round((remaining * lineBase) / baseTotal)
          : 0;
      costs[i] = lineBase - share;
      discountLeft -= share;
    });
  }
  bill.items.forEach((item, i) => {
    if (item.status === "excluded") costs[i] = 0;
  });
  return costs;
}

/** Sum of effective costs of a bill's non-excluded items. */
export function effectiveTotalOf(bill: SettleBill): number {
  const costs = effectiveCosts(bill);
  return bill.items.reduce(
    (sum, item, i) => (item.status === "excluded" ? sum : sum + costs[i]),
    0,
  );
}

/**
 * What each payer gets credited: proportional to what they handed over,
 * with the last payer absorbing the rounding remainder so credits sum
 * exactly to the effective total (which differs from the net only when
 * items are excluded).
 */
export function payerCredits(
  bill: SettleBill,
  effectiveTotal = effectiveTotalOf(bill),
): SettlePayer[] {
  const contributed = bill.payers.reduce((sum, p) => sum + p.amountCents, 0);
  if (contributed <= 0 || bill.payers.length === 0) return [];
  let creditLeft = effectiveTotal;
  return bill.payers.map((payer, i) => {
    const credit =
      i === bill.payers.length - 1
        ? creditLeft
        : Math.round((effectiveTotal * payer.amountCents) / contributed);
    creditLeft -= credit;
    return { personId: payer.personId, amountCents: credit };
  });
}

export function settle(input: SettleInput): Settlement {
  const { personIds, bills } = input;
  const openings = input.openings ?? new Map<number, number>();
  const n = personIds.length;
  if (n === 0) throw new Error("settle: no persons");

  const paid = new Map<number, number>(personIds.map((id) => [id, 0]));
  const personal = new Map<number, number>(personIds.map((id) => [id, 0]));
  let sharedPool = 0;

  for (const bill of bills) {
    const costs = effectiveCosts(bill);
    let effectiveTotal = 0;
    bill.items.forEach((item, i) => {
      if (item.status === "excluded") return;
      const cost = costs[i];
      effectiveTotal += cost;
      if (item.status === "shared") {
        sharedPool += cost;
      } else {
        const owner = item.ownerPersonId;
        if (owner == null)
          throw new Error("settle: personal item without an owner");
        personal.set(owner, (personal.get(owner) ?? 0) + cost);
      }
    });

    // Every cent charged to the pool or to a person must be credited to a
    // payer, or money silently leaks (e.g. a bill whose payers add to zero).
    const credits = payerCredits(bill, effectiveTotal);
    const credited = credits.reduce((sum, c) => sum + c.amountCents, 0);
    if (credited !== effectiveTotal)
      throw new Error(
        `settle: bill credits (${credited}) don't match its cost (${effectiveTotal})`,
      );
    for (const credit of credits) {
      paid.set(
        credit.personId,
        (paid.get(credit.personId) ?? 0) + credit.amountCents,
      );
    }
  }

  const repaid = new Map<number, number>(personIds.map((id) => [id, 0]));
  for (const r of input.repayments ?? []) {
    repaid.set(r.fromPersonId, (repaid.get(r.fromPersonId) ?? 0) + r.amountCents);
    repaid.set(r.toPersonId, (repaid.get(r.toPersonId) ?? 0) - r.amountCents);
  }

  // Split the pool; the first `remainder` persons (display order) pay 1 extra cent.
  const base = Math.floor(sharedPool / n);
  const remainder = sharedPool - base * n;

  const persons: PersonSettlement[] = personIds.map((personId, i) => {
    const fairShareCents = base + (i < remainder ? 1 : 0);
    const paidCents = paid.get(personId) ?? 0;
    const personalCents = personal.get(personId) ?? 0;
    const openingCents = openings.get(personId) ?? 0;
    const repaidCents = repaid.get(personId) ?? 0;
    const deltaCents = paidCents - fairShareCents - personalCents + repaidCents;
    return {
      personId,
      openingCents,
      paidCents,
      fairShareCents,
      personalCents,
      repaidCents,
      deltaCents,
      closingCents: openingCents + deltaCents,
    };
  });

  return { sharedPoolCents: sharedPool, persons, transfers: transfers(persons) };
}

/** Greedy: largest debtor pays largest creditor until everyone is settled. */
function transfers(persons: PersonSettlement[]): Transfer[] {
  const creditors = persons
    .filter((p) => p.closingCents > 0)
    .map((p) => ({ id: p.personId, amount: p.closingCents }))
    .sort((a, b) => b.amount - a.amount);
  const debtors = persons
    .filter((p) => p.closingCents < 0)
    .map((p) => ({ id: p.personId, amount: -p.closingCents }))
    .sort((a, b) => b.amount - a.amount);

  const result: Transfer[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const pay = Math.min(creditors[ci].amount, debtors[di].amount);
    if (pay > 0)
      result.push({
        fromPersonId: debtors[di].id,
        toPersonId: creditors[ci].id,
        amountCents: pay,
      });
    creditors[ci].amount -= pay;
    debtors[di].amount -= pay;
    if (creditors[ci].amount === 0) ci++;
    if (debtors[di].amount === 0) di++;
  }
  return result;
}
