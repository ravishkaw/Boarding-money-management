/** All money is stored as integer cents (LKR x 100). */

export function toCents(rupees: number): number {
  return Math.round(rupees * 100);
}

export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[,\s]/g, "").replace(/^Rs\.?/i, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return toCents(Number(cleaned));
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const rupees = Math.floor(abs / 100);
  const decimals = String(abs % 100).padStart(2, "0");
  return `${sign}Rs. ${rupees.toLocaleString("en-LK")}.${decimals}`;
}

/** Compact form without the Rs. prefix, for table cells. */
export function formatCentsPlain(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const rupees = Math.floor(abs / 100);
  const decimals = String(abs % 100).padStart(2, "0");
  return `${sign}${rupees.toLocaleString("en-LK")}.${decimals}`;
}
