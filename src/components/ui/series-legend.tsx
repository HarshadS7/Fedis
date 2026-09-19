export type LegendItem = {
  id: string;
  label: string;
  color: string;
};

export function SeriesLegend({ items }: { items: LegendItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-4 text-xs text-[var(--ink-secondary)]">
      {items.map((item) => (
        <div key={item.id} className="inline-flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: item.color }}
            aria-hidden
          />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
