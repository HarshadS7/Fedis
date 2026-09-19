import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full bg-[var(--surface-page)] text-[var(--ink-primary)]">
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-base text-[var(--ink-primary)]">Fides</p>
            <p className="text-sm text-[var(--ink-muted)]">
              Agent Risk Terminal
            </p>
          </div>
          <p className="text-xs text-[var(--ink-muted)]">
            Monad · 400ms blocks / 800ms finality (published spec)
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
