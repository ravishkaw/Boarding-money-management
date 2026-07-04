import ExcelJS from "exceljs";
import type { Month, Person } from "@/db/schema";
import type { BillWithItems } from "@/lib/data";
import { monthLabel } from "@/lib/data";
import type { Settlement } from "@/lib/settlement";

const CURRENCY_FMT = '#,##0.00';

function rs(cents: number): number {
  return cents / 100;
}

export async function buildMonthWorkbook(
  month: Month,
  persons: Person[],
  settlement: Settlement,
  bills: BillWithItems[],
): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Boarding";
  const nameOf = (id: number | null) =>
    persons.find((p) => p.id === id)?.name ?? "";

  // ---- Summary ------------------------------------------------------------
  const summary = workbook.addWorksheet("Summary");
  summary.columns = [
    { header: "Person", key: "person", width: 24 },
    { header: "Opening", key: "opening", width: 14 },
    { header: "Paid", key: "paid", width: 14 },
    { header: "Fair Share", key: "fair", width: 14 },
    { header: "Personal", key: "personal", width: 14 },
    { header: "Difference", key: "delta", width: 14 },
    { header: "Closing", key: "closing", width: 14 },
  ];
  summary.getRow(1).font = { bold: true };
  for (const p of settlement.persons) {
    summary.addRow({
      person: nameOf(p.personId),
      opening: rs(p.openingCents),
      paid: rs(p.paidCents),
      fair: rs(p.fairShareCents),
      personal: rs(p.personalCents),
      delta: rs(p.deltaCents),
      closing: rs(p.closingCents),
    });
  }
  const totalRow = summary.addRow({
    person: "Total",
    opening: rs(settlement.persons.reduce((s, p) => s + p.openingCents, 0)),
    paid: rs(settlement.persons.reduce((s, p) => s + p.paidCents, 0)),
    fair: rs(settlement.sharedPoolCents),
    personal: rs(settlement.persons.reduce((s, p) => s + p.personalCents, 0)),
    delta: rs(settlement.persons.reduce((s, p) => s + p.deltaCents, 0)),
    closing: rs(settlement.persons.reduce((s, p) => s + p.closingCents, 0)),
  });
  totalRow.font = { bold: true };
  for (const col of ["B", "C", "D", "E", "F", "G"])
    summary.getColumn(col).numFmt = CURRENCY_FMT;

  summary.addRow([]);
  summary.addRow([`${monthLabel(month)} — settle up:`]).font = { bold: true };
  if (settlement.transfers.length === 0) {
    summary.addRow(["Everyone is square."]);
  }
  for (const t of settlement.transfers) {
    summary.addRow([
      `${nameOf(t.fromPersonId)} pays ${nameOf(t.toPersonId)}`,
      rs(t.amountCents),
    ]);
  }

  // ---- Items --------------------------------------------------------------
  const itemsSheet = workbook.addWorksheet("Items");
  itemsSheet.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "Bill", key: "bill", width: 22 },
    { header: "Payer", key: "payer", width: 20 },
    { header: "Item", key: "item", width: 34 },
    { header: "Price per unit", key: "unit", width: 14 },
    { header: "Quantity", key: "qty", width: 10 },
    { header: "Price", key: "total", width: 14 },
    { header: "Discount", key: "discount", width: 12 },
    { header: "Status", key: "status", width: 12 },
    { header: "Owner", key: "owner", width: 20 },
  ];
  itemsSheet.getRow(1).font = { bold: true };
  for (const bill of bills) {
    if (bill.status !== "confirmed") continue;
    const billLabel =
      bill.source === "manual" && bill.items.length === 1
        ? "Manual"
        : (bill.storeName ?? "Keells");
    for (const item of bill.items) {
      itemsSheet.addRow({
        date: bill.billDate,
        bill: billLabel,
        payer:
          bill.payments.length > 0
            ? bill.payments.map((p) => nameOf(p.personId)).join(" + ")
            : nameOf(bill.payerPersonId),
        item: item.displayName,
        unit: rs(item.unitPriceCents),
        qty: item.quantity,
        total: rs(item.lineTotalCents),
        discount: item.discountCents > 0 ? rs(item.discountCents) : "",
        status: item.status,
        owner: item.status === "personal" ? nameOf(item.ownerPersonId) : "",
      });
    }
  }
  itemsSheet.getColumn("E").numFmt = CURRENCY_FMT;
  itemsSheet.getColumn("G").numFmt = CURRENCY_FMT;
  itemsSheet.getColumn("H").numFmt = CURRENCY_FMT;

  // ---- Item Totals (the old pivot table) -----------------------------------
  const totals = new Map<string, { qty: number; cents: number }>();
  for (const bill of bills) {
    if (bill.status !== "confirmed") continue;
    for (const item of bill.items) {
      if (item.status === "excluded") continue;
      const entry = totals.get(item.displayName) ?? { qty: 0, cents: 0 };
      entry.qty += item.quantity;
      entry.cents += item.lineTotalCents - item.discountCents;
      totals.set(item.displayName, entry);
    }
  }
  const totalsSheet = workbook.addWorksheet("Item Totals");
  totalsSheet.columns = [
    { header: "Item", key: "item", width: 34 },
    { header: "Sum of Quantity", key: "qty", width: 16 },
    { header: "Sum of Price", key: "total", width: 16 },
  ];
  totalsSheet.getRow(1).font = { bold: true };
  for (const [name, entry] of [...totals.entries()].sort(
    (a, b) => b[1].cents - a[1].cents,
  )) {
    totalsSheet.addRow({
      item: name,
      qty: Math.round(entry.qty * 1000) / 1000,
      total: rs(entry.cents),
    });
  }
  const grand = totalsSheet.addRow({
    item: "Grand Total",
    qty: "",
    total: rs([...totals.values()].reduce((s, e) => s + e.cents, 0)),
  });
  grand.font = { bold: true };
  totalsSheet.getColumn("C").numFmt = CURRENCY_FMT;

  return workbook.xlsx.writeBuffer();
}
