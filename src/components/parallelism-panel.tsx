"use client";

import { useCallback, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { SeriesLegend } from "@/components/ui/series-legend";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkloadStripPlot } from "@/components/workload-strip-plot";
import { fetchDemoFire } from "@/lib/api";
import type { BenchWorkloadSeries } from "@/lib/types";
import type {
  DemoFireResult,
  DemoFireWorkload,
  WorkloadMeasurement,
} from "@/lib/types";

type WorkloadRow = {
  key: string;
  label: string;
  series: string;
  txCount: number;
  settled: number;
  reverts: number;
  p50InclusionMs: number | null;
  p95InclusionMs: number | null;
  txHash: string | null;
};

const SERIES_COLOR: Record<string, string> = {
  "series-1": "var(--series-1)",
  "series-2": "var(--series-2)",
};

const LEGEND = [
  { id: "independent", label: "Independent (N agents)", color: "var(--series-1)" },
  { id: "conflicting", label: "Conflicting (same agent)", color: "var(--series-2)" },
];

function measurementRow(
  key: string,
  label: string,
  series: string,
  m: WorkloadMeasurement,
): WorkloadRow {
  return {
    key,
    label,
    series,
    txCount: m.txCount,
    settled: m.settled,
    reverts: m.reverted,
    p50InclusionMs: m.p50InclusionMs,
    p95InclusionMs: m.p95InclusionMs,
    txHash: null,
  };
}

function simulatedRow(key: string, workload: DemoFireWorkload): WorkloadRow {
  return {
    key,
    label: workload.label,
    series: workload.series,
    txCount: workload.txCount,
    settled: workload.txCount - workload.reverts,
    reverts: workload.reverts,
    p50InclusionMs: null,
    p95InclusionMs: null,
    txHash: null,
  };
}

function rowsFromResult(result: DemoFireResult): WorkloadRow[] {
  const measured = result.ourMeasurements;
  if (measured) {
    return [
      measurementRow(
        "independent",
        "Independent (N agents, isolated storage)",
        "series-1",
        measured.independent,
      ),
      measurementRow(
        "conflicting",
        "Conflicting (N txs, same agent)",
        "series-2",
        measured.conflicting,
      ),
    ];
  }

  if (!result.workloads) return [];

  return [
    simulatedRow("independent", result.workloads.independent),
    simulatedRow("conflicting", result.workloads.conflicting),
  ];
}

