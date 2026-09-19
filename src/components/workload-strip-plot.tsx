import type { BenchWorkloadSeries } from "@/lib/types";

const SERIES_COLOR: Record<string, string> = {
  "series-1": "var(--series-1)",
  "series-2": "var(--series-2)",
};

function simulatedPoints(
  count: number,
  offsetMs: number,
  spreadMs: number,
): { x: number; y: number }[] {
  if (count <= 0) return [];
  return Array.from({ length: Math.min(count, 50) }, (_, i) => ({
    x: (i / Math.max(count - 1, 1)) * 100,
    y: 20 + ((i * 7 + offsetMs) % spreadMs) / spreadMs * 60,
  }));
}

export function WorkloadStripPlot({
  series,
  simulated,
}: {
  series: BenchWorkloadSeries[];
  simulated: boolean;
}) {
  const width = 640;
  const rowHeight = 64;
  const height = series.length * rowHeight + 24;

  return (
    <div className="rounded border border-[var(--border)] bg-[var(--surface-card)] p-3">
      <p className="mb-3 text-xs text-[var(--ink-muted)]">
        Per-tx inclusion strip {simulated ? "(illustrative layout — not measured)" : "(measured)"}
      </p>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label="Workload inclusion strip plot"
      >
        {series.map((row, rowIndex) => {
          const yBase = 24 + rowIndex * rowHeight;
          const plotWidth = width - 48;
          const points =
            row.points.length > 0
              ? row.points.map((p) => {
                  const t0 = row.points[0].submittedAtMs;
                  const t1 =
                    row.points[row.points.length - 1].includedAtMs;
                  const span = Math.max(t1 - t0, 1);
                  return {
                    x: ((p.includedAtMs - t0) / span) * plotWidth + 24,
                    y: yBase,
                    hash: p.hash,
                    color: SERIES_COLOR[row.series] ?? "var(--ink-muted)",
                  };
                })
              : simulatedPoints(20, rowIndex * 13, 40).map((p, i) => ({
                  x: (p.x / 100) * plotWidth + 24,
                  y: yBase + (i % 2 === 0 ? -6 : 6),
                  hash: null,
                  color: SERIES_COLOR[row.series] ?? "var(--ink-muted)",
                }));

          return (
            <g key={row.series}>
              <text
                x={0}
                y={yBase + 4}
                fill="var(--ink-muted)"
                fontSize="10"
              >
                {row.label}
              </text>
              <line
                x1={24}
                y1={yBase}
                x2={width - 24}
                y2={yBase}
                className="chart-track"
              />
              {Array.from({ length: 5 }).map((_, i) => (
                <line
                  key={`grid-${row.series}-${i}`}
                  x1={24 + (plotWidth / 4) * i}
                  y1={yBase - 12}
                  x2={24 + (plotWidth / 4) * i}
                  y2={yBase + 12}
                  className="chart-grid"
                  opacity="0.35"
                />
              ))}
              {points.map((p, i) => (
                <circle
                  key={`${row.series}-${i}`}
                  cx={p.x}
                  cy={p.y}
                  className="chart-mark"
                  fill={p.color}
                  stroke="var(--surface-card)"
                  strokeWidth="2"
                >
                  {p.hash ? <title>{p.hash}</title> : null}
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
