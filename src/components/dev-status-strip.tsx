import type { ApiMode } from "@/lib/types";

export function DevStatusStrip({
  mode,
  chain,
  fetchedAt,
  durationMs,
  error,
  onRefresh,
  refreshing,
}: {
  mode: ApiMode;
  chain: string;
  fetchedAt: string;
  durationMs: number;
  error?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 text-xs text-[var(--ink-muted)]">
      <div>
      <span>API mode: {mode}</span>
      <span className="mx-2 text-[var(--baseline)]">|</span>
      <span>Chain: {chain}</span>
      <span className="mx-2 text-[var(--baseline)]">|</span>
      <span>Last fetch: {new Date(fetchedAt).toLocaleTimeString()}</span>
      <span className="mx-2 text-[var(--baseline)]">|</span>
      <span>{durationMs}ms</span>
      {error ? (
        <>
          <span className="mx-2 text-[var(--baseline)]">|</span>
          <span className="text-[var(--status-warning)]">{error}</span>
        </>
      ) : null}
      </div>
      {onRefresh ? (
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="rounded border border-[var(--border)] px-2 py-1 text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      ) : null}
    </div>
  );
}
