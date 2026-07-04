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
  status: ItemStatus;
  ownerPersonId?: number | null;
};

export type SettleBill = {
  payerPersonId: number;
  discountCents: number;
  items: SettleItem[];
};

export type SettleInput = {
  /** In display order — the fair-share rounding remainder goes to the first persons. */
  personIds: number[];
  /** Confirmed bills only; callers must filter out drafts. */
  bills: SettleBill[];
  /** openingCents per personId; missing = 0. +ve = house owes them. */
  openings?: Map<number, number>;
};

export type PersonSettlement = {
  personId: number;
  openingCents: number;
  paidCents: number;
  fairShareCents: number;
  personalCents: number;
  /** paid − fairShare − personal (this month's movement) */
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
 * Effective cost per item: the bill discount is prorated across included
 * (non-excluded) items by line total; the last included item absorbs the
 * rounding remainder so the bill sums exactly to gross − discount.
 */
export function effectiveCosts(bill: SettleBill): number[] {
  const included = bill.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.status !== "excluded");
  const includedTotal = included.reduce(
    (sum, { item }) => sum + item.lineTotalCents,
    0,
  );

  const costs = bill.items.map(() => 0);
  if (includedTotal <= 0 || bill.discountCents === 0) {
    for (const { item, index } of included) costs[index] = item.lineTotalCents;
    return costs;
  }

  let discountLeft = bill.discountCents;
  included.forEach(({ item, index }, i) => {
    const share =
      i === included.length - 1
        ? discountLeft
        : Math.round((bill.discountCents * item.lineTotalCents) / includedTotal);
    costs[index] = item.lineTotalCents - share;
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

  // Split the pool; the first `remainder` persons (display order) pay 1 extra cent.
  const base = Math.floor(sharedPool / n);
  const remainder = sharedPool - base * n;

  const persons: PersonSettlement[] = personIds.map((personId, i) => {
    const fairShareCents = base + (i < remainder ? 1 : 0);
    const paidCents = paid.get(personId) ?? 0;
    const personalCents = personal.get(personId) ?? 0;
    const openingCents = openings.get(personId) ?? 0;
    const deltaCents = paidCents - fairShareCents - personalCents;
    return {
      personId,
      openingCents,
      paidCents,
      fairShareCents,
      personalCents,
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
