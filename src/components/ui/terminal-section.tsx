import type { ReactNode } from "react";

export function TerminalDivider() {
  return <hr className="border-0 border-t border-[var(--border)]" />;
}

export function TerminalSection({
  label,
  title,
  description,
  children,
}: {
  label?: string;
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="py-12 first:pt-0 last:pb-0">
      {label ? <p className="section-label mb-2">{label}</p> : null}
      {title ? (
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-[var(--ink-primary)] sm:text-2xl">
          {title}
        </h2>
      ) : null}
      {description ? (
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--ink-muted)] sm:text-base">
          {description}
        </p>
      ) : null}
      <div className={title || description ? "mt-6" : ""}>{children}</div>
    </section>
  );
}

export function StatsRow({
  items,
}: {
  items: { label: string; value: string }[];
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-8 gap-y-8 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="section-label mb-2">{item.label}</dt>
          <dd className="text-2xl font-semibold tracking-[-0.02em] text-[var(--ink-primary)] sm:text-3xl">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
