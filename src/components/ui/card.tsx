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
    <section className={`surface-card rounded-xl p-5 sm:p-6 ${className}`}>
      {title ? (
        <h2 className="mb-4 text-sm font-medium tracking-[-0.01em] text-[var(--ink-secondary)]">
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}
