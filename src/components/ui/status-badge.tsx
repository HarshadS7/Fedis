type StatusTone = "good" | "warning" | "serious" | "critical";

const toneStyles: Record<
  StatusTone,
  { color: string; bg: string; symbol: string; label: string }
> = {
  good: {
    color: "var(--status-good)",
    bg: "rgba(12, 163, 12, 0.08)",
    symbol: "✓",
    label: "OK",
  },
  warning: {
    color: "var(--status-warning)",
    bg: "rgba(184, 134, 11, 0.08)",
    symbol: "!",
    label: "WARN",
  },
  serious: {
    color: "var(--status-serious)",
    bg: "rgba(196, 92, 42, 0.08)",
    symbol: "▲",
    label: "SLASHED",
  },
  critical: {
    color: "var(--status-critical)",
    bg: "rgba(208, 59, 59, 0.08)",
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
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{
        color: style.color,
        background: style.bg,
      }}
    >
      <span aria-hidden="true">{style.symbol}</span>
      <span>{text}</span>
    </span>
  );
}
