"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAudioStore } from "@/lib/store";

const navLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/capture", label: "Capture" },
  { href: "/ideas", label: "Ideas" },
  { href: "/evolution", label: "Evolution" },
];

export default function Navbar() {
  const pathname = usePathname();
  const isListening = useAudioStore((s) => s.isListening);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4 sm:px-6">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 rounded-[1.75rem] border border-[rgba(68,54,40,0.1)] bg-[rgba(255,250,240,0.8)] px-4 py-3 shadow-[0_18px_40px_rgba(55,33,11,0.08)] backdrop-blur-xl">
        <Link href="/" className="flex shrink-0 items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[linear-gradient(135deg,#CFECF3,#CFECF3)] text-xl font-bold text-[var(--text)]">
            🎵
          </div>
          <div>
            <p className="font-[family-name:var(--font-display)] text-2xl leading-none tracking-[-0.04em]">
              Dhwanix
            </p>
            <p className="mt-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[var(--soft)]">
              idea archive
            </p>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 rounded-full border border-[rgba(68,54,40,0.08)] bg-[rgba(255,252,247,0.78)] p-1 md:flex">
          {navLinks.map((link) => {
            const isActive =
              link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                  isActive
                    ? "bg-[rgba(207,236,243,0.85)] text-[var(--text)] shadow-[0_2px_8px_rgba(55,33,11,0.04)]"
                    : "text-[var(--muted)] hover:bg-[rgba(207,236,243,0.45)] hover:text-[var(--text)]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          {isListening ? (
            <div className="hidden items-center gap-2 rounded-full border border-[rgba(96,113,76,0.18)] bg-[rgba(96,113,76,0.1)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-olive)] sm:flex">
              <span className="h-2 w-2 rounded-full bg-[var(--accent-olive)] animate-pulse" />
              listening
            </div>
          ) : null}

          <Link href="/capture" className="button-primary px-5 py-3">
            Open capture
          </Link>
        </div>
      </div>

      <nav className="mx-auto mt-3 flex max-w-7xl gap-2 overflow-x-auto px-1 pb-1 md:hidden">
        {navLinks.map((link) => {
          const isActive =
            link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold ${
                isActive
                  ? "border-[rgba(207,236,243,0.9)] bg-[rgba(207,236,243,0.85)] text-[var(--text)] shadow-[0_2px_8px_rgba(55,33,11,0.04)]"
                  : "border-[rgba(68,54,40,0.08)] bg-[rgba(255,252,247,0.7)] text-[var(--muted)]"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
