import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Boarding",
  description: "Shared boarding expense tracker",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();

  return (
    <html lang="en">
      <body className={`${geist.className} antialiased`}>
        {session && (
          <nav className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
              <div className="flex items-center gap-4 text-sm font-medium">
                <Link href="/" className="text-base font-bold">
                  Boarding
                </Link>
                <Link href="/months" className="text-zinc-600 dark:text-zinc-400">
                  Months
                </Link>
                <Link
                  href="/aliases"
                  className="text-zinc-600 dark:text-zinc-400"
                >
                  Names
                </Link>
                <Link
                  href="/settings"
                  className="text-zinc-600 dark:text-zinc-400"
                >
                  Settings
                </Link>
              </div>
              <form action={logout}>
                <button
                  type="submit"
                  className="text-xs text-zinc-500"
                  title={session.name}
                >
                  {session.name.split(" ")[0]} · Sign out
                </button>
              </form>
            </div>
          </nav>
        )}
        <div className="mx-auto max-w-3xl px-4 py-6">{children}</div>
      </body>
    </html>
  );
}
