import Link from "next/link";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full bg-[var(--surface-page)] text-[var(--ink-primary)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface-page)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <div>
            <Link
              href="/"
              className="text-lg font-medium tracking-[-0.02em] text-[var(--ink-primary)] hover:underline"
            >
              Fides
            </Link>
          </div>
          <nav className="hidden items-center gap-8 sm:flex">
            <Link
              href="/"
              className="text-sm text-[var(--ink-muted)] transition-colors hover:text-[var(--ink-primary)]"
            >
              Home
            </Link>
            <Link
              href="/#product"
              className="text-sm text-[var(--ink-muted)] transition-colors hover:text-[var(--ink-primary)]"
            >
              Product
            </Link>
            <span className="text-xs text-[var(--ink-muted)]">
              Monad · 400ms / 800ms
            </span>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        {children}
      </main>
    </div>
  );
}
