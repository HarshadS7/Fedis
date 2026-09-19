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
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--ink-muted)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>API mode: {mode}</span>
        <span aria-hidden="true">·</span>
        <span>Chain: {chain}</span>
        <span aria-hidden="true">·</span>
        <span>Last fetch: {new Date(fetchedAt).toLocaleTimeString()}</span>
        <span aria-hidden="true">·</span>
        <span>{durationMs}ms</span>
        {error ? (
          <>
            <span aria-hidden="true">·</span>
            <span className="text-[var(--status-warning)]">{error}</span>
          </>
        ) : null}
      </div>
      {onRefresh ? (
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="text-[var(--ink-secondary)] underline-offset-4 hover:text-[var(--ink-primary)] hover:underline disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      ) : null}
    </div>
  );
}
