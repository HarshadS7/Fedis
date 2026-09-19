export function StatTile({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded border border-[var(--border)] bg-[var(--surface-card)] p-4">
      <p className="text-sm text-[var(--ink-muted)]">{label}</p>
      <p className="mt-2 text-2xl text-[var(--ink-primary)]">{value}</p>
    </div>
  );
}
