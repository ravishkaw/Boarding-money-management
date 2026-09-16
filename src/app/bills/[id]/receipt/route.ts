import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { getSession } from "@/lib/auth";

/**
 * The receipt exactly as Keells served it at import time, so a bill can be
 * checked against the source long after the e-bill link has expired.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return new NextResponse("unauthorized", { status: 401 });

  const { id } = await params;
  const bill = db
    .select({ rawHtml: schema.bills.rawHtml })
    .from(schema.bills)
    .where(eq(schema.bills.id, Number(id)))
    .get();
  if (!bill?.rawHtml)
    return new NextResponse("No receipt snapshot for this bill.", {
      status: 404,
    });

  // The receipt relies on Bootstrap (blocked below) for its white page, so
  // pin a light scheme or dark-mode browsers render black text on black.
  const html = bill.rawHtml.replace(
    /<head>/i,
    "<head><style>html{background:#fff;color:#000;color-scheme:light}</style>",
  );

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Third-party HTML: its scripts, CDN styles and trackers must never run
      // here. Inline styles are enough to keep the tables readable.
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
