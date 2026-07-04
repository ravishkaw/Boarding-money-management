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

export type SettleBill = {
  payerPersonId: number;
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
 * Effective cost per item. Item-wise discounts come straight off their own
 * line; any remaining receipt-level discount (total − Σ item-wise) is
 * prorated across included (non-excluded) items, with the last included item
 * absorbing the rounding remainder so the bill sums exactly.
 */
export function effectiveCosts(bill: SettleBill): number[] {
  const base = bill.items.map(
    (item) => item.lineTotalCents - (item.discountCents ?? 0),
  );
  const included = bill.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.status !== "excluded");
  const includedTotal = included.reduce((sum, { index }) => sum + base[index], 0);

  const itemwiseTotal = bill.items.reduce(
    (sum, item) => sum + (item.discountCents ?? 0),
    0,
  );
  const remaining = Math.max(0, bill.discountCents - itemwiseTotal);

  const costs = bill.items.map(() => 0);
  if (includedTotal <= 0 || remaining === 0) {
    for (const { index } of included) costs[index] = base[index];
    return costs;
  }

  let discountLeft = remaining;
  included.forEach(({ index }, i) => {
    const share =
      i === included.length - 1
        ? discountLeft
        : Math.round((remaining * base[index]) / includedTotal);
    costs[index] = base[index] - share;
    discountLeft -= share;
  });
  return costs;
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
    bill.items.forEach((item, i) => {
      if (item.status === "excluded") return;
      const cost = costs[i];
      paid.set(bill.payerPersonId, (paid.get(bill.payerPersonId) ?? 0) + cost);
      if (item.status === "shared") {
        sharedPool += cost;
      } else {
        const owner = item.ownerPersonId;
        if (owner == null)
          throw new Error("settle: personal item without an owner");
        personal.set(owner, (personal.get(owner) ?? 0) + cost);
      }
    });
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
