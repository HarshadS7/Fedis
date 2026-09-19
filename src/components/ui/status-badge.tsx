type StatusTone = "good" | "warning" | "serious" | "critical";

const toneStyles: Record<
  StatusTone,
  { color: string; symbol: string; label: string }
> = {
  good: {
    color: "var(--status-good)",
    symbol: "✓",
    label: "OK",
  },
  warning: {
    color: "var(--status-warning)",
    symbol: "!",
    label: "WARN",
  },
  serious: {
    color: "var(--status-serious)",
    symbol: "▲",
    label: "SLASHED",
  },
  critical: {
    color: "var(--status-critical)",
    symbol: "✕",
    label: "CRITICAL",
  },
};

export function StatusBadge({
  tone,
  label,
}: {
  tone: StatusTone;
  label?: string;
}) {
  const style = toneStyles[tone];
  const text = label ?? style.label;

  return (
    <span
      className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs"
      style={{
        color: style.color,
        borderColor: style.color,
      }}
    >
      <span aria-hidden="true">{style.symbol}</span>
      <span>{text}</span>
    </span>
  );
}
