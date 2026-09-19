"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { SeriesLegend } from "@/components/ui/series-legend";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatsRow, TerminalSection } from "@/components/ui/terminal-section";
import { WorkloadStripPlot } from "@/components/workload-strip-plot";
import { streamDemoFire } from "@/lib/api";
import { formatAddress } from "@/lib/format";
import type {
  BenchStreamState,
  BenchTxReceiptRow,
  BenchWorkloadSeries,
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

function streamBadge(state: BenchStreamState): { tone: "good" | "warning" | "serious"; label: string } | null {
  switch (state) {
    case "connecting":
      return { tone: "warning", label: "CONNECTING" };
    case "streaming":
      return { tone: "good", label: "STREAM LIVE" };
    case "done":
      return { tone: "good", label: "STREAM DONE" };
    case "error":
      return { tone: "serious", label: "STREAM ERROR" };
    default:
      return null;
  }
}

export function ParallelismPanel() {
  const [result, setResult] = useState<DemoFireResult | null>(null);
  const [streamState, setStreamState] = useState<BenchStreamState>("idle");
  const [stage, setStage] = useState<string | null>(null);
  const [txRows, setTxRows] = useState<BenchTxReceiptRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const closerRef = useRef<(() => void) | null>(null);

  const run = useCallback(() => {
    closerRef.current?.();
    setResult(null);
    setTxRows([]);
    setError(null);
    setStage(null);
    setStreamState("connecting");

    const { close } = streamDemoFire(50, {
      onState: setStreamState,
      onStage: setStage,
      onTx: (tx) => setTxRows((prev) => [...prev, tx]),
      onDone: (next) => setResult(next),
      onError: (message) => setError(message),
    });
    closerRef.current = close;
  }, []);

  const rows = useMemo(
    () => (result ? rowsFromResult(result) : []),
    [result],
  );

  const measured = result?.ourMeasurements ?? null;
  const loading = streamState === "connecting" || streamState === "streaming";
  const streamStatus = streamBadge(streamState);

  const stripSeries: BenchWorkloadSeries[] = useMemo(() => {
    if (measured?.transactions) {
      return [
        {
          label: "Independent",
          series: "series-1",
          points: measured.transactions.independent.map((p) => ({
            hash: p.hash,
            submittedAtMs: p.submittedAtMs,
            includedAtMs: p.includedAtMs,
            latest: p.latest,
            safe: p.safe,
            finalized: p.finalized,
          })),
        },
        {
          label: "Conflicting",
          series: "series-2",
          points: measured.transactions.conflicting.map((p) => ({
            hash: p.hash,
            submittedAtMs: p.submittedAtMs,
            includedAtMs: p.includedAtMs,
            latest: p.latest,
            safe: p.safe,
            finalized: p.finalized,
          })),
        },
      ];
    }

    return rows.map((row) => ({
      label: row.key === "independent" ? "Independent" : "Conflicting",
      series: row.series,
      points: txRows
        .filter((tx) => tx.workload.toLowerCase().includes(row.key))
        .map((tx) => ({
          hash: tx.hash,
          submittedAtMs: Date.now() - 100,
          includedAtMs: Date.now(),
          latest: tx.latest,
          safe: tx.safe,
          finalized: tx.finalized,
        })),
    }));
  }, [measured, rows, txRows]);

  const finalityCounts = useMemo(() => {
    const counts = { latest: 0, safe: 0, finalized: 0 };
    for (const tx of txRows) {
      if (tx.latest) counts.latest += 1;
      if (tx.safe) counts.safe += 1;
      if (tx.finalized) counts.finalized += 1;
    }
    return counts;
  }, [txRows]);

  const workloadColumns: DataTableColumn<WorkloadRow>[] = [
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
  ];

  const txColumns: DataTableColumn<BenchTxReceiptRow>[] = [
    {
      key: "workload",
      header: "Workload",
      render: (row) => row.workload,
    },
    {
      key: "hash",
      header: "Tx hash",
      render: (row) => (
        <a
          href={`https://explorer.monad.xyz/tx/${row.hash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs tabular-nums text-[var(--ink-secondary)] hover:text-[var(--accent)]"
        >
          {formatAddress(row.hash, 8, 6)}
        </a>
      ),
    },
    {
      key: "latest",
      header: "latest",
      align: "right",
      render: (row) => (row.latest ? "yes" : "no"),
    },
    {
      key: "safe",
      header: "safe",
      align: "right",
      render: (row) => (row.safe ? "yes" : "no"),
    },
    {
      key: "finalized",
      header: "finalized",
      align: "right",
      render: (row) => (row.finalized ? "yes" : "no"),
    },
  ];

  const totalReverts = rows.reduce((sum, row) => sum + row.reverts, 0);
  const totalTx = rows.reduce((sum, row) => sum + row.txCount, 0);

  return (
    <TerminalSection
      label="04"
      title="Monad parallelism benchmark"
      description="Independent agent workloads vs conflicting state contention — measured honestly, with latest, safe, and finalized reported separately."
    >
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => run()}
          disabled={loading}
          className="btn-primary"
        >
          {loading ? "Streaming…" : "Run benchmark stream (n=50)"}
        </button>
        {result?.simulated ? (
          <StatusBadge tone="warning" label="SIMULATED" />
        ) : null}
        {measured && !result?.simulated ? (
          <StatusBadge tone="good" label="MEASURED" />
        ) : null}
        {streamStatus ? (
          <StatusBadge tone={streamStatus.tone} label={streamStatus.label} />
        ) : null}
      </div>

      <SeriesLegend items={LEGEND} />

      {stage ? (
        <p className="mt-4 text-xs text-[var(--ink-muted)]">{stage}</p>
      ) : null}

      {(error || result?.error) && !rows.length ? (
        <p className="mt-4 text-sm text-[var(--status-warning)]">
          {error ?? result?.error}
        </p>
      ) : null}

      {result?.note ? (
        <p className="mt-4 text-xs text-[var(--ink-muted)]">{result.note}</p>
      ) : null}

      {rows.length > 0 || txRows.length > 0 ? (
        <>
          <div className="mt-8">
            <StatsRow
              items={[
                { label: "Total txs", value: totalTx.toLocaleString("en-US") },
                {
                  label: "Total reverts",
                  value: totalReverts.toLocaleString("en-US"),
                },
                {
                  label: "Independent p50",
                  value: measured
                    ? `${measured.independent.p50InclusionMs}ms`
                    : "—",
                },
                {
                  label: "Conflicting p50",
                  value: measured
                    ? `${measured.conflicting.p50InclusionMs}ms`
                    : "—",
                },
              ]}
            />
          </div>

          <div className="mt-8">
            <WorkloadStripPlot
              series={stripSeries}
              simulated={Boolean(result?.simulated || !measured)}
            />
          </div>

          <div className="mt-8 text-sm text-[var(--ink-muted)]">
            <p className="section-label mb-3">
              Block inclusion states (never collapsed into &quot;confirmed&quot;)
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              <p>
                <span className="text-[var(--ink-primary)]">latest</span>:{" "}
                {finalityCounts.latest}
              </p>
              <p>
                <span className="text-[var(--ink-primary)]">safe</span>:{" "}
                {finalityCounts.safe}
              </p>
              <p>
                <span className="text-[var(--ink-primary)]">finalized</span>:{" "}
                {finalityCounts.finalized}
              </p>
            </div>
          </div>

          <div className="mt-10">
            <p className="section-label mb-4">Workloads</p>
            <DataTable
              flat
              columns={workloadColumns}
              rows={rows}
              rowKey={(row) => row.key}
              emptyMessage="No workload rows."
            />
          </div>

          <div className="mt-10">
            <p className="section-label mb-4">Tx receipts ({txRows.length})</p>
            <DataTable
              flat
              columns={txColumns}
              rows={txRows}
              rowKey={(row) => row.key}
              emptyMessage="Streaming txs…"
            />
          </div>

          <div className="mt-10 text-sm leading-relaxed text-[var(--ink-muted)]">
            <p className="section-label mb-2">Monad published spec</p>
            <p>
              Block time: {result?.monadPublishedSpec?.blockTimeMs ?? 400}ms ·
              Finality: {result?.monadPublishedSpec?.finalityMs ?? 800}ms
              <span className="text-[var(--ink-muted)]"> (not our measurement)</span>
            </p>
            <p className="mt-2">
              Our measurements:{" "}
              {measured
                ? `recorded ${new Date(measured.measuredAt).toLocaleTimeString()} on ${measured.rpc}`
                : "streaming or simulated — run fire.mjs on :8547 for measured hashes"}
            </p>
            {measured?.note ? (
              <p className="mt-2 text-[var(--ink-secondary)]">{measured.note}</p>
            ) : null}
          </div>
        </>
      ) : !loading && !result ? (
        <p className="mt-4 text-sm text-[var(--ink-muted)]">
          Run the benchmark stream to compare independent vs conflicting workloads.
        </p>
      ) : null}
    </TerminalSection>
  );
}
