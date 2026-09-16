"use client";

import Link from "next/link";

/**
 * Money-safety net: the settlement throws rather than show a wrong number
 * (credits ≠ cost, promotions > discount, personal item without an owner).
 * Say so plainly and point at the ledger check instead of a blank crash.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Something doesn&apos;t add up</h1>
      <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100">
        <p>
          The page stopped rather than show a number that might be wrong.
          Open <Link href="/settings" className="underline">Settings → Ledger check</Link>{" "}
          to see exactly which bill is at fault.
        </p>
        <p className="mt-2 font-mono text-xs opacity-80">{error.message}</p>
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
        >
          Home
        </Link>
      </div>
    </main>
  );
}
