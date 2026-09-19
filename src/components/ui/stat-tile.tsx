export function StatTile({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="surface-card rounded-xl p-5">
      <p className="text-sm text-[var(--ink-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-medium tracking-[-0.02em] text-[var(--ink-primary)]">
        {value}
      </p>
    </div>
  );
}
