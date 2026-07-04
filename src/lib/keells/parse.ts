import * as cheerio from "cheerio";

export type ParsedItem = {
  lineNo: number;
  itemCode: string | null;
  rawName: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
  /** Item-wise promotion discount attributed to this line (e.g. "25.00% Dis"). */
  discountCents: number;
  discountNote: string | null;
};

export type ParsedDiscount = { description: string; amountCents: number };

export type ParsedBill = {
  storeCode: string | null;
  storeName: string;
  /** ISO date, e.g. "2026-06-20" */
  billDate: string | null;
  billTime: string | null;
  /** Stable content-derived ref for duplicate detection */
  transactionRef: string | null;
  items: ParsedItem[];
  /** Receipt-level discounts NOT attributed to a specific line. */
  discounts: ParsedDiscount[];
  /** Item-wise + receipt-level. */
  totalDiscountCents: number;
  grossCents: number | null;
  netCents: number | null;
  warnings: string[];
};

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function parseCents(text: string): number | null {
  const cleaned = text.replace(/[,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

/** "BIG ONIONS" -> "Big Onions" (default display name when no alias exists) */
export function titleCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function normalizeMatchKey(rawName: string): string {
  return rawName.toLowerCase().replace(/\s+/g, " ").trim();
}

export function parseKeellsBill(html: string): ParsedBill {
  const $ = cheerio.load(html);
  const warnings: string[] = [];

  // ---- Header: date, time, transaction ids, store code -------------------
  const headerText = $(".title").text() || $("body").text();
  const dateMatch =
    /(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/.exec(
      headerText,
    );
  let billDate: string | null = null;
  let billTime: string | null = null;
  if (dateMatch) {
    const [, d, mon, y, hh, mm, ss] = dateMatch;
    const monthNum = MONTHS[mon.toLowerCase()];
    if (monthNum) {
      billDate = `${y}-${monthNum}-${d.padStart(2, "0")}`;
      billTime = `${hh}:${mm}:${ss}`;
    }
  }
  if (!billDate) warnings.push("Could not read the bill date.");

  const cMatch = /C:\s*(\d+)/.exec(headerText);
  const rMatch = /R:\s*(\d+)/.exec(headerText);
  const storeCodeMatch = /Store Code:\s*([A-Z0-9]+)/i.exec(headerText);
  const storeCode = storeCodeMatch?.[1] ?? null;
  const storeName = storeCode ? `Keells ${storeCode}` : "Keells";

  const transactionRef =
    billDate && rMatch
      ? [
          storeCode ?? "KEELLS",
          billDate.replace(/-/g, ""),
          billTime?.replace(/:/g, "") ?? "",
          `R${rMatch[1]}`,
          cMatch ? `C${cMatch[1]}` : "",
        ]
          .filter(Boolean)
          .join("-")
      : null;
  if (!transactionRef)
    warnings.push("Could not read the receipt number (duplicate detection off).");

  // ---- Line items ---------------------------------------------------------
  const items: ParsedItem[] = [];
  $('td[id="itm"]').each((index, el) => {
    const row = $(el).closest("tr");
    const itemText = $(el).text().trim();
    const lnText = row.find('td[id="ln"]').first().text().trim();
    const przText = row.find('td[id="prz"]').first().text().trim();
    const qtyText = row.find('td[id="qty"]').first().text().trim();
    const amtText = row.find('td[id="amt"]').first().text().trim();

    const unitPriceCents = parseCents(przText);
    const quantity = /^-?\d+(\.\d+)?$/.test(qtyText) ? Number(qtyText) : null;
    const lineTotalCents = parseCents(amtText);
    if (unitPriceCents === null || quantity === null || lineTotalCents === null) {
      warnings.push(`Could not read line ${lnText || index + 1} ("${itemText}").`);
      return;
    }

    const codeMatch = /^(\d{3,8}):\s*(.+)$/.exec(itemText);
    const itemCode = codeMatch ? codeMatch[1] : null;
    const rawName = (codeMatch ? codeMatch[2] : itemText).trim();

    if (Math.abs(unitPriceCents * quantity - lineTotalCents) > 5) {
      warnings.push(
        `Line "${rawName}": ${przText} × ${qtyText} ≠ ${amtText} — check it.`,
      );
    }

    items.push({
      lineNo: Number(lnText) || index + 1,
      itemCode,
      rawName,
      unitPriceCents,
      quantity,
      lineTotalCents,
      discountCents: 0,
      discountNote: null,
    });
  });
  if (items.length === 0) warnings.push("No line items found on this bill.");

  // ---- Item-wise promotion rows -------------------------------------------
  // Under "Exclusive deals for you" / "Keells Deals": 4 cells per row —
  // line no, item code, description ("25.00% Dis"), amount.
  const byLineNo = new Map(items.map((item) => [item.lineNo, item]));
  $("tr").each((_, row) => {
    const cells = $(row).children("td");
    if (cells.length !== 4) return;
    const lineNo = Number(cells.eq(0).text().trim());
    const code = cells.eq(1).text().trim();
    const note = cells.eq(2).text().trim();
    const amount = parseCents(cells.eq(3).text().trim());
    if (!Number.isInteger(lineNo) || amount === null || !/^\d{3,8}$/.test(code))
      return;
    const item = byLineNo.get(lineNo);
    if (!item || (item.itemCode && item.itemCode !== code)) {
      warnings.push(
        `Promotion "${note}" (line ${lineNo}, ${code}) doesn't match any item.`,
      );
      return;
    }
    item.discountCents += Math.abs(amount);
    item.discountNote = item.discountNote ? `${item.discountNote}; ${note}` : note;
  });
  const itemwiseDiscount = items.reduce((sum, i) => sum + i.discountCents, 0);

  // ---- Totals: gross, receipt-level discounts, net -------------------------
  let grossCents: number | null = null;
  let netCents: number | null = null;
  const labeledDiscounts: ParsedDiscount[] = [];

  $("tr").each((_, row) => {
    const cells = $(row).children("td");
    if (cells.length < 2 || cells.length === 4) return;
    const label = cells.first().text().trim();
    const amount = parseCents(cells.last().text().trim());
    if (amount === null || !label) return;
    if (/gross/i.test(label)) grossCents = amount;
    else if (/net\s*amount/i.test(label)) netCents = amount;
    else if (/discount|saving/i.test(label))
      labeledDiscounts.push({ description: label, amountCents: Math.abs(amount) });
  });

  // Rows like "Promotion Discount" / "Total promotion(s) savings" restate the
  // item-wise total — drop them so nothing double-counts.
  const discounts = labeledDiscounts.filter(
    (d) =>
      !(/promotion/i.test(d.description) && d.amountCents === itemwiseDiscount),
  );

  const totalDiscountCents =
    itemwiseDiscount + discounts.reduce((sum, d) => sum + d.amountCents, 0);
  const itemSum = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  if (netCents !== null && Math.abs(itemSum - totalDiscountCents - netCents) > 5) {
    warnings.push(
      `Items minus discounts don't add up to the net amount (off by ${
        (itemSum - totalDiscountCents - netCents) / 100
      }).`,
    );
  }

  return {
    storeCode,
    storeName,
    billDate,
    billTime,
    transactionRef,
    items,
    discounts,
    totalDiscountCents,
    grossCents: grossCents ?? itemSum,
    netCents: netCents ?? itemSum - totalDiscountCents,
    warnings,
  };
}
