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
  const height = series.length * 56 + 24;

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
          const yBase = 20 + rowIndex * 56;
          const points =
            row.points.length > 0
              ? row.points.map((p, i) => ({
                  x: ((p.includedAtMs - row.points[0].submittedAtMs) /
                    Math.max(
                      row.points[row.points.length - 1].includedAtMs -
                        row.points[0].submittedAtMs,
                      1,
                    )) *
                    (width - 48) +
                    24,
                  y: yBase,
                  hash: p.hash,
                }))
              : simulatedPoints(20, rowIndex * 13, 40).map((p) => ({
                  x: (p.x / 100) * (width - 48) + 24,
                  y: yBase,
                  hash: null,
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
                stroke="var(--gridline)"
                strokeWidth="2"
              />
              {points.map((p, i) => (
                <circle
                  key={`${row.series}-${i}`}
                  cx={p.x}
                  cy={p.y}
                  r="4"
                  fill={SERIES_COLOR[row.series] ?? "var(--ink-muted)"}
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
