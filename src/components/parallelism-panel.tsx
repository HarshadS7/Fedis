"use client";

import { useCallback, useState } from "react";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { fetchDemoFire } from "@/lib/api";
import type { DemoFireResult, DemoFireWorkload } from "@/lib/types";

type WorkloadRow = DemoFireWorkload & { key: string };

const SERIES_COLOR: Record<string, string> = {
  "series-1": "var(--series-1)",
  "series-2": "var(--series-2)",
};

export function ParallelismPanel() {
  const [result, setResult] = useState<DemoFireResult | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    const next = await fetchDemoFire(50);
    setResult(next);
    setLoading(false);
  }, []);

  const rows: WorkloadRow[] = result?.workloads
    ? [
        { key: "independent", ...result.workloads.independent },
        { key: "conflicting", ...result.workloads.conflicting },
      ]
    : [];

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
      key: "agentsTouched",
      header: "Agents touched",
      align: "right",
      render: (row) => row.agentsTouched.toLocaleString("en-US"),
    },
    {
      key: "reverts",
      header: "Reverts",
      align: "right",
      render: (row) => row.reverts.toLocaleString("en-US"),
    },
  ];

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
        {result && !result.simulated && result.ourMeasurements ? (
          <StatusBadge tone="good" label="MEASURED" />
        ) : null}
      </div>

      {result?.error && !result.workloads ? (
        <p className="mb-4 text-sm text-[var(--status-warning)]">{result.error}</p>
      ) : null}

      {result?.note ? (
        <p className="mb-4 text-xs text-[var(--ink-muted)]">{result.note}</p>
      ) : null}

      {result?.workloads ? (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <StatTile
              label="Independent workload txs"
              value={result.workloads.independent.txCount.toLocaleString("en-US")}
            />
            <StatTile
              label="Conflicting workload txs"
              value={result.workloads.conflicting.txCount.toLocaleString("en-US")}
            />
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
              Block time: {result.monadPublishedSpec?.blockTimeMs ?? 400}ms ·
              Finality: {result.monadPublishedSpec?.finalityMs ?? 800}ms
            </p>
            <p className="mt-2">
              Our measurements:{" "}
              {result.ourMeasurements
                ? "available from live run"
                : "none — benchmark not wired to chain yet"}
            </p>
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
