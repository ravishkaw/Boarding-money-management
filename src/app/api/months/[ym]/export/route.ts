import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getMonth,
  listBillsForMonth,
  listPersons,
  parseYmSlug,
  settleMonth,
} from "@/lib/data";
import { buildMonthWorkbook } from "@/lib/export/xlsx";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ym: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { ym } = await params;
  const parsed = parseYmSlug(ym);
  if (!parsed) return NextResponse.json({ error: "bad month" }, { status: 400 });
  const month = getMonth(parsed.year, parsed.month);
  if (!month) return NextResponse.json({ error: "not found" }, { status: 404 });

  const persons = listPersons();
  const settlement = settleMonth(month, persons);
  const bills = listBillsForMonth(month.id);
  const buffer = await buildMonthWorkbook(month, persons, settlement, bills);

  return new NextResponse(buffer as unknown as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Boarding-${ym}.xlsx"`,
    },
  });
}