export function ParallelismPanel() {
  const [result, setResult] = useState<DemoFireResult | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    const next = await fetchDemoFire(50);
    setResult(next);
    setLoading(false);
  }, []);

  const rows = useMemo(
    () => (result ? rowsFromResult(result) : []),
    [result],
  );

  const measured = result?.ourMeasurements ?? null;

  const columns: DataTableColumn<WorkloadRow>[] = [
    {
      key: "label",
      header: "Workload",
      render: (row) => (
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: SERIES_COLOR[row.series] ?? "var(--ink-muted)" }}
            aria-hidden
          />
          <span>{row.label}</span>
        </div>
      ),
    },
    {
      key: "txCount",
      header: "Tx count",
      align: "right",
      render: (row) => row.txCount.toLocaleString("en-US"),
    },
    {
      key: "settled",
      header: "Settled",
      align: "right",
      render: (row) => row.settled.toLocaleString("en-US"),
    },
    {
      key: "reverts",
      header: "Reverts",
      align: "right",
      render: (row) => row.reverts.toLocaleString("en-US"),
    },
    {
      key: "p50",
      header: "p50 inclusion",
      align: "right",
      render: (row) =>
        row.p50InclusionMs === null ? "—" : `${row.p50InclusionMs}ms`,
    },
    {
      key: "p95",
      header: "p95 inclusion",
      align: "right",
      render: (row) =>
        row.p95InclusionMs === null ? "—" : `${row.p95InclusionMs}ms`,
    },
    {
      key: "txHash",
      header: "Receipt",
      render: (row) =>
        row.txHash ? (
          <span className="font-mono text-xs tabular-nums">{row.txHash}</span>
        ) : (
          <span className="text-[var(--ink-muted)]">—</span>
        ),
    },
  ];

  const totalReverts = rows.reduce((sum, row) => sum + row.reverts, 0);
  const totalTx = rows.reduce((sum, row) => sum + row.txCount, 0);

  const stripSeries: BenchWorkloadSeries[] = rows.map((row) => ({
    label: row.key === "independent" ? "Independent" : "Conflicting",
    series: row.series,
    points: [],
  }));

  return (
    <Card title="Monad parallelism benchmark">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void run()}
          disabled={loading}
          className="rounded border border-[var(--border)] px-3 py-2 text-sm text-[var(--ink-primary)] disabled:opacity-50"
        >
          {loading ? "Running…" : "Run benchmark (n=50)"}
        </button>
        {result?.simulated ? (
          <StatusBadge tone="warning" label="SIMULATED" />
        ) : null}
        {measured ? <StatusBadge tone="good" label="MEASURED" /> : null}
        {loading ? <StatusBadge tone="warning" label="CONNECTING" /> : null}
      </div>

      <div className="mb-4">
        <SeriesLegend items={LEGEND} />
      </div>

      {result?.error && !result.workloads && !measured ? (
        <p className="mb-4 text-sm text-[var(--status-warning)]">{result.error}</p>
      ) : null}

      {result?.note ? (
        <p className="mb-4 text-xs text-[var(--ink-muted)]">{result.note}</p>
      ) : null}

      {rows.length > 0 ? (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Total txs" value={totalTx.toLocaleString("en-US")} />
            <StatTile
              label="Total reverts"
              value={totalReverts.toLocaleString("en-US")}
            />
            <StatTile
              label="Independent p50"
              value={
                measured
                  ? `${measured.independent.p50InclusionMs}ms`
                  : "—"
              }
            />
            <StatTile
              label="Conflicting p50"
              value={
                measured
                  ? `${measured.conflicting.p50InclusionMs}ms`
                  : "—"
              }
            />
          </div>

          <WorkloadStripPlot
            series={stripSeries}
            simulated={Boolean(result?.simulated || !measured)}
          />

          <div className="my-4 rounded border border-[var(--border)] p-3 text-xs text-[var(--ink-muted)]">
            <p className="mb-2 text-[var(--ink-secondary)]">
              Block inclusion states (reported separately — never collapsed into
              &quot;confirmed&quot;)
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              <p>
                <span className="text-[var(--ink-primary)]">latest</span> — tx
                included in head block
              </p>
              <p>
                <span className="text-[var(--ink-primary)]">safe</span> — unlikely
                to reorg under normal conditions
              </p>
              <p>
                <span className="text-[var(--ink-primary)]">finalized</span> —
                irreversible (Monad published finality: 800ms)
              </p>
            </div>
          </div>

          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.key}
            emptyMessage="No workload rows."
          />

          <div className="mt-4 rounded border border-[var(--border)] p-3 text-xs text-[var(--ink-muted)]">
            <p className="mb-1 text-[var(--ink-secondary)]">
              Monad published spec (not our measurement)
            </p>
            <p>
              Block time: {result?.monadPublishedSpec?.blockTimeMs ?? 400}ms ·
              Finality: {result?.monadPublishedSpec?.finalityMs ?? 800}ms
            </p>
            <p className="mt-2">
              Our measurements:{" "}
              {measured
                ? `recorded ${new Date(measured.measuredAt).toLocaleTimeString()} on ${measured.rpc}`
                : "none — benchmark not wired to chain yet"}
            </p>
            {measured?.note ? (
              <p className="mt-2 text-[var(--ink-secondary)]">{measured.note}</p>
            ) : null}
          </div>
        </>
      ) : !loading && !result ? (
        <p className="text-sm text-[var(--ink-secondary)]">
          Run the benchmark to compare independent vs conflicting workloads.
        </p>
      ) : null}
    </Card>
  );
}
