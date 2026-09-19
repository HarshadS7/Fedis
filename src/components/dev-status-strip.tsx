import type { ApiMode } from "@/lib/types";

export function DevStatusStrip({
  mode,
  chain,
  fetchedAt,
  durationMs,
  error,
}: {
  mode: ApiMode;
  chain: string;
  fetchedAt: string;
  durationMs: number;
  error?: string;
}) {
  return (
    <div className="rounded border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 text-xs text-[var(--ink-muted)]">
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
  );
}
