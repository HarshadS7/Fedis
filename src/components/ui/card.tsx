import type { ReactNode } from "react";

export function Card({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded border border-[var(--border)] bg-[var(--surface-card)] p-4 ${className}`}
    >
      {title ? (
        <h2 className="mb-3 text-sm text-[var(--ink-secondary)]">{title}</h2>
      ) : null}
      {children}
    </section>
  );
}
